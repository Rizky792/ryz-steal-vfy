// Strategy semantics probe:
// 1) Identify publicSignals[0] (policyHash candidate) for params [1,0,0,0,0,0,0,0].
// 2) Test amount == p0 hypothesis for action=2.
// 3) Test (p0=1,action=2,amount=1) across states, versions, salts.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
import { keccak256, concat, toHex } from "viem";

const WASM = "./circuits/vfy-policy.wasm";
const poseidon = await buildPoseidon();
const F = poseidon.F;
function poseidonDec(inputs) { return F.toString(poseidon(inputs.map((x) => BigInt(x)))); }
function to32(x) { return toHex(BigInt(x), { size: 32 }); }

const PS0 = "10110190930220911555590469599557144029636198097102186720161581828155231175207";
const P1 = ["1", "0", "0", "0", "0", "0", "0", "0"];
console.log("PS0 target:", PS0);
console.log("Poseidon8([1,0..]):", poseidonDec(P1), poseidonDec(P1) === PS0 ? "<== MATCH" : "");
console.log("keccak(concat32([1,0..])):", BigInt(keccak256(concat(P1.map(to32)))).toString());
console.log("Poseidon9([1,0..,salt999999]):", poseidonDec([...P1, "999999"]));
console.log("Poseidon([1]):", poseidonDec(["1"]));
console.log("keccak('vfy-policy-v1'):", BigInt(keccak256("0x" + Buffer.from("vfy-policy-v1").toString("hex"))).toString());

const SALT = "999999";
function mk(params, action, amount, overrides = {}) {
  const salt = overrides.salt ?? SALT;
  return {
    selfBalance: "78", opponentBalance: "64", amount: String(amount),
    commitment: poseidonDec([...params, salt]),
    matchId: "222222", turnNumber: "3",
    action: String(action), circuitVersion: "1", salt,
    strategyParams: params,
    ...overrides,
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
    await snarkjs.wtns.calculate(input, WASM, "/tmp/strat.wtns");
    console.log(`${name}: WITNESS OK`);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
    console.log(`${name}: FAIL line ${lineOf(msg)}`);
  }
}

// amount == p0 hypothesis (action=2)
for (const p0 of ["1", "2", "3", "5", "8"]) {
  const p = [p0, "0", "0", "0", "0", "0", "0", "0"];
  await probe(`p0=${p0} action=2 amount=${p0}`, mk(p, 2, p0));
  await probe(`p0=${p0} action=2 amount=1`, mk(p, 2, 1));
}
// (p0=1,2,1) across states
for (const [sb, ob] of [["0", "0"], ["100", "100"], ["10", "90"], ["90", "10"], ["1", "1"], ["200", "200"]]) {
  await probe(`p0=1 (2,1) self=${sb} opp=${ob}`, mk(P1, 2, 1, { selfBalance: sb, opponentBalance: ob }));
}
for (const t of ["1", "20", "0"]) {
  await probe(`p0=1 (2,1) turn=${t}`, mk(P1, 2, 1, { turnNumber: t }));
}
for (const m of ["1", "999999999"]) {
  await probe(`p0=1 (2,1) matchId=${m}`, mk(P1, 2, 1, { matchId: m }));
}
// circuitVersion variations with passing combo
for (const v of ["0", "2", "3"]) {
  await probe(`p0=1 (2,1) circuitVersion=${v}`, mk(P1, 2, 1, { circuitVersion: v }));
}
// salt variations (commitment recomputed)
for (const s of ["0", "1", "123456"]) {
  await probe(`p0=1 (2,1) salt=${s}`, mk(P1, 2, 1, { salt: s }));
}
// p1/p2/p3 variations with (2,1): does the valid move change?
for (const [i, v] of [[1, "50"], [2, "50"], [3, "5"], [1, "10"], [2, "10"]]) {
  const p = [...P1]; p[i] = v;
  await probe(`p${i}=${v} (2,1)`, mk(p, 2, 1));
  await probe(`p${i}=${v} (1,10)`, mk(p, 1, 10));
  await probe(`p${i}=${v} (0,0)`, mk(p, 0, 0));
}
console.log("done strategy probe");
