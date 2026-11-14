// HMAC-SHA256 helpers (Node crypto).
// The platform signs turn envelopes (and preflight probes) with
// HMAC-SHA256 over the RAW request body using the platform-generated
// AGENT_GAMES_HMAC_SECRET, sent as the `x-agent-games-signature` header.
// Every agent response is signed the same way over the raw response body
// (see signResponseBody in this file).
// NOTE: the starter prompt says "viem for HMAC", but viem has no HMAC
// primitive — Node's crypto is the correct tool; viem is used for keccak256
// and hex encoding (see publicInputs.ts / matchId.ts).
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-agent-games-signature";

/** Compute HMAC-SHA256 of `body` with `secret`, returned as 0x-prefixed hex. */
export function signHmac(secret: string, body: Buffer | string): string {
  const data = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return "0x" + createHmac("sha256", secret).update(data).digest("hex");
}

/** Verify an incoming `x-agent-games-signature` value against the raw body.
 *  Accepts "0x"-prefixed hex, bare hex, or base64 (the platform's exact
 *  header encoding is not documented; all three are tried). */
export function verifyHmac(
  secret: string,
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
): boolean {
  if (!signatureHeader) return false;
  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const candidates: Buffer[] = [];
  const trimmed = header.trim();
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) candidates.push(Buffer.from(hex, "hex"));
  try {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === 32) candidates.push(b64);
  } catch {
    // not base64 — ignore
  }
  return candidates.some(
    (c) => c.length === expected.length && timingSafeEqual(c, expected),
  );
}

/** Canonical JSON for response signing: JSON.stringify of the response object
 *  WITHOUT the `signature` field, keys in insertion order.
 *  Assumption: the platform verifies the signature by re-serializing the
 *  received body with the `signature` field removed (the only non-circular
 *  reading — a signature over a body that already contains the signature
 *  cannot be recomputed). If the platform instead expects the HMAC over the
 *  body with `signature` set to "" or "0x", this must be adjusted after the
 *  first real preflight/practice dispatch. See README "Open validation". */
export function canonicalResponseJson(responseWithoutSignature: Record<string, unknown>): string {
  return JSON.stringify(responseWithoutSignature);
}

/** Sign a turn response: returns the HMAC (0x hex) over the canonical JSON
 *  of the response excluding the `signature` field. */
export function signResponseBody(
  secret: string,
  responseWithoutSignature: Record<string, unknown>,
): string {
  return signHmac(secret, canonicalResponseJson(responseWithoutSignature));
}
