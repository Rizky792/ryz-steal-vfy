// Bounds: p0 max (amount=p0), p1/p2 max, p4..p7 must be 0.
// Then validate the chosen committed params: p0=10, p1=30, p2=10, p3=0.
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
    for (const amount of [0, 1, 2, 3, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      try {
        await snarkjs.wtns.calculate(mk(params, action, amount, sb, ob), WASM, "/tmp/bnd.wtns");
        out.push(`(${action},${amount})`);
      } catch (e) { /* invalid */ }
    }
  }
  return out.length ? out.join(" ") : "NONE";
}
function P(p0, p1, p2, p3) { return [String(p0), String(p1), String(p2), String(p3), "0", "0", "0", "0"]; }

// p0 max with amount=p0
for (const p0 of [11, 12, 13, 14, 15, 16, 20, 30]) {
  console.log(`p0=${p0} self=78 opp=64: ${await validMoves(P(p0, 0, 0, 0), 78, 64)}`);
}
// p1 max
for (const p1 of [150, 200, 255, 256, 1000]) {
  console.log(`p1=${p1} self=78 opp=64: ${await validMoves(P(1, p1, 0, 0), 78, 64)}`);
}
// p2 max
for (const p2 of [150, 200, 255, 256, 1000]) {
  console.log(`p2=${p2} self=78 opp=64: ${await validMoves(P(1, 0, p2, 0), 78, 64)}`);
}
// p4..p7 must be 0 (spot check p4=1, p7=1)
for (const [i, v] of [[4, 1], [7, 1]]) {
  const p = P(1, 0, 0, 0); p[i] = String(v);
  console.log(`p${i}=1 self=78 opp=64: ${await validMoves(p, 78, 64)}`);
}
// Chosen committed params: p0=10, p1=30, p2=10, p3=0
const CHOSEN = P(10, 30, 10, 0);
console.log("--- chosen params [10,30,10,0,0,0,0,0] ---");
for (const [sb, ob, expect] of [
  [100, 64, "EXTRACT 10"], [20, 64, "FORTIFY"], [100, 5, "HOLD"],
  [100, 0, "HOLD"], [20, 5, "FORTIFY"], [30, 64, "EXTRACT 10"],
  [29, 64, "FORTIFY"], [100, 10, "HOLD"], [100, 11, "EXTRACT 10"],
]) {
  console.log(`self=${sb} opp=${ob} (expect ${expect}): ${await validMoves(CHOSEN, sb, ob)}`);
}
console.log("done bounds probe");
