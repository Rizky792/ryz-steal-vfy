// Dictionary probe: for each candidate signal name, call wtns.calculate with
// a single-key input {"<name>": "0"} and classify the error:
//   "Signal X not found"            -> name unknown (size < 0)
//   "Too many values for input X"   -> size == 0 (unknown / zero-size)
//   "Not enough values for input X" -> name known, array signal, size > 1
//   "Not all inputs have been set"  -> name known, scalar (size == 1), accepted
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const WASM = "./circuits/vfy-policy.wasm";

const NAMES = [
  // from starter prompt
  "policyHash", "strategyBits", "stateHash", "opponentHistoryHash", "turn",
  "matchIdHash", "nonce", "move", "publicInputsHash",
  // raw game fields
  "selfBalance", "opponentBalance", "selfFortify", "opponentFortify",
  "actionCode", "amount", "self", "opponent",
  // snake_case variants
  "policy_hash", "strategy_bits", "state_hash", "opponent_history_hash",
  "match_id_hash", "public_inputs_hash", "self_balance", "opponent_balance",
  "self_fortify", "opponent_fortify", "action_code",
  // other plausible names
  "policy", "commitmentHash", "commitment", "strategy", "strategyHash",
  "state", "historyHash", "opponentHistory", "history", "matchId",
  "match_id", "turnNumber", "action", "actionType", "extractAmount",
  "balance", "balances", "fortify", "extract", "deadline", "taskId",
  "agentId", "circuitVersion", "signature", "hash", "vkHash",
  "in", "input", "inputs", "x", "a", "b", "c", "pub", "publicSignals",
];

for (const name of NAMES) {
  try {
    await snarkjs.wtns.calculate({ [name]: "0" }, WASM, "/tmp/probe-name.wtns");
    console.log(`${name}: ACCEPTED-ALL? (no error — unexpected)`);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
    let cls = "OTHER";
    if (msg.includes("not found")) cls = "UNKNOWN";
    else if (msg.includes("Too many values")) cls = "SIZE-0/UNKNOWN";
    else if (msg.includes("Not enough values")) cls = "KNOWN-ARRAY size>1";
    else if (msg.includes("Not all inputs have been set")) cls = "KNOWN-SCALAR size=1";
    console.log(`${name}: ${cls} :: ${msg.slice(0, 120)}`);
  }
}
console.log("done");
