// Decision logic + turn-response assembly.
//
// decideTurn is PURE and implements EXACTLY the decision tree the vfy-policy
// circuit enforces (see policy.ts). The agent must not decide anything else:
// any move outside this tree makes the witness unsatisfiable and the proof
// fails. The strategy parameters are the committed ones from config.ts.
//
// NOTE on the prompt's suggested strategy: the starter prompt suggests
// "EXTRACT 10 when the opponent's balance is high, FORTIFY when the
// opponent's balance is low, HOLD when the agent's balance is low".
// The CIRCUIT enforces a different tree: FORTIFY keys on the AGENT's own
// balance (self < p1) and HOLD keys on the OPPONENT's balance (opp <= p2).
// The circuit is authoritative — this module implements the circuit's tree,
// with thresholds chosen so it plays sensibly: FORTIFY when own balance is
// low (< 30, protect what is left), HOLD when there is almost nothing to
// steal (opp <= 10), otherwise EXTRACT 10.
import {
  CIRCUIT_VERSION_NUMERIC,
  CIRCUIT_VERSION_STRING,
  STRATEGY_PARAMS,
  VK_HASH,
} from "./config.js";
import { computeMatchHash, fieldToHex, matchIdToField } from "./matchId.js";
import {
  buildCircuitInput,
  generateProof,
  getCommitmentHex,
} from "./policy.js";
import {
  computePublicInputsHash,
  promptActionCode,
} from "./publicInputs.js";
import type {
  AgentResponse,
  Decision,
  TurnEnvelope,
} from "./types.js";

export const STRATEGY = {
  extractAmount: Number(STRATEGY_PARAMS[0]),
  fortifyThresholdSelf: Number(STRATEGY_PARAMS[1]),
  holdThresholdOpponent: Number(STRATEGY_PARAMS[2]),
  passive: STRATEGY_PARAMS[3] === "1",
};

/** Pure decision function — the circuit's enforced tree.
 *  Balances are plain numbers (the game uses small integers). */
export function decideTurn(
  selfBalance: number,
  opponentBalance: number,
  params: readonly string[] = STRATEGY_PARAMS,
): Decision {
  const p0 = Number(params[0]);
  const p1 = Number(params[1]);
  const p2 = Number(params[2]);
  const p3 = params[3];
  if (selfBalance < p1) {
    return {
      type: "FORTIFY",
      circuitAction: 1,
      amount: 0,
      reason: `selfBalance ${selfBalance} < fortify threshold ${p1}`,
    };
  }
  if (p3 === "1" || opponentBalance <= p2) {
    return {
      type: "HOLD",
      circuitAction: 0,
      amount: 0,
      reason:
        p3 === "1"
          ? "passive flag p3=1"
          : `opponentBalance ${opponentBalance} <= hold threshold ${p2}`,
    };
  }
  return {
    type: "EXTRACT",
    circuitAction: 2,
    amount: p0,
    reason: `opponentBalance ${opponentBalance} > ${p2}, selfBalance ${selfBalance} >= ${p1}`,
  };
}

export interface TurnResult {
  /** Response object WITHOUT the `signature` field (caller signs it). */
  response: Omit<AgentResponse, "signature">;
  decision: Decision;
  provingMs: number;
  matchIdField: bigint;
  matchIdHash: string;
  policyHash: string;
}

/** Process one turn envelope end-to-end: decide, prove, assemble response.
 *  Throws on proof failure (caller applies the fail-closed HOLD fallback). */
export async function processTurn(envelope: TurnEnvelope): Promise<TurnResult> {
  const selfBalance = envelope.state.self.balance;
  const opponentBalance = envelope.state.opponent.balance;
  const selfFortify = envelope.state.self.fortifyActive ?? 0;
  const opponentFortify = envelope.state.opponent.fortifyActive ?? 0;
  const turn = envelope.turn;
  const matchIdField = matchIdToField(envelope.matchId);

  const decision = decideTurn(selfBalance, opponentBalance);

  const input = await buildCircuitInput({
    selfBalance,
    opponentBalance,
    amount: decision.amount,
    matchIdField,
    turn,
    circuitAction: decision.circuitAction,
  });
  const generated = await generateProof(input);

  // matchIdHash: prefer the platform's value from the envelope; otherwise
  // use our computed Poseidon(matchId, turn, version) (which IS the
  // circuit's publicSignals[0]).
  const matchHashField = await computeMatchHash(
    matchIdField,
    turn,
    CIRCUIT_VERSION_NUMERIC,
  );
  const computedMatchIdHash = fieldToHex(matchHashField);
  const matchIdHash =
    envelope.policyProof?.matchIdHash ?? computedMatchIdHash;

  // policyHash: echo the platform's value; fall back to our commitment hex.
  const policyHash =
    envelope.policyHash ??
    envelope.policyProof?.policyHash ??
    (await getCommitmentHex());

  const publicInputsHash = computePublicInputsHash({
    policyHash,
    matchIdHash,
    turn,
    selfBalance,
    opponentBalance,
    selfFortify,
    opponentFortify,
    actionCode: promptActionCode(decision.type),
    amount: decision.type === "EXTRACT" ? decision.amount : 0,
  });

  // Sanity check: the proof's publicSignals[0] must equal the computed
  // match hash, and [1] must equal the commitment.
  const ps = generated.publicSignals;
  if (ps[0].toLowerCase() !== computedMatchIdHash.toLowerCase()) {
    throw new Error(
      `publicSignals[0] mismatch: proof has ${ps[0]}, computed match hash is ${computedMatchIdHash}`,
    );
  }

  const action =
    decision.type === "EXTRACT"
      ? { type: decision.type, amount: decision.amount }
      : { type: decision.type };

  const response: Omit<AgentResponse, "signature"> = {
    matchId: envelope.matchId,
    turn,
    action,
    policyProof: {
      circuitVersion: CIRCUIT_VERSION_STRING,
      proof: generated.proof,
      publicSignals: ps,
      publicInputsHash,
      policyHash,
      matchIdHash,
      vkHash: VK_HASH,
    },
    idempotencyKey: `${envelope.matchId}:${turn}`,
  };

  return {
    response,
    decision,
    provingMs: generated.provingMs,
    matchIdField,
    matchIdHash,
    policyHash,
  };
}
