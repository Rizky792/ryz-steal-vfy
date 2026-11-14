// Full witness probe: complete input with distinctive values.
// 1) calculate witness -> read witness[0..9] to learn PUBLIC signal order.
// 2) fullProve + verify -> test whether the witness satisfies the circuit.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const WASM = "./circuits/vfy-policy.wasm";
const ZKEY = "./circuits/vfy-policy_final.zkey";
const VKEY = "./circuits/vfy-policy.vkey.json";

const input = {
  selfBalance: "78",
  opponentBalance: "64",
  amount: "5",
  commitment: "111111",
  matchId: "222222",
  turnNumber: "3",
  action: "1",
  circuitVersion: "1",
  salt: "999999",
  strategyParams: ["30", "50", "20", "10", "2", "6", "1", "0"],
};

console.log("--- witness calculation ---");
const t0 = Date.now();
try {
  const w = await snarkjs.wtns.calculate(input, WASM, "/tmp/full.wtns");
  console.log(`witness OK in ${Date.now() - t0} ms; witness length=${w.length}`);
  console.log("witness[0..12]:");
  for (let i = 0; i <= 12 && i < w.length; i++) {
    console.log(`  w[${i}] = ${w[i].toString()}`);
  }
} catch (e) {
  console.log("WITNESS ERROR:", (e && e.message ? e.message : String(e)).slice(0, 500));
  process.exit(1);
}

console.log("\n--- fullProve ---");
const t1 = Date.now();
try {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log(`fullProve OK in ${Date.now() - t1} ms`);
  console.log("publicSignals:", JSON.stringify(publicSignals));
  console.log("proof.pi_a:", JSON.stringify(proof.pi_a));
  console.log("proof.protocol:", proof.protocol, "| curve:", proof.curve);

  console.log("\n--- groth16 verify ---");
  const vkey = JSON.parse((await import("node:fs")).readFileSync(VKEY, "utf8"));
  const t2 = Date.now();
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log(`verify result: ${ok} (in ${Date.now() - t2} ms)`);
} catch (e) {
  console.log("FULLPROVE ERROR:", (e && e.message ? e.message : String(e)).slice(0, 800));
}
