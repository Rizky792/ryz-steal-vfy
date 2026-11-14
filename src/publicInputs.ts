// publicInputsHash — keccak256 of ABI-packed 32-byte big-endian fields,
// in the exact order given by the starter prompt (verbatim):
//   policyHash (bytes32, as-is), matchIdHash (bytes32, as-is),
//   turn (uint256), selfBalance (uint256), opponentBalance (uint256),
//   selfFortify (uint256), opponentFortify (uint256),
//   actionCode (uint256), amount (uint256: EXTRACT amount, otherwise 0).
//
// actionCode here follows the PROMPT's table: HOLD=0, EXTRACT=1, FORTIFY=2.
// !!! DISCREPANCY: the circuit's own `action` input uses a DIFFERENT
// encoding, reverse-engineered from the wasm: HOLD=0, FORTIFY=1, EXTRACT=2
// (see policy.ts). The two encodings serve different purposes (the hash is
// computed from the response's action type; the proof is computed from the
// circuit's action field) and must NOT be mixed up. If the platform rejects
// a practice response with "invalid publicInputsHash", the first thing to
// try is the circuit encoding (HOLD=0, FORTIFY=1, EXTRACT=2) here.
import { concat, keccak256, toHex } from "viem";
import type { ActionType } from "./types.js";

/** Prompt actionCode table (for publicInputsHash ONLY). */
export function promptActionCode(type: ActionType): number {
  switch (type) {
    case "HOLD":
      return 0;
    case "EXTRACT":
      return 1;
    case "FORTIFY":
      return 2;
  }
}

export interface PublicInputsFields {
  policyHash: string; // 0x hex (32 bytes)
  matchIdHash: string; // 0x hex (32 bytes)
  turn: number | bigint;
  selfBalance: number | bigint;
  opponentBalance: number | bigint;
  selfFortify: number | bigint;
  opponentFortify: number | bigint;
  actionCode: number | bigint;
  amount: number | bigint;
}

function to32Bytes(value: string | number | bigint): `0x${string}` {
  if (typeof value === "string") {
    const hex = value.startsWith("0x") ? value : "0x" + value;
    return toHex(BigInt(hex), { size: 32 });
  }
  return toHex(BigInt(value), { size: 32 });
}

/** keccak256 over the 9 ABI-packed 32-byte fields, in prompt order. */
export function computePublicInputsHash(fields: PublicInputsFields): string {
  const packed = concat([
    to32Bytes(fields.policyHash),
    to32Bytes(fields.matchIdHash),
    to32Bytes(fields.turn),
    to32Bytes(fields.selfBalance),
    to32Bytes(fields.opponentBalance),
    to32Bytes(fields.selfFortify),
    to32Bytes(fields.opponentFortify),
    to32Bytes(fields.actionCode),
    to32Bytes(fields.amount),
  ]);
  return keccak256(packed);
}
