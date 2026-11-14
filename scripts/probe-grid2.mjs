// 1) PS0 candidates: hash of (matchId, turn, version)?
// 2) Wider action grid (actions 0..5) for p0=1.
// 3) Balance dependence of the valid move (2,1).
// 4) p3 bound.
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
const cands = {
  "Poseidon([match,turn,ver])": poseidonDec(["222222", "3", "1"]),
  "keccak([match,turn,ver])": BigInt(keccak256(concat(["222222", "3", "1"].map(to32)))).toString(),
  "Poseidon([match,turn])": poseidonDec(["222222", "3"]),
  "Poseidon([turn,match,ver])": poseidonDec(["3", "222222", "1"]),
  "Poseidon([match,turn,ver,action,amount])": poseidonDec(["222222", "3", "1", "2", "1"]),
  "keccak([match,turn,ver,action,amount])": BigInt(keccak256(concat(["222222", "3", "1", "2", "1"].map(to32)))).toString(),
  "Poseidon([match,turn,ver,self,opp])": poseidonDec(["222222", "3", "1", "78", "64"]),
  "Poseidon([ver,match,turn])": poseidonDec(["1", "222222", "3"]),
  "Poseidon([match,turn,ver,commit])": poseidonDec(["222222", "3", "1", "12145570370179127335381326853258166960205997012346442496059995861140349772566"]),
};
for (const [name, v] of Object.entries(cands)) {
  console.log(`${name}: ${v === PS0 ? "<== MATCH PS0" : "no"}`);
}

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
    await snarkjs.wtns.calculate(input, WASM, "/tmp/g2.wtns");
    console.log(`${name}: WITNESS OK`);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
    console.log(`${name}: FAIL line ${lineOf(msg)}`);
  }
}

const P1 = ["1", "0", "0", "0", "0", "0", "0", "0"];
// wider action grid
for (const action of ["0", "1", "2", "3", "4", "5"]) {
  for (const amount of ["0", "1", "2", "10"]) {
    await probe(`p0=1 action=${action} amount=${amount}`, mk(P1, action, amount));
  }
}
// balance dependence of (2,1)
for (const [sb, ob] of [["0", "64"], ["64", "0"], ["0", "0"], ["1", "0"], ["0", "1"], ["2", "0"], ["1", "1"], ["5", "0"], ["0", "5"]]) {
  await probe(`(2,1) self=${sb} opp=${ob}`, mk(P1, 2, 1, { selfBalance: sb, opponentBalance: ob }));
}
// p3 bound
for (const v of ["2", "3", "4"]) {
  const p = [...P1]; p[3] = v;
  await probe(`p3=${v} (2,1)`, mk(p, 2, 1));
}
console.log("done grid2");
