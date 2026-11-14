// Probe action semantics: p0 x action x amount grid, state fixed (78,64).
// Record which assert line fails for each combo.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

const WASM = "./circuits/vfy-policy.wasm";
const poseidon = await buildPoseidon();
const F = poseidon.F;
function poseidonDec(inputs) { return F.toString(poseidon(inputs.map((x) => BigInt(x)))); }

const SALT = "999999";
function mk(params, action, amount, selfBalance = "78", opponentBalance = "64") {
  return {
    selfBalance, opponentBalance, amount: String(amount),
    commitment: poseidonDec([...params, SALT]),
    matchId: "222222", turnNumber: "3",
    action: String(action), circuitVersion: "1", salt: SALT,
    strategyParams: params,
  };
}
function lineOf(msg) {
  const m = msg.match(/VfyPolicyProof_154 line: (\d+)/);
  if (m) return m[1];
  if (msg.includes("Num2Bits")) return "Num2Bits";
  return "?";
}

for (const p0 of ["0", "1", "2", "3"]) {
  const params = [p0, "0", "0", "0", "0", "0", "0", "0"];
  for (const action of ["0", "1", "2"]) {
    for (const amount of ["0", "1", "5", "10"]) {
      const input = mk(params, action, amount);
      try {
        await snarkjs.wtns.calculate(input, WASM, "/tmp/act.wtns");
        console.log(`p0=${p0} action=${action} amount=${amount}: WITNESS OK`);
      } catch (e) {
        const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
        console.log(`p0=${p0} action=${action} amount=${amount}: FAIL line ${lineOf(msg)}`);
      }
    }
  }
}
console.log("done action grid");
