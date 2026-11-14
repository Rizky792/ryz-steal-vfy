// Environment + committed-strategy configuration.
// The strategy parameters below are the agent's COMMITTED strategy: they are
// hashed into the commitment registered on the dashboard. Changing ANY of
// them (or the salt) changes the commitment and requires re-registration.
// They are constants in code on purpose — never read from the environment.
import { randomBytes } from "node:crypto";
import path from "node:path";

/** Committed strategy, strategyParams[8] (reverse-engineered semantics):
 *  [0] p0 = EXTRACT amount (1..10; 11+ has NO valid move in the circuit).
 *  [1] p1 = FORTIFY threshold: FORTIFY when selfBalance < p1.
 *  [2] p2 = HOLD threshold: HOLD when opponentBalance <= p2.
 *  [3] p3 = passive flag (0/1): 1 forces HOLD (unless FORTIFY triggers first).
 *  [4..7] must be 0 — any nonzero value makes the circuit unsatisfiable. */
export const STRATEGY_PARAMS: readonly string[] = [
  "10", // p0: EXTRACT 10 (game max)
  "30", // p1: FORTIFY when own balance < 30
  "10", // p2: HOLD when opponent balance <= 10
  "0", // p3: not passive
  "0",
  "0",
  "0",
  "0",
];

/** Circuit version string used in responses (starter prompt). */
export const CIRCUIT_VERSION_STRING = "vfy-policy-v1";
/** Numeric circuitVersion fed to the circuit. Assumption: "v1" -> 1.
 *  The circuit accepts any small value; 1 is the natural reading of v1.
 *  It is also an input to publicSignals[0] = Poseidon(matchId, turn, version),
 *  so it must match whatever the platform uses for "vfy-policy-v1". */
export const CIRCUIT_VERSION_NUMERIC = 1;

/** vkHash of the vfy-policy circuit (official /api/circuit-info + starter prompt). */
export const VK_HASH =
  "0x6c56509f1c56fd1fd4e9737f906d2220f4b95f1d507f1adf6899085bd74be047";

/** BN128 scalar field prime (snark field). */
export const FIELD_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const PROTOCOL_VERSION = "v1";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** The salt is the secret opening of the commitment
 *  commitment = Poseidon(strategyParams[8], salt).
 *  It MUST be stable across restarts (it is part of the registered
 *  commitment) and MUST be kept secret (anyone with params+salt can open
 *  the commitment — that is expected, but it must not leak unnecessarily).
 *  If STRATEGY_SALT is unset, an ephemeral random salt is generated and a
 *  loud warning is printed: proofs from an ephemeral salt will NOT match a
 *  commitment registered with a different salt. Set STRATEGY_SALT for any
 *  real (practice) run. */
export const STRATEGY_SALT: string = (() => {
  const fromEnv = process.env.STRATEGY_SALT;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  const ephemeral = (BigInt("0x" + randomBytes(16).toString("hex")) % FIELD_PRIME).toString();
  console.warn(
    "[config] WARNING: STRATEGY_SALT is not set — generated an EPHEMERAL salt " +
      "for this process only. Proofs will NOT match a dashboard-registered " +
      "commitment unless the same salt was used there. Set STRATEGY_SALT " +
      "for practice runs. Ephemeral salt: " + ephemeral,
  );
  return ephemeral;
})();

export const HMAC_SECRET: string = (() => {
  const fromEnv = process.env.AGENT_GAMES_HMAC_SECRET;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv;
  console.warn(
    "[config] WARNING: AGENT_GAMES_HMAC_SECRET is not set — using the built-in " +
      "TEST secret. NEVER use this for a real deployment; set the secret " +
      "from Dashboard -> Rotate Secret.",
  );
  return "test-secret-do-not-use-in-production";
})();

export const PORT: number = envInt("PORT", 8080);
export const ZKVERIFY_RPC_URL: string | undefined =
  process.env.ZKVERIFY_RPC_URL || undefined;
export const AGENT_ENDPOINT_URL: string | undefined =
  process.env.AGENT_ENDPOINT_URL || undefined;

/** Directory holding vfy-policy.wasm / vfy-policy_final.zkey / vfy-policy.vkey.json. */
export const CIRCUIT_DIR: string =
  process.env.CIRCUIT_DIR || path.join(process.cwd(), "circuits");
