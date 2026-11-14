// Probe script: inspect vfy-policy zkey header + try witness calculation
// with the documented input names, to discover the circuit's true signals.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
import { keccak256, concat, toHex, stringToHex } from "viem";

const WASM = "./circuits/vfy-policy.wasm";
const ZKEY = "./circuits/vfy-policy_final.zkey";

// --- 1. Parse zkey header (magic, version, sections) ---
const buf = fs.readFileSync(ZKEY);
console.log("zkey magic:", buf.subarray(0, 4).toString("ascii"));
console.log("zkey version:", buf.readUInt32LE(4));
const nSections = buf.readUInt32LE(8);
console.log("nSections:", nSections);
let off = 12;
for (let s = 0; s < nSections; s++) {
  const type = buf.readUInt32LE(off);
  const size = Number(buf.readBigUInt64LE(off + 4));
  console.log(`section ${s}: type=${type} size=${size}`);
  if (type === 2) {
    // Groth header section: n8q, q, n8r, r, nVars, nPublic, domainSize, vk points...
    const h = off + 12;
    const n8q = buf.readUInt32LE(h);
    const n8r = buf.readUInt32LE(h + 4 + n8q);
    const afterR = h + 4 + n8q + 4 + n8r;
    const nVars = buf.readUInt32LE(afterR);
    const nPublic = buf.readUInt32LE(afterR + 4);
    const domainSize = buf.readUInt32LE(afterR + 8);
    console.log(`  groth header: n8q=${n8q} n8r=${n8r} nVars=${nVars} nPublic=${nPublic} domainSize=${domainSize}`);
  }
  off += 12 + size;
}

// --- 2. Candidate input (documented names) ---
const policyHash = "0x" + "11".repeat(32);
const matchId = "9f4e1b2a-1111-2222-3333-444455556666";
const matchIdHash = keccak256(stringToHex(matchId));
const turn = 3;
const selfBalance = 78, opponentBalance = 64, selfFortify = 0, opponentFortify = 6;
const actionCode = 1, amount = 5; // EXTRACT 5

// publicInputsHash per starter prompt: keccak256 of ABI-packed 32-byte BE fields
function to32(x) {
  return toHex(BigInt(x), { size: 32 });
}
const pih = keccak256(concat([
  to32(policyHash), to32(matchIdHash), to32(turn), to32(selfBalance),
  to32(opponentBalance), to32(selfFortify), to32(opponentFortify),
  to32(actionCode), to32(amount),
]));
console.log("policyHash:", policyHash);
console.log("matchIdHash:", matchIdHash);
console.log("publicInputsHash:", pih);

const stateHash = keccak256(concat([to32(selfBalance), to32(opponentBalance), to32(selfFortify), to32(opponentFortify)]));
const opponentHistoryHash = keccak256("0x"); // empty history
const nonceHash = keccak256(stringToHex("n_7f3a9c"));
const move = actionCode * 256 + amount; // 261
const strategyBits = 1;

const input = {
  policyHash: BigInt(policyHash).toString(),
  strategyBits: strategyBits.toString(),
  stateHash: BigInt(stateHash).toString(),
  opponentHistoryHash: BigInt(opponentHistoryHash).toString(),
  turn: turn.toString(),
  matchIdHash: BigInt(matchIdHash).toString(),
  nonce: BigInt(nonceHash).toString(),
  move: move.toString(),
  publicInputsHash: BigInt(pih).toString(),
};
console.log("\n--- Trying witness calculation with 9 documented names ---");
console.log(JSON.stringify(input, null, 1));
try {
  const t0 = Date.now();
  await snarkjs.wtns.calculate(input, WASM, "/tmp/probe.wtns");
  console.log("WITNESS OK in", Date.now() - t0, "ms");
} catch (e) {
  console.log("WITNESS ERROR:", e && e.message ? e.message : String(e));
}
