// Threshold semantics: find when valid move changes from (2,p0).
// - Vary p1 vs oppBalance (extract threshold?)
// - Vary p2 vs selfBalance (fortify/hold threshold?)
// - Hunt for action=1 (FORTIFY?) validity.
// - Amount cap: p0=5 with small oppBalance.
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
async function validMoves(params, sb, ob) {
  const out = [];
  for (const action of [0, 1, 2]) {
    for (const amount of [0, 1, 2, 3, 5, 8, 10]) {
      try {
        await snarkjs.wtns.calculate(mk(params, action, amount, sb, ob), WASM, "/tmp/thr.wtns");
        out.push(`(${action},${amount})`);
      } catch (e) { /* invalid */ }
    }
  }
  return out.length ? out.join(" ") : "NONE";
}

const Z = ["0", "0", "0", "0", "0", "0", "0", "0"];
function withP(i, v) { const p = [...Z]; p[0] = "1"; p[i] = String(v); return p; }

// p1 vs opp (self=78)
for (const p1 of [0, 10, 50, 63, 64, 65, 70, 100]) {
  for (const ob of [5, 64, 100]) {
    const vm = await validMoves(withP(1, p1), 78, ob);
    console.log(`p1=${p1} self=78 opp=${ob}: ${vm}`);
  }
}
// p2 vs self (opp=64)
for (const p2 of [0, 5, 10, 50, 78, 79, 100]) {
  for (const sb of [5, 78, 100]) {
    const vm = await validMoves(withP(2, p2), sb, 64);
    console.log(`p2=${p2} self=${sb} opp=64: ${vm}`);
  }
}
// amount cap: p0=5, small opp
for (const ob of [1, 3, 5, 10]) {
  const p = [...Z]; p[0] = "5";
  const vm = await validMoves(p, 78, ob);
  console.log(`p0=5 self=78 opp=${ob}: ${vm}`);
}
console.log("done threshold probe");
