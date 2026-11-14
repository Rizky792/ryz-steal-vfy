// Dictionary probe round 2: more candidate names for the remaining 9 inputs.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const WASM = "./circuits/vfy-policy.wasm";

const NAMES = [
  // fortify variants
  "fortifySelf", "fortifyOpponent", "myFortify", "oppFortify",
  "selfShield", "opponentShield", "shieldSelf", "shieldOpponent",
  "defenseSelf", "defenseOpponent", "fortifyActive", "selfFortifyActive",
  "opponentFortifyActive", "myShield", "oppShield", "protection", "armor",
  "fortification", "shield", "defense",
  // hash / statement variants
  "inputsHash", "inputHash", "publicHash", "statementHash", "statement",
  "stateRoot", "stateCommitment", "rootHash", "dataHash", "computedHash",
  "hashOfInputs", "policyCommitment", "strategyCommitment",
  // nonce / randomness variants
  "randomness", "salt", "secret", "seed", "blinding", "blind", "r",
  // strategy variants
  "strategyParams", "params", "thresholds", "threshold", "rules",
  "policyParams", "config", "settings", "strategyId", "policyId", "version",
  // move / decision variants
  "decision", "choice", "play", "moveType", "actionAmount", "value",
  "stealAmount", "extracted", "stolen",
  // balance variants
  "myBalance", "oppBalance", "myFort", "oppFort", "myScore", "oppScore",
  // id variants
  "gameId", "match", "round", "roundNumber", "gameNumber", "eventId",
  "agent", "player", "playerId", "opponentId", "myId",
  "turnIndex", "turnNo", "t",
  // misc
  "timestamp", "expiry", "block", "chainId", "domain", "domainSeparator",
  "nullifier", "prevAction", "prevActions", "opponentMoves", "historyLength",
  "isExtract", "isFortify", "isHold", "flag", "flags", "mode", "kind",
  "opponentAction", "lastAction", "lastOpponentAction",
];

for (const name of NAMES) {
  try {
    await snarkjs.wtns.calculate({ [name]: "0" }, WASM, "/tmp/probe-name2.wtns");
    console.log(`${name}: ACCEPTED-ALL?`);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
    let cls = "OTHER";
    if (msg.includes("not found")) cls = "UNKNOWN";
    else if (msg.includes("Too many values")) cls = "SIZE-0/UNKNOWN";
    else if (msg.includes("Not enough values")) cls = "KNOWN-ARRAY size>1";
    else if (msg.includes("Not all inputs have been set")) cls = "KNOWN-SCALAR size=1";
    if (cls.startsWith("KNOWN")) console.log(`>>> ${name}: ${cls} :: ${msg.slice(0, 100)}`);
    else console.log(`${name}: ${cls}`);
  }
}
console.log("done round 2");
