// End-to-end test for the RYZ Steal-the-VFY agent.
// Spawns the built server (dist/index.js) on a test port with a TEST HMAC
// secret and a TEST salt, then exercises:
//   - GET /health
//   - preflight (signed + unsigned)
//   - turn envelopes for all three decision branches (EXTRACT / FORTIFY / HOLD)
//   - invalid/missing HMAC -> 401, malformed envelope -> 400
//   - response format (amount present ONLY for EXTRACT)
//   - publicInputsHash vs an INDEPENDENT recomputation (viem, written here)
//   - proof vs snarkjs verify (independent of the server's verify path)
//   - publicSignals[0] == Poseidon(matchId, turn, version) (independent)
//   - publicSignals[1] == Poseidon(strategyParams, salt) (independent)
//   - response HMAC signature (header + body field) vs independent HMAC
//   - proving time + total response time
// Exits 0 only if every check passes. Usage: npm test  (or node scripts/test-agent.mjs)
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
import { keccak256, concat, toHex } from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = 18091;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_SECRET = "test-secret-123";
const TEST_SALT = "999999";
const PARAMS = ["10", "30", "10", "0", "0", "0", "0", "0"];
const VK_HASH = "0x6c56509f1c56fd1fd4e9737f906d2220f4b95f1d507f1adf6899085bd74be047";

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name} ${extra}`); }
}
function hmacHex(secret, raw) {
  return "0x" + createHmac("sha256", secret).update(raw).digest("hex");
}
function to32(x) { return toHex(BigInt(x), { size: 32 }); }
function fieldHex(dec) { return "0x" + BigInt(dec).toString(16).padStart(64, "0"); }

// ---------- start server ----------
const server = spawn("node", ["dist/index.js"], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(PORT),
    AGENT_GAMES_HMAC_SECRET: TEST_SECRET,
    STRATEGY_SALT: TEST_SALT,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d.toString(); });
server.stderr.on("data", (d) => { serverLog += d.toString(); });
const cleanup = () => { try { server.kill("SIGTERM"); } catch { /* already dead */ } };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

async function waitHealth(timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function postAgent(bodyObj, { sign = true, secret = TEST_SECRET } = {}) {
  const raw = JSON.stringify(bodyObj);
  const headers = { "content-type": "application/json" };
  if (sign) headers["x-agent-games-signature"] = hmacHex(secret, raw);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/agent`, { method: "POST", headers, body: raw });
  const ms = Date.now() - t0;
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, ms, headersOut: res.headers };
}

function makeEnvelope(overrides = {}) {
  return {
    protocolVersion: "v1",
    eventId: "steal-the-vfy",
    mode: "competition",
    matchId: "222222",
    turn: 3,
    deadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    nonce: "n_test001",
    state: {
      self: { balance: 100, fortifyActive: 0 },
      opponent: { balance: 64, fortifyActive: 0 },
    },
    policyHash: "0x" + "ab".repeat(32),
    circuitVersion: "vfy-policy-v1",
    policyProof: {
      policyHash: "0x" + "ab".repeat(32),
      publicInputsHash: "0x" + "00".repeat(32),
      vkHash: VK_HASH,
      turn: 3,
      matchIdHash: "0x" + "cd".repeat(32),
    },
    ...overrides,
  };
}

// Independent publicInputsHash (prompt encoding, prompt actionCode table).
function independentPublicInputsHash({ policyHash, matchIdHash, turn, selfBalance, opponentBalance, selfFortify, opponentFortify, actionCode, amount }) {
  const packed = concat([
    to32(policyHash), to32(matchIdHash), to32(turn), to32(selfBalance),
    to32(opponentBalance), to32(selfFortify), to32(opponentFortify),
    to32(actionCode), to32(amount),
  ]);
  return keccak256(packed);
}
const PROMPT_ACTION_CODE = { HOLD: 0, EXTRACT: 1, FORTIFY: 2 };

async function main() {
  console.log("== RYZ agent end-to-end test ==");
  const up = await waitHealth();
  check("server starts and /health responds", up);
  if (!up) { console.log(serverLog); process.exit(1); }

  // 1) GET /health
  {
    const r = await fetch(`${BASE}/health`);
    const j = await r.json();
    check("GET /health -> {ok:true, protocolVersion:'v1'}", r.ok && j.ok === true && j.protocolVersion === "v1");
  }

  // 2) Preflight (signed)
  {
    const pf = { type: "agent-games.preflight.v1", agent_id: "ag_test", timestamp: 1730000000, challenge: "preflight_test001" };
    const raw = JSON.stringify(pf);
    const res = await fetch(`${BASE}/agent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-games-signature": hmacHex(TEST_SECRET, raw) },
      body: raw,
    });
    const j = await res.json();
    const sig = res.headers.get("x-agent-games-signature");
    const bodyRaw = JSON.stringify(j);
    check("preflight (signed) -> {ok:true, protocolVersion:'v1'}", res.ok && j.ok === true && j.protocolVersion === "v1");
    check("preflight reply carries valid HMAC header", sig === hmacHex(TEST_SECRET, bodyRaw), `got ${sig}`);
  }

  // 3) Preflight (unsigned) — liveness probe is still answered
  {
    const pf = { type: "agent-games.preflight.v1", agent_id: "ag_test", timestamp: 1730000000, challenge: "preflight_test002" };
    const res = await fetch(`${BASE}/agent`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pf),
    });
    const j = await res.json();
    check("preflight (unsigned) still answered (liveness)", res.ok && j.ok === true);
  }

  // 4) Independent Poseidon references
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const poseidonDec = (inputs) => F.toString(poseidon(inputs.map((x) => BigInt(x))));
  const expectedCommitment = poseidonDec([...PARAMS, TEST_SALT]);
  const expectedCommitmentHex = fieldHex(expectedCommitment);
  check("server startup log prints the expected commitment", serverLog.includes(expectedCommitmentHex), `expected ${expectedCommitmentHex}`);

  const vk = JSON.parse(fs.readFileSync(path.join(ROOT, "circuits", "vfy-policy.vkey.json"), "utf8"));

  // 5) Turn envelopes — one per decision branch
  const cases = [
    { name: "EXTRACT branch (self=100, opp=64)", self: 100, opp: 64, expectType: "EXTRACT", expectAmount: 10, circuitAction: 2 },
    { name: "FORTIFY branch (self=20, opp=64)", self: 20, opp: 64, expectType: "FORTIFY", expectAmount: undefined, circuitAction: 1 },
    { name: "HOLD branch (self=100, opp=5)", self: 100, opp: 5, expectType: "HOLD", expectAmount: undefined, circuitAction: 0 },
    { name: "HOLD branch opp=0 (self=100, opp=0)", self: 100, opp: 0, expectType: "HOLD", expectAmount: undefined, circuitAction: 0 },
    { name: "FORTIFY priority (self=20, opp=5)", self: 20, opp: 5, expectType: "FORTIFY", expectAmount: undefined, circuitAction: 1 },
  ];
  for (const c of cases) {
    console.log(`-- ${c.name}`);
    const env = makeEnvelope({
      state: { self: { balance: c.self, fortifyActive: 0 }, opponent: { balance: c.opp, fortifyActive: 0 } },
      turn: 3,
    });
    const { status, json, ms, headersOut } = await postAgent(env);
    check(`${c.name}: HTTP 200`, status === 200, `status=${status} body=${JSON.stringify(json)?.slice(0, 200)}`);
    if (status !== 200 || !json) continue;
    check(`${c.name}: matchId/turn echoed`, json.matchId === env.matchId && json.turn === env.turn);
    check(`${c.name}: action.type == ${c.expectType}`, json.action?.type === c.expectType, `got ${json.action?.type}`);
    if (c.expectType === "EXTRACT") {
      check(`${c.name}: amount present == ${c.expectAmount}`, json.action?.amount === c.expectAmount, `got ${json.action?.amount}`);
    } else {
      check(`${c.name}: amount OMITTED for ${c.expectType}`, !("amount" in (json.action || {})), `got ${JSON.stringify(json.action)}`);
    }
    check(`${c.name}: idempotencyKey == matchId:turn`, json.idempotencyKey === `${env.matchId}:${env.turn}`);
    const pp = json.policyProof;
    if (!pp) {
      check(`${c.name}: policyProof present (not the fail-closed null)`, false, `got policyProof=${JSON.stringify(pp)}`);
      continue;
    }
    check(`${c.name}: policyProof.circuitVersion`, pp?.circuitVersion === "vfy-policy-v1");
    check(`${c.name}: policyProof.vkHash`, pp?.vkHash === VK_HASH);
    check(`${c.name}: policyProof.policyHash echoed`, pp?.policyHash === env.policyHash);
    check(`${c.name}: policyProof.matchIdHash echoed from envelope`, pp?.matchIdHash === env.policyProof.matchIdHash);
    check(`${c.name}: 9 publicSignals`, Array.isArray(pp?.publicSignals) && pp.publicSignals.length === 9, `got ${pp?.publicSignals?.length}`);
    // publicSignals[0] == Poseidon(matchId, turn, version) — independent
    const expectedMatchHash = fieldHex(poseidonDec(["222222", "3", "1"]));
    check(`${c.name}: publicSignals[0] == Poseidon(matchId,turn,version)`, pp?.publicSignals?.[0]?.toLowerCase() === expectedMatchHash.toLowerCase(), `got ${pp?.publicSignals?.[0]}`);
    // publicSignals[1] == commitment — independent
    check(`${c.name}: publicSignals[1] == Poseidon(params,salt)`, pp?.publicSignals?.[1]?.toLowerCase() === expectedCommitmentHex.toLowerCase());
    // publicSignals[2..8] echo the turn inputs
    const ps = pp?.publicSignals || [];
    const dec = (h) => BigInt(h).toString();
    check(`${c.name}: publicSignals[2..8] == matchId,turn,self,opp,action,amount,version`,
      dec(ps[2]) === "222222" && dec(ps[3]) === "3" && dec(ps[4]) === String(c.self) &&
      dec(ps[5]) === String(c.opp) && dec(ps[6]) === String(c.circuitAction) &&
      dec(ps[7]) === String(c.expectAmount ?? 0) && dec(ps[8]) === "1",
      `got [${ps.slice(2).map(dec).join(",")}]`);
    // publicInputsHash — independent recomputation
    const expectedPih = independentPublicInputsHash({
      policyHash: env.policyHash,
      matchIdHash: env.policyProof.matchIdHash,
      turn: 3, selfBalance: c.self, opponentBalance: c.opp,
      selfFortify: 0, opponentFortify: 0,
      actionCode: PROMPT_ACTION_CODE[c.expectType],
      amount: c.expectType === "EXTRACT" ? c.expectAmount : 0,
    });
    check(`${c.name}: publicInputsHash matches independent computation`, pp?.publicInputsHash?.toLowerCase() === expectedPih.toLowerCase(), `got ${pp?.publicInputsHash} want ${expectedPih}`);
    // proof verifies with snarkjs (independent path)
    try {
      const proofSnark = {
        pi_a: [dec(pp.proof.pi_a[0]), dec(pp.proof.pi_a[1]), "1"],
        pi_b: [
          [dec(pp.proof.pi_b[0][0]), dec(pp.proof.pi_b[0][1])],
          [dec(pp.proof.pi_b[1][0]), dec(pp.proof.pi_b[1][1])],
          ["1", "0"],
        ],
        pi_c: [dec(pp.proof.pi_c[0]), dec(pp.proof.pi_c[1]), "1"],
        protocol: "groth16", curve: "bn128",
      };
      const okVerify = await snarkjs.groth16.verify(vk, pp.publicSignals.map(dec), proofSnark);
      check(`${c.name}: proof passes snarkjs groth16 verify`, okVerify === true);
    } catch (e) {
      check(`${c.name}: proof passes snarkjs groth16 verify`, false, String(e).slice(0, 120));
    }
    // response signature (header + body field) — independent HMAC
    const sigHeader = headersOut.get("x-agent-games-signature");
    const { signature, ...withoutSig } = json;
    const expectedSig = hmacHex(TEST_SECRET, JSON.stringify(withoutSig));
    check(`${c.name}: body signature == HMAC(canonical body w/o signature)`, signature === expectedSig, `got ${signature} want ${expectedSig}`);
    check(`${c.name}: header signature == body signature`, sigHeader === signature, `header=${sigHeader}`);
    console.log(`    (response time ${ms} ms)`);
  }

  // 6) UUID matchId exercises the keccak conversion path (proof must still verify)
  {
    console.log("-- UUID matchId (keccak conversion path)");
    const env = makeEnvelope({
      matchId: "9f4e1b2a-1111-2222-3333-444455556666",
      state: { self: { balance: 100, fortifyActive: 0 }, opponent: { balance: 64, fortifyActive: 0 } },
      turn: 7,
    });
    const { status, json } = await postAgent(env);
    check("UUID matchId: HTTP 200", status === 200, `status=${status}`);
    if (json?.policyProof) {
      const pp = json.policyProof;
      const uuidField = BigInt(keccak256("0x" + Buffer.from(env.matchId, "utf8").toString("hex"))) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
      const expectedMatchHash = fieldHex(poseidonDec([uuidField.toString(), "7", "1"]));
      check("UUID matchId: publicSignals[0] == Poseidon(keccak(uuid),turn,version)", pp.publicSignals[0].toLowerCase() === expectedMatchHash.toLowerCase(), `got ${pp.publicSignals[0]}`);
      const dec = (h) => BigInt(h).toString();
      const proofSnark = {
        pi_a: [dec(pp.proof.pi_a[0]), dec(pp.proof.pi_a[1]), "1"],
        pi_b: [[dec(pp.proof.pi_b[0][0]), dec(pp.proof.pi_b[0][1])], [dec(pp.proof.pi_b[1][0]), dec(pp.proof.pi_b[1][1])], ["1", "0"]],
        pi_c: [dec(pp.proof.pi_c[0]), dec(pp.proof.pi_c[1]), "1"],
        protocol: "groth16", curve: "bn128",
      };
      const okVerify = await snarkjs.groth16.verify(vk, pp.publicSignals.map(dec), proofSnark);
      check("UUID matchId: proof passes snarkjs verify", okVerify === true);
    }
  }

  // 7) Auth failures
  {
    const env = makeEnvelope();
    const bad = await postAgent(env, { secret: "wrong-secret" });
    check("wrong HMAC secret -> 401", bad.status === 401, `status=${bad.status}`);
    const missing = await postAgent(env, { sign: false });
    check("missing signature -> 401", missing.status === 401, `status=${missing.status}`);
    const malformed = await postAgent({ hello: "world" });
    check("malformed envelope -> 400", malformed.status === 400, `status=${malformed.status}`);
  }

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
  if (failures.length) console.log("Failed checks:\n- " + failures.join("\n- "));
  cleanup();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("test harness error:", e); cleanup(); process.exit(1); });
