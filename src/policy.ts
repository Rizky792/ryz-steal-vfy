// vfy-policy proof generation (snarkjs Groth16, BN128).
//
// REVERSE-ENGINEERED CIRCUIT FACTS (measured against the real wasm+zkey,
// 2026-11-15; see scripts/probe-*.mjs and build-report.md):
// - zkey header: nVars=1909, nPublic=9, domainSize=2048.
// - 17 witness inputs: 9 scalars
//     selfBalance, opponentBalance, amount, commitment, matchId, turnNumber,
//     action, circuitVersion, salt
//   plus strategyParams[8].
// - commitment = Poseidon(strategyParams[0..7], salt)   [9-input Poseidon]
//   (proven: changing the commitment to any other construction fails the
//   witness at template line 72; Poseidon(params, salt) passes it.)
// - publicSignals (9, circuit order):
//     [0] Poseidon(matchId, turnNumber, circuitVersion)   ("match hash")
//     [1] commitment
//     [2] matchId   [3] turnNumber   [4] selfBalance   [5] opponentBalance
//     [6] action    [7] amount       [8] circuitVersion
//   salt and strategyParams are PRIVATE (not in the public signals).
// - Circuit action encoding: 0=HOLD, 1=FORTIFY, 2=EXTRACT. (Proven by the
//   balance semantics: action=2 requires opponentBalance>0, action=1 is the
//   low-self-balance move, action=0 is the low-opponent-balance move.)
//   This DIFFERS from the starter prompt's publicInputsHash actionCode
//   table (HOLD=0, EXTRACT=1, FORTIFY=2) — see publicInputs.ts.
// - Enforced decision tree (strategyParams = [p0,p1,p2,p3,0,0,0,0]):
//     selfBalance < p1            -> FORTIFY (action 1, amount 0)
//     p3 == 1                     -> HOLD    (action 0, amount 0)
//     opponentBalance <= p2       -> HOLD    (action 0, amount 0)
//     otherwise                   -> EXTRACT (action 2, amount p0)
//   FORTIFY has priority over HOLD; p0 must be 1..10 (11+ is unsatisfiable);
//   p4..p7 must be 0 (any nonzero value is unsatisfiable).
// - The starter prompt's witness names (policyHash, strategyBits, stateHash,
//   opponentHistoryHash, turn, matchIdHash, nonce, move) are NOT circuit
//   inputs — the wasm rejects them (getInputSize()=17 with the names above).
import fs from "node:fs";
import path from "node:path";
// snarkjs sets `__esModule: true` but has no `default` export, so a default
// import (`import snarkjs from "snarkjs"`) compiles to `snarkjs_1.default`
// which is undefined at runtime. Use import-equals (matches the `export =`
// declaration in shims.d.ts) so the binding is the module itself.
import snarkjs = require("snarkjs");
import {
  CIRCUIT_DIR,
  CIRCUIT_VERSION_NUMERIC,
  STRATEGY_PARAMS,
  STRATEGY_SALT,
  VK_HASH,
} from "./config.js";
import { fieldToHex, poseidonHash } from "./matchId.js";
import type { CircuitInput, Groth16ProofJson } from "./types.js";

export const VK_HASH_VALUE = VK_HASH;
export const CIRCUIT_VERSION = CIRCUIT_VERSION_NUMERIC;

const WASM_PATH = path.join(CIRCUIT_DIR, "vfy-policy.wasm");
const ZKEY_PATH = path.join(CIRCUIT_DIR, "vfy-policy_final.zkey");
const VKEY_PATH = path.join(CIRCUIT_DIR, "vfy-policy.vkey.json");

let commitmentCache: string | null = null;
let vkeyCache: any | null = null;

/** commitment = Poseidon(strategyParams[8], salt), as a decimal string. */
export async function getCommitment(): Promise<string> {
  if (commitmentCache) return commitmentCache;
  const inputs = [...STRATEGY_PARAMS, STRATEGY_SALT].map((x) => BigInt(x));
  commitmentCache = (await poseidonHash(inputs)).toString();
  return commitmentCache;
}

/** commitment as 0x hex (32 bytes) — the value to register on the dashboard. */
export async function getCommitmentHex(): Promise<string> {
  return fieldToHex(BigInt(await getCommitment()));
}

function loadVkey(): any {
  if (vkeyCache) return vkeyCache;
  vkeyCache = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
  return vkeyCache;
}

function decimalToHex32(decimal: string): string {
  return fieldToHex(BigInt(decimal));
}

/** Convert a raw snarkjs Groth16 proof to the starter-prompt JSON format
 *  (pi_a/pi_b/pi_c as 0x hex, dropping the trailing "1"/"0" coordinates
 *  snarkjs includes). */
export function snarkjsProofToJson(proof: any): Groth16ProofJson {
  return {
    pi_a: [decimalToHex32(proof.pi_a[0]), decimalToHex32(proof.pi_a[1])],
    pi_b: [
      [decimalToHex32(proof.pi_b[0][0]), decimalToHex32(proof.pi_b[0][1])],
      [decimalToHex32(proof.pi_b[1][0]), decimalToHex32(proof.pi_b[1][1])],
    ],
    pi_c: [decimalToHex32(proof.pi_c[0]), decimalToHex32(proof.pi_c[1])],
    protocol: "groth16",
    curve: "bn128",
  };
}

/** Convert a response-format proof back to snarkjs form (for verification). */
export function proofJsonToSnarkjs(proof: Groth16ProofJson): any {
  const hexToDec = (h: string) => BigInt(h).toString();
  return {
    pi_a: [hexToDec(proof.pi_a[0]), hexToDec(proof.pi_a[1]), "1"],
    pi_b: [
      [hexToDec(proof.pi_b[0][0]), hexToDec(proof.pi_b[0][1])],
      [hexToDec(proof.pi_b[1][0]), hexToDec(proof.pi_b[1][1])],
      ["1", "0"],
    ],
    pi_c: [hexToDec(proof.pi_c[0]), hexToDec(proof.pi_c[1]), "1"],
    protocol: "groth16",
    curve: "bn128",
  };
}

export interface GeneratedProof {
  proof: Groth16ProofJson;
  /** Public signals as 0x hex (response format), circuit order. */
  publicSignals: string[];
  /** Public signals as decimal strings (snarkjs form). */
  publicSignalsDecimal: string[];
  /** Proving time in milliseconds. */
  provingMs: number;
}

/** Build the 17 circuit inputs for one turn. */
export async function buildCircuitInput(args: {
  selfBalance: number | bigint;
  opponentBalance: number | bigint;
  amount: number | bigint;
  matchIdField: bigint;
  turn: number;
  circuitAction: number;
}): Promise<CircuitInput> {
  const commitment = await getCommitment();
  return {
    selfBalance: BigInt(args.selfBalance).toString(),
    opponentBalance: BigInt(args.opponentBalance).toString(),
    amount: BigInt(args.amount).toString(),
    commitment,
    matchId: args.matchIdField.toString(),
    turnNumber: String(args.turn),
    action: String(args.circuitAction),
    circuitVersion: String(CIRCUIT_VERSION_NUMERIC),
    salt: STRATEGY_SALT,
    strategyParams: [...STRATEGY_PARAMS],
  };
}

/** Generate a Groth16 proof for one turn. Throws if the witness is
 *  unsatisfiable (wrong decision for the committed strategy) or proving fails. */
export async function generateProof(input: CircuitInput): Promise<GeneratedProof> {
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    WASM_PATH,
    ZKEY_PATH,
  );
  const provingMs = Date.now() - t0;
  return {
    proof: snarkjsProofToJson(proof),
    publicSignals: (publicSignals as string[]).map(decimalToHex32),
    publicSignalsDecimal: [...(publicSignals as string[])],
    provingMs,
  };
}

/** Verify a proof locally against the circuit verification key. */
export async function verifyProof(
  proofJson: Groth16ProofJson,
  publicSignalsHex: string[],
): Promise<boolean> {
  const vk = loadVkey();
  const proof = proofJsonToSnarkjs(proofJson);
  const publicSignals = publicSignalsHex.map((h) => BigInt(h).toString());
  return snarkjs.groth16.verify(vk, publicSignals, proof);
}
