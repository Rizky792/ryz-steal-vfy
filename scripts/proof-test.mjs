// End-to-end proof for the first passing witness:
// params=[1,0,0,0,0,0,0,0], commitment=Poseidon(params,salt), action=2, amount=1.
// Times fullProve, verifies with snarkjs, and maps public signals to inputs.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
import fs from "node:fs";

const WASM = "./circuits/vfy-policy.wasm";
const ZKEY = "./circuits/vfy-policy_final.zkey";
const poseidon = await buildPoseidon();
const F = poseidon.F;
function poseidonDec(inputs) { return F.toString(poseidon(inputs.map((x) => BigInt(x)))); }

const SALT = "999999";
const PARAMS = ["1", "0", "0", "0", "0", "0", "0", "0"];
const input = {
  selfBalance: "78", opponentBalance: "64", amount: "1",
  commitment: poseidonDec([...PARAMS, SALT]),
  matchId: "222222", turnNumber: "3",
  action: "2", circuitVersion: "1", salt: SALT,
  strategyParams: PARAMS,
};
console.log("input:", JSON.stringify(input, null, 2));

const t0 = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
const tProve = Date.now() - t0;
console.log(`fullProve OK in ${tProve} ms`);
console.log("publicSignals:", JSON.stringify(publicSignals, null, 2));

// Map public signals to inputs by value
const known = {
  selfBalance: "78", opponentBalance: "64", amount: "1",
  commitment: input.commitment, matchId: "222222", turnNumber: "3",
  action: "2", circuitVersion: "1", salt: "999999",
};
publicSignals.forEach((s, i) => {
  const match = Object.entries(known).find(([, v]) => v === s);
  console.log(`publicSignals[${i}] = ${s}  -> ${match ? match[0] : "???"}`);
});

const vk = JSON.parse(fs.readFileSync("./circuits/vfy-policy.vkey.json", "utf8"));
const t1 = Date.now();
const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);
console.log(`snarkjs verify: ${ok} (took ${Date.now() - t1} ms)`);
console.log("proof.pi_a:", JSON.stringify(proof.pi_a));
console.log("proof.pi_b:", JSON.stringify(proof.pi_b));
console.log("proof.pi_c:", JSON.stringify(proof.pi_c));
console.log("done proof test");
