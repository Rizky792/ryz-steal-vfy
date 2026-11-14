// Probe line-75: which strategyParams positions/values does it constrain?
// Baseline: all-zero params passes line 75 (fails at line 90). Set one param at a time.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

const WASM = "./circuits/vfy-policy.wasm";
const poseidon = await buildPoseidon();
const F = poseidon.F;
function poseidonDec(inputs) { return F.toString(poseidon(inputs.map((x) => BigInt(x)))); }

const SALT = "999999";
function mk(params, overrides = {}) {
  return {
    selfBalance: "78", opponentBalance: "64", amount: "5",
    commitment: poseidonDec([...params, SALT]),
    matchId: "222222", turnNumber: "3",
    action: "1", circuitVersion: "1", salt: SALT,
    strategyParams: params,
    ...overrides,
  };
}

const Z = ["0", "0", "0", "0", "0", "0", "0", "0"];
const CASES = {};
// one param = 1 at each position
for (let i = 0; i < 8; i++) {
  const p = [...Z]; p[i] = "1";
  CASES[`p${i}=1`] = mk(p);
}
// one param = 2 at each position
for (let i = 0; i < 8; i++) {
  const p = [...Z]; p[i] = "2";
  CASES[`p${i}=2`] = mk(p);
}
// small values in first slots
CASES["p0=30"] = mk(["30", "0", "0", "0", "0", "0", "0", "0"]);
CASES["p1=50"] = mk(["0", "50", "0", "0", "0", "0", "0", "0"]);
CASES["p0=1,p1=1"] = mk(["1", "1", "0", "0", "0", "0", "0", "0"]);

for (const [name, input] of Object.entries(CASES)) {
  try {
    const w = await snarkjs.wtns.calculate(input, WASM, "/tmp/l75b.wtns");
    console.log(`${name}: WITNESS OK (len=${w.length})`);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
    const m = msg.match(/line: (\d+)/);
    console.log(`${name}: FAIL line ${m ? m[1] : "?"} :: ${msg.slice(0, 100)}`);
  }
}
console.log("done line75b probe");
