// Find the array size of strategyParams by trying lengths 2..16.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");

const WASM = "./circuits/vfy-policy.wasm";

for (let len = 2; len <= 16; len++) {
  const arr = new Array(len).fill("0");
  try {
    await snarkjs.wtns.calculate({ strategyParams: arr }, WASM, "/tmp/probe-size.wtns");
    console.log(`len=${len}: ACCEPTED-ALL?`);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
    console.log(`len=${len}: ${msg.slice(0, 110)}`);
    if (msg.includes("Not all inputs have been set")) {
      console.log(`>>> strategyParams size = ${len}`);
      break;
    }
  }
}
console.log("done");
