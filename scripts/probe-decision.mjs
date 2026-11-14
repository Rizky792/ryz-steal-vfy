// Decision-tree semantics: confirm p1 vs selfBalance, p2 vs oppBalance,
// exact boundaries (<= vs <), and priority order (p3 vs p1 vs p2 vs opp==0).
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
    for (const amount of [0, 1, 2, 5, 10]) {
      try {
        await snarkjs.wtns.calculate(mk(params, action, amount, sb, ob), WASM, "/tmp/dec.wtns");
        out.push(`(${action},${amount})`);
      } catch (e) { /* invalid */ }
    }
  }
  return out.length ? out.join(" ") : "NONE";
}
function P(p0, p1, p2, p3) { return [String(p0), String(p1), String(p2), String(p3), "0", "0", "0", "0"]; }

// p1 vs selfBalance: p1=100, vary self
for (const sb of [78, 99, 100, 101, 150]) {
  console.log(`p1=100 self=${sb} opp=64: ${await validMoves(P(1, 100, 0, 0), sb, 64)}`);
}
// p1 boundary at self=78
for (const p1 of [71, 78, 79, 80, 90, 99]) {
  console.log(`p1=${p1} self=78 opp=64: ${await validMoves(P(1, p1, 0, 0), 78, 64)}`);
}
// p2 vs oppBalance: p2=78, vary opp
for (const ob of [64, 77, 78, 79, 100]) {
  console.log(`p2=78 self=78 opp=${ob}: ${await validMoves(P(1, 0, 78, 0), 78, ob)}`);
}
// p2 boundary at opp=64
for (const p2 of [51, 60, 63, 64, 65, 70, 77]) {
  console.log(`p2=${p2} self=78 opp=64: ${await validMoves(P(1, 0, p2, 0), 78, 64)}`);
}
// p0 boundary (line 95): p0 in 9..14
for (const p0 of [9, 10, 11, 12, 13, 14]) {
  console.log(`p0=${p0} self=78 opp=64: ${await validMoves(P(p0, 0, 0, 0), 78, 64)}`);
}
// priority: p1=100 AND p2=78 (both trigger) -> which action?
console.log(`p1=100 p2=78 self=78 opp=64: ${await validMoves(P(1, 100, 78, 0), 78, 64)}`);
// priority: p3=1 AND p1=100
console.log(`p3=1 p1=100 self=78 opp=64: ${await validMoves(P(1, 100, 0, 1), 78, 64)}`);
// priority: p3=1 AND opp=0 (both HOLD anyway)
console.log(`p3=1 self=78 opp=0: ${await validMoves(P(1, 0, 0, 1), 78, 0)}`);
// p1 trigger with opp=0: FORTIFY or HOLD?
console.log(`p1=100 self=78 opp=0: ${await validMoves(P(1, 100, 0, 0), 78, 0)}`);
// p2 trigger with opp=0
console.log(`p2=78 self=78 opp=0: ${await validMoves(P(1, 0, 78, 0), 78, 0)}`);
console.log("done decision probe");
