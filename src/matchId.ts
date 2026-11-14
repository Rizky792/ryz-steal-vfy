// matchId handling: convert the platform's matchId into the field element
// the vfy-policy circuit expects, and compute the circuit's first public
// signal, publicSignals[0] = Poseidon(matchId, turnNumber, circuitVersion).
//
// VERIFIED (empirical, against the real wasm+zkey):
//   publicSignals[0] = Poseidon([matchId, turnNumber, circuitVersion])
//   publicSignals[1] = commitment = Poseidon(strategyParams[8], salt)
//   publicSignals[2..8] = matchId, turnNumber, selfBalance, opponentBalance,
//                          action, amount, circuitVersion  (in that order)
//
// OPEN ASSUMPTION — UUID -> field element:
// The platform's matchId is a UUID string ("9f4e1b2a-..."), but the circuit
// takes a single field element. The platform's conversion is NOT documented.
// This module uses keccak256(UTF-8 bytes of the UUID) mod p as the default
// conversion. Alternatives (all untested against the platform):
//   (a) BigInt("0x" + uuid.replace(/-/g, "")) mod p   (UUID as a 128-bit int)
//   (b) Poseidon over the UUID bytes
//   (c) the platform may send a numeric matchId in a field we have not seen.
// The FIRST real practice envelope settles this: the envelope carries
// matchIdHash, and whichever conversion reproduces
// Poseidon(matchIdField, turn, version) == matchIdHash (as a field element)
// is the right one. Until then, numeric matchIds (tests) are used as-is and
// UUIDs use the keccak256 default. See README "Open validation".
import { buildPoseidon } from "circomlibjs";
import { keccak256, stringToHex } from "viem";
import { FIELD_PRIME } from "./config.js";

let poseidonInstance: any | null = null;

async function getPoseidon(): Promise<any> {
  if (!poseidonInstance) poseidonInstance = await buildPoseidon();
  return poseidonInstance;
}

/** Poseidon hash of field elements, returned as a bigint. */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  const out = poseidon(inputs);
  return BigInt(poseidon.F.toString(out));
}

/** Convert a platform matchId to a BN128 field element. */
export function matchIdToField(matchId: string | number | bigint): bigint {
  if (typeof matchId === "bigint") return matchId % FIELD_PRIME;
  if (typeof matchId === "number") {
    if (!Number.isInteger(matchId) || matchId < 0) {
      throw new Error(`matchId must be a non-negative integer, got ${matchId}`);
    }
    return BigInt(matchId) % FIELD_PRIME;
  }
  const s = matchId.trim();
  if (/^\d+$/.test(s)) return BigInt(s) % FIELD_PRIME;
  if (/^0x[0-9a-fA-F]+$/.test(s)) return BigInt(s) % FIELD_PRIME;
  // UUID or any other string: keccak256(UTF-8) mod p (ASSUMPTION — see header).
  return BigInt(keccak256(stringToHex(s))) % FIELD_PRIME;
}

/** publicSignals[0] = Poseidon(matchId, turnNumber, circuitVersion). */
export async function computeMatchHash(
  matchIdField: bigint,
  turn: number,
  circuitVersionNumeric: number,
): Promise<bigint> {
  return poseidonHash([matchIdField, BigInt(turn), BigInt(circuitVersionNumeric)]);
}

/** Field element -> 0x-prefixed 32-byte big-endian hex. */
export function fieldToHex(x: bigint): string {
  const reduced = ((x % FIELD_PRIME) + FIELD_PRIME) % FIELD_PRIME;
  return "0x" + reduced.toString(16).padStart(64, "0");
}

/** 0x-prefixed hex -> field element (bigint). */
export function hexToField(hex: string): bigint {
  return BigInt(hex) % FIELD_PRIME;
}
