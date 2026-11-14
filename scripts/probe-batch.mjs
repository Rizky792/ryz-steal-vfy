// Batch probe: try several input assignments, report which assert line fails (or success).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const WASM = "./circuits/vfy-policy.wasm";

const BASE = {
  selfBalance: "78",
  opponentBalance: "64",
  amount: "5",
  commitment: "111111",
  matchId: "222222",
  turnNumber: "3",
  action: "1",
  circuitVersion: "1",
  salt: "999999",
  strategyParams: ["30", "50", "20", "10", "2", "6", "1", "0"],
};

const CASES = {
  A_all_zeros: {
    selfBalance: "0", opponentBalance: "0", amount: "0", commitment: "0",
    matchId: "0", turnNumber: "0", action: "0", circuitVersion: "0",
    salt: "0", strategyParams: ["0", "0", "0", "0", "0", "0", "0", "0"],
  },
  B_params_zero: { ...BASE, strategyParams: ["0", "0", "0", "0", "0", "0", "0", "0"] },
  C_commitment_zero: { ...BASE, commitment: "0" },
  D_version_zero: { ...BASE, circuitVersion: "0" },
  E_hold: { ...BASE, action: "0", amount: "0" },
  F_salt_zero: { ...BASE, salt: "0" },
  G_turn1: { ...BASE, turnNumber: "1" },
  H_match_zero: { ...BASE, matchId: "0" },
  I_amount10: { ...BASE, amount: "10" },
  J_action2_fortify: { ...BASE, action: "2", amount: "0" },
  K_balances_zero: { ...BASE, selfBalance: "0", opponentBalance: "0" },
  L_version_big: { ...BASE, circuitVersion: "123456789" },
};

for (const [name, input] of Object.entries(CASES)) {
  try {
    const w = await snarkjs.wtns.calculate(input, WASM, "/tmp/batch.wtns");
    console.log(`${name}: WITNESS OK (len=${w.length}) w1..9=${w.slice(1, 10).map((x) => x.toString()).join(",")}`);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
    console.log(`${name}: FAIL :: ${msg.slice(0, 160)}`);
  }
}
console.log("done batch");
