// Probe commitment-binding hypotheses for the line-72 assert.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
import { keccak256, concat, toHex, stringToHex } from "viem";

const WASM = "./circuits/vfy-policy.wasm";
const poseidon = await buildPoseidon();
const F = poseidon.F;

function to32(x) { return toHex(BigInt(x), { size: 32 }); }
function poseidonDec(inputs) {
  const h = poseidon(inputs.map((x) => BigInt(x)));
  return F.toString(h);
}

const PARAMS = ["30", "50", "20", "10", "2", "6", "1", "0"];
const ZEROS = ["0", "0", "0", "0", "0", "0", "0", "0"];

const P8 = poseidonDec(PARAMS);
const P8z = poseidonDec(ZEROS);
const P9salt = poseidonDec([...PARAMS, "999999"]);
const P9ver = poseidonDec(["1", ...PARAMS]);
const K8 = BigInt(keccak256(concat(PARAMS.map(to32)))).toString();
const K8z = BigInt(keccak256(concat(ZEROS.map(to32)))).toString();
const V = BigInt(keccak256(stringToHex("vfy-policy-v1"))).toString();

console.log("P8 (poseidon params)      :", P8);
console.log("P8z (poseidon zeros)      :", P8z);
console.log("P9salt (poseidon params+salt):", P9salt);
console.log("P9ver (poseidon ver+params):", P9ver);
console.log("K8 (keccak params)        :", K8);
console.log("K8z (keccak zeros)        :", K8z);
console.log("V (keccak 'vfy-policy-v1'):", V);

const BASE = {
  selfBalance: "78", opponentBalance: "64", amount: "5",
  commitment: "111111", matchId: "222222", turnNumber: "3",
  action: "1", circuitVersion: "1", salt: "999999",
  strategyParams: PARAMS,
};

const CASES = {
  H1_poseidon_params: { ...BASE, commitment: P8 },
  H1z_poseidon_zeros: { ...BASE, commitment: P8z, strategyParams: ZEROS },
  H1s_poseidon_params_salt: { ...BASE, commitment: P9salt },
  H1v_poseidon_ver_params: { ...BASE, commitment: P9ver },
  H2_keccak_params: { ...BASE, commitment: K8 },
  H2z_keccak_zeros: { ...BASE, commitment: K8z, strategyParams: ZEROS },
  H4_version_keccak: { ...BASE, circuitVersion: V },
  H1plusH4: { ...BASE, commitment: P8, circuitVersion: V },
  H2plusH4: { ...BASE, commitment: K8, circuitVersion: V },
  H1_hold: { ...BASE, commitment: P8, action: "0", amount: "0" },
};

for (const [name, input] of Object.entries(CASES)) {
  try {
    const w = await snarkjs.wtns.calculate(input, WASM, "/tmp/hash.wtns");
    console.log(`${name}: WITNESS OK (len=${w.length}) w1..9=${w.slice(1, 10).map((x) => x.toString()).join(",")}`);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
    console.log(`${name}: FAIL :: ${msg.slice(0, 140)}`);
  }
}
console.log("done hash probe");
