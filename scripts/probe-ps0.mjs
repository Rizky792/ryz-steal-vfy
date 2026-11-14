// Identify publicSignals[0]: what does it depend on? Read PS0 from the witness
// (witness[1] = first public signal) for single-input variations of the passing case.
// Also test more Poseidon/keccak candidates.
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

const SALT = "999999";
const P1 = ["1", "0", "0", "0", "0", "0", "0", "0"];
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

async function ps0(input) {
  await snarkjs.wtns.calculate(input, WASM, "/tmp/ps0.wtns");
  const json = await snarkjs.wtns.exportJson("/tmp/ps0.wtns");
  // json is array of BigInts; [0]=1 (constant), [1..9]=public signals
  return json.slice(1, 10).map((x) => x.toString());
}

const base = await ps0(mk(P1, 2, 1));
console.log("BASE publicSignals:", JSON.stringify(base));

const variants = {
  salt0: mk(P1, 2, 1, { salt: "0" }),
  p1_50: mk(["1", "50", "0", "0", "0", "0", "0", "0"], 2, 1),
  p0_2_amt2: mk(["2", "0", "0", "0", "0", "0", "0", "0"], 2, 2),
  self100: mk(P1, 2, 1, { selfBalance: "100" }),
  opp100: mk(P1, 2, 1, { opponentBalance: "100" }),
  match1: mk(P1, 2, 1, { matchId: "1" }),
  turn5: mk(P1, 2, 1, { turnNumber: "5" }),
  ver2: mk(P1, 2, 1, { circuitVersion: "2" }),
};
for (const [name, input] of Object.entries(variants)) {
  try {
    const s = await ps0(input);
    console.log(`${name}: PS0=${s[0]} ${s[0] === base[0] ? "(same as base)" : "(CHANGED)"} | full=${JSON.stringify(s)}`);
  } catch (e) {
    console.log(`${name}: witness FAIL`);
  }
}

// Candidate hashes for PS0 (base case)
const candidates = {
  "Poseidon([salt,params...])": poseidonDec(["999999", ...P1]),
  "Poseidon([params...,version])": poseidonDec([...P1, "1"]),
  "Poseidon([params...,salt,version])": poseidonDec([...P1, "999999", "1"]),
  "keccak(concat32(params+salt))": BigInt(keccak256(concat([...P1, "999999"].map(to32)))).toString(),
  "keccak(concat32(params))": BigInt(keccak256(concat(P1.map(to32)))).toString(),
  "Poseidon([1,0,0,0,0,0,0,0]) alt t": poseidonDec(P1),
  "Poseidon([commitment])": poseidonDec([poseidonDec([...P1, "999999"])]),
  "Poseidon([self,opp,amt,commit,match,turn,act,ver])": poseidonDec(["78", "64", "1", poseidonDec([...P1, "999999"]), "222222", "3", "2", "1"]),
};
for (const [name, v] of Object.entries(candidates)) {
  console.log(`${name}: ${v} ${v === base[0] ? "<== MATCH PS0" : ""}`);
}
console.log("done ps0 probe");
