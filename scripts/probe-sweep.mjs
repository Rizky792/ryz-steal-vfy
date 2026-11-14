// State sweep: for each (self,opp) state, which (action,amount) is valid with p0=1?
// Also p3=1 action grid (p3 is a bit: 0/1).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

const WASM = "./circuits/vfy-policy.wasm";
const poseidon = await buildPoseidon();
const F = poseidon.F;
function poseidonDec(inputs) { return F.toString(poseidon(inputs.map((x) => BigInt(x)))); }

const SALT = "999999";
function mk(params, action, amount, selfBalance, opponentBalance) {
  return {
    selfBalance: String(selfBalance), opponentBalance: String(opponentBalance),
    amount: String(amount),
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
async function probe(name, input) {
  try {
    await snarkjs.wtns.calculate(input, WASM, "/tmp/sweep.wtns");
    return "OK";
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
    return "L" + lineOf(msg);
  }
}

const P1 = ["1", "0", "0", "0", "0", "0", "0", "0"];
const STATES = [[100, 100], [100, 5], [5, 100], [5, 5], [90, 10], [10, 90], [50, 50], [64, 0], [1, 0], [0, 1]];
for (const [sb, ob] of STATES) {
  const row = [];
  for (const action of [0, 1, 2]) {
    for (const amount of [0, 1, 2, 5, 10]) {
      const r = await probe("", mk(P1, action, amount, sb, ob));
      if (r === "OK") row.push(`(${action},${amount})`);
    }
  }
  console.log(`state self=${sb} opp=${ob}: valid moves = ${row.length ? row.join(" ") : "NONE"}`);
}
// p3=1 grid at (78,64)
const P3 = ["1", "0", "0", "1", "0", "0", "0", "0"];
const row3 = [];
for (const action of [0, 1, 2]) {
  for (const amount of [0, 1, 2, 5, 10]) {
    const r = await probe("", mk(P3, action, amount, 78, 64));
    if (r === "OK") row3.push(`(${action},${amount})`);
  }
}
console.log(`p3=1 state(78,64): valid moves = ${row3.length ? row3.join(" ") : "NONE"}`);
// p1=50 grid at (78,64): does a threshold change the valid move?
const P1b = ["1", "50", "0", "0", "0", "0", "0", "0"];
const row1b = [];
for (const action of [0, 1, 2]) {
  for (const amount of [0, 1, 2, 5, 10]) {
    const r = await probe("", mk(P1b, action, amount, 78, 64));
    if (r === "OK") row1b.push(`(${action},${amount})`);
  }
}
console.log(`p1=50 state(78,64): valid moves = ${row1b.length ? row1b.join(" ") : "NONE"}`);
console.log("done state sweep");
