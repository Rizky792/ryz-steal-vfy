// Typed interfaces for the Steal the VFY agent (Agent Games, zkVerify).
// Field names follow the official starter prompt / envelope examples verbatim
// where they exist; anything else is marked as an assumption in README.md.

export type ActionType = "HOLD" | "EXTRACT" | "FORTIFY";

/** One side of the match state inside a turn envelope. */
export interface TurnSideState {
  balance: number;
  fortifyActive: number;
}

/** Turn envelope POSTed by the platform (see /build §06). */
export interface TurnEnvelope {
  protocolVersion: string;
  eventId: string;
  mode: string;
  matchId: string;
  turn: number;
  deadline: string;
  nonce: string;
  state: {
    self: TurnSideState;
    opponent: TurnSideState;
  };
  /** Frozen policy/commitment hash echoed by the platform (hex). May be absent. */
  policyHash?: string;
  /** Expected circuit version string, e.g. "vfy-policy-v1". May be absent. */
  circuitVersion?: string;
  /** Platform-supplied proof metadata for this turn. May be absent. */
  policyProof?: {
    policyHash?: string;
    publicInputsHash?: string;
    vkHash?: string;
    turn?: number;
    matchIdHash?: string;
  };
  // Tolerate extra fields the platform may add.
  [key: string]: unknown;
}

/** Preflight probe sent by the platform before marking the agent active. */
export interface PreflightRequest {
  type: "agent-games.preflight.v1";
  agent_id: string;
  timestamp: number;
  challenge: string;
}

/** The agent's chosen move. `circuitAction` is the vfy-policy circuit's own
 *  encoding (reverse-engineered, see policy.ts): 0=HOLD, 1=FORTIFY, 2=EXTRACT.
 *  This DIFFERS from the starter prompt's publicInputsHash actionCode table
 *  (HOLD=0, EXTRACT=1, FORTIFY=2) — see publicInputs.ts. */
export interface Decision {
  type: ActionType;
  /** Circuit encoding of the action (0/1/2). */
  circuitAction: number;
  /** Amount for EXTRACT (1..10); 0 for HOLD/FORTIFY. */
  amount: number;
  /** Human-readable reason (for logs only, never sent to the platform). */
  reason: string;
}

/** Groth16 proof in the response format of the starter prompt. */
export interface Groth16ProofJson {
  pi_a: [string, string];
  pi_b: [[string, string], [string, string]];
  pi_c: [string, string];
  protocol: "groth16";
  curve: "bn128";
}

export interface PolicyProofJson {
  circuitVersion: string;
  proof: Groth16ProofJson;
  /** 9 public signals, 0x-prefixed 32-byte hex, circuit order. */
  publicSignals: string[];
  publicInputsHash: string;
  policyHash: string;
  matchIdHash: string;
  vkHash: string;
}

/** Full turn response (starter prompt format). `amount` is present ONLY for
 *  EXTRACT and omitted for HOLD/FORTIFY. */
export interface AgentResponse {
  matchId: string;
  turn: number;
  action: { type: ActionType; amount?: number };
  policyProof: PolicyProofJson;
  /** HMAC-SHA256 (hex, 0x-prefixed) over the canonical response JSON
   *  excluding this field; also sent as the x-agent-games-signature header. */
  signature: string;
  idempotencyKey: string;
}

/** The 17 witness inputs of the vfy-policy circuit (9 scalars + strategyParams[8]).
 *  Names verified empirically against the circuit wasm (see policy.ts). */
export interface CircuitInput {
  selfBalance: string;
  opponentBalance: string;
  amount: string;
  commitment: string;
  matchId: string;
  turnNumber: string;
  action: string;
  circuitVersion: string;
  salt: string;
  strategyParams: string[];
}
