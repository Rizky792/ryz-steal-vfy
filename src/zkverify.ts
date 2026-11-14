// zkVerify verification / submission helpers.
//
// The platform verifies the Groth16 proof itself (it holds the verification
// key). This module gives the agent two things:
//  - verifyProofLocally: re-verify a generated proof with snarkjs before
//    answering, so a bad proof is caught locally instead of being sent.
//  - submitProof: a MINIMAL, explicitly unwired helper for on-chain
//    submission via zkVerify Kurier. The starter prompt asks for "a minimal
//    submitProof helper (proof + public_signals -> tx reference)" and to
//    "document exact API call in zkverify.ts" — but NO Kurier endpoint,
//    path, or request shape was provided in the task materials, and
//    fabricating one would be worse than useless. So submitProof does NOT
//    make a network call: it returns { submitted: false } with the reason,
//    and the exact Kurier call must be filled in from the zkVerify docs
//    (https://docs.zkverify.io) before any on-chain submission is attempted.
//    The turn loop does not depend on it.
import { verifyProof } from "./policy.js";
import type { Groth16ProofJson } from "./types.js";

export async function verifyProofLocally(
  proof: Groth16ProofJson,
  publicSignalsHex: string[],
): Promise<boolean> {
  return verifyProof(proof, publicSignalsHex);
}

export interface SubmitProofResult {
  submitted: boolean;
  txRef?: string;
  reason: string;
}

/** Minimal submitProof helper — NOT WIRED (see header). */
export async function submitProof(_args: {
  proof: Groth16ProofJson;
  publicSignals: string[];
  rpcUrl?: string;
}): Promise<SubmitProofResult> {
  return {
    submitted: false,
    reason:
      "Kurier submission is not wired: no Kurier endpoint/path was provided " +
      "in the task materials. Fill in the exact call from https://docs.zkverify.io " +
      "before enabling on-chain submission. The turn loop does not need it — " +
      "the platform verifies the proof from the turn response.",
  };
}
