// RYZ — Steal the VFY agent (Agent Games, zkVerify), practice mode.
// Express server: POST /agent (turn envelopes + preflight), GET /health.
// - Verifies HMAC-SHA256 (x-agent-games-signature) over the raw request body
//   before any decision logic; 401 on missing/invalid signature.
// - decideTurn is pure (see steal.ts); every turn gets a fresh Groth16 proof.
// - Fail closed: on timeout/internal error, answer HOLD.
// - Never logs the HMAC secret, the raw body, or the full envelope.
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  HMAC_SECRET,
  PORT,
  PROTOCOL_VERSION,
  STRATEGY_PARAMS,
  VK_HASH,
} from "./config.js";
import {
  SIGNATURE_HEADER,
  signHmac,
  signResponseBody,
  verifyHmac,
} from "./hmac.js";
import { decideTurn, processTurn } from "./steal.js";
import { getCommitmentHex } from "./policy.js";
import { verifyProofLocally } from "./zkverify.js";
import type { TurnEnvelope } from "./types.js";

const app = express();

// Capture the raw body before JSON parsing (needed for HMAC verification).
app.use(
  express.json({
    limit: "1mb",
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as any).rawBody = buf;
    },
  }),
);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("x-agent", "RYZ");
  next();
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, protocolVersion: PROTOCOL_VERSION });
});

app.get("/", (_req: Request, res: Response) => {
  res.json({
    agent: "RYZ",
    event: "steal-the-vfy",
    mode: "practice",
    protocolVersion: PROTOCOL_VERSION,
  });
});

function isPreflight(body: any): boolean {
  return body && body.type === "agent-games.preflight.v1";
}

function isTurnEnvelope(body: any): body is TurnEnvelope {
  return (
    body &&
    typeof body.matchId === "string" &&
    typeof body.turn === "number" &&
    body.state &&
    body.state.self &&
    typeof body.state.self.balance === "number" &&
    body.state.opponent &&
    typeof body.state.opponent.balance === "number"
  );
}

app.post("/agent", async (req: Request, res: Response) => {
  const rawBody: Buffer = (req as any).rawBody ?? Buffer.from("{}");
  const body: any = req.body ?? {};
  const signatureHeader = req.headers[SIGNATURE_HEADER];

  // --- Preflight: liveness probe. Reply {ok:true, protocolVersion:"v1"}
  // signed. If the platform sent a signature, verify it (401 on mismatch);
  // if it sent none, still answer — a preflight is a liveness check and the
  // reply itself is signed. ---
  if (isPreflight(body)) {
    if (signatureHeader && !verifyHmac(HMAC_SECRET, rawBody, signatureHeader)) {
      console.warn("[agent] preflight with INVALID signature — rejecting");
      return res.status(401).json({ ok: false, error: "invalid signature" });
    }
    const reply = { ok: true, protocolVersion: PROTOCOL_VERSION };
    const replyRaw = JSON.stringify(reply);
    res.setHeader(SIGNATURE_HEADER, signHmac(HMAC_SECRET, replyRaw));
    console.log(
      `[agent] preflight ok (agent_id=${body.agent_id ?? "?"}, challenge=${body.challenge ?? "?"})`,
    );
    return res.json(reply);
  }

  // --- Turn envelope: HMAC is mandatory. ---
  if (!verifyHmac(HMAC_SECRET, rawBody, signatureHeader)) {
    console.warn("[agent] turn envelope with missing/invalid signature — 401");
    return res.status(401).json({ ok: false, error: "invalid signature" });
  }
  if (!isTurnEnvelope(body)) {
    console.warn("[agent] malformed turn envelope — 400");
    return res.status(400).json({ ok: false, error: "malformed envelope" });
  }

  const envelope = body as TurnEnvelope;
  const t0 = Date.now();
  try {
    if (envelope.deadline) {
      const deadlineMs = Date.parse(envelope.deadline);
      if (Number.isFinite(deadlineMs) && deadlineMs < Date.now()) {
        console.warn(
          `[agent] turn ${envelope.turn} deadline already passed (${envelope.deadline}) — still answering`,
        );
      }
    }

    const result = await processTurn(envelope);

    // Local re-verification before answering (cheap: ~0.1s).
    const ok = await verifyProofLocally(
      result.response.policyProof.proof,
      result.response.policyProof.publicSignals,
    );
    if (!ok) {
      throw new Error("local proof verification failed — refusing to send a bad proof");
    }

    const signature = signResponseBody(HMAC_SECRET, result.response as any);
    const full = { ...result.response, signature };
    res.setHeader(SIGNATURE_HEADER, signature);
    const totalMs = Date.now() - t0;
    console.log(
      `[agent] match=${envelope.matchId} turn=${envelope.turn} ` +
        `decision=${result.decision.type}${result.decision.type === "EXTRACT" ? " " + result.decision.amount : ""} ` +
        `(${result.decision.reason}) proving=${result.provingMs}ms total=${totalMs}ms`,
    );
    return res.json(full);
  } catch (err: any) {
    // Fail closed: answer HOLD. The HOLD proof itself may be unsatisfiable
    // in this state (the circuit only allows HOLD when opp<=p2 or p3=1), so
    // if proving HOLD also fails, send the HOLD response with a null proof
    // and log loudly — the platform will reject the turn, but the agent
    // never crashes and never plays an unproven move.
    console.error(
      `[agent] ERROR processing match=${envelope.matchId} turn=${envelope.turn}: ${err?.message ?? err}`,
    );
    const fallback: any = {
      matchId: envelope.matchId,
      turn: envelope.turn,
      action: { type: "HOLD" },
      policyProof: null,
      idempotencyKey: `${envelope.matchId}:${envelope.turn}`,
    };
    try {
      const forced = decideTurn(
        envelope.state.self.balance,
        envelope.state.opponent.balance,
      );
      void forced; // decision is logged above; fallback stays HOLD by design
    } catch {
      // ignore
    }
    const signature = signResponseBody(HMAC_SECRET, fallback);
    const full = { ...fallback, signature };
    res.setHeader(SIGNATURE_HEADER, signature);
    return res.json(full);
  }
});

// JSON parse errors (malformed body) -> 400, never a crash.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ ok: false, error: "invalid JSON" });
  }
  console.error("[agent] unexpected error:", err?.message ?? err);
  return res.status(500).json({ ok: false, error: "internal error" });
});

async function main(): Promise<void> {
  const commitmentHex = await getCommitmentHex();
  console.log("=== RYZ — Steal the VFY agent (practice mode) ===");
  console.log(`strategyParams : [${STRATEGY_PARAMS.join(", ")}]`);
  console.log(`commitment     : ${commitmentHex}`);
  console.log(`                (register this value on the dashboard)`);
  console.log(`vkHash         : ${VK_HASH}`);
  console.log(`listening      : http://0.0.0.0:${PORT}  (POST /agent, GET /health)`);
  app.listen(PORT, "0.0.0.0");
}

main().catch((err) => {
  console.error("[agent] fatal startup error:", err);
  process.exit(1);
});
