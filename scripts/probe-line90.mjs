// Probe: p0 bit-bound + what line 90 / line 140 check.
// Baseline: params all zero passes 72,75-78, fails 90. p0=1 passes 90, fails 140.
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
function lineOf(msg) { const m = msg.match(/VfyPolicyProof_154 line: (\d+)/); return m ? m[1] : (msg.includes("Num2Bits") ? "Num2Bits" : "?"); }

async function probe(name, input) {
  try {
    await snarkjs.wtns.calculate(input, WASM, "/tmp/l90.wtns");
    console.log(`${name}: WITNESS OK`);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
    console.log(`${name}: FAIL line ${lineOf(msg)} :: ${msg.slice(0, 90)}`);
  }
}

// 1) p0 sweep (others 0) — find Num2Bits bound
for (const v of ["0", "1", "2", "4", "7", "8", "15", "16", "31"]) {
  const p = ["0", "0", "0", "0", "0", "0", "0", "0"]; p[0] = v;
  await probe(`p0=${v}`, mk(p));
}
// 2) p0=1, vary p1/p2/p3
for (const v of ["0", "1", "5", "10", "30", "50", "100"]) {
  const p = ["1", "0", "0", "0", "0", "0", "0", "0"]; p[1] = v;
  await probe(`p0=1,p1=${v}`, mk(p));
}
for (const v of ["1", "10", "50"]) {
  const p = ["1", "0", "0", "0", "0", "0", "0", "0"]; p[2] = v;
  await probe(`p0=1,p2=${v}`, mk(p));
  const q = ["1", "0", "0", "0", "0", "0", "0", "0"]; q[3] = v;
  await probe(`p0=1,p3=${v}`, mk(q));
}
// 3) p0=1, params[1..3]=0, vary action/amount/state (line 140 hunt)
for (const [a, amt] of [["0", "0"], ["1", "1"], ["1", "10"], ["2", "0"], ["1", "0"]]) {
  const p = ["1", "0", "0", "0", "0", "0", "0", "0"];
  await probe(`p0=1 action=${a} amount=${amt}`, mk(p, { action: a, amount: amt }));
}
for (const [sb, ob] of [["0", "0"], ["100", "100"], ["30", "64"], ["78", "20"], ["10", "90"]]) {
  const p = ["1", "0", "0", "0", "0", "0", "0", "0"];
  await probe(`p0=1 self=${sb} opp=${ob}`, mk(p, { selfBalance: sb, opponentBalance: ob }));
}
console.log("done line90 probe");
