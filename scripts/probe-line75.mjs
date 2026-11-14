// Probe line-75 assert: baseline commitment = Poseidon(params, salt) [passed line 72].
// Vary one dimension at a time; recompute commitment whenever salt/params change.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
import { keccak256, stringToHex } from "viem";

const WASM = "./circuits/vfy-policy.wasm";
const poseidon = await buildPoseidon();
const F = poseidon.F;
function poseidonDec(inputs) { return F.toString(poseidon(inputs.map((x) => BigInt(x)))); }

const PARAMS = ["30", "50", "20", "10", "2", "6", "1", "0"];
const SALT = "999999";
const V = BigInt(keccak256(stringToHex("vfy-policy-v1"))).toString();

function mk(overrides = {}, params = PARAMS, salt = SALT) {
  return {
    selfBalance: "78", opponentBalance: "64", amount: "5",
    commitment: poseidonDec([...params, salt]),
    matchId: "222222", turnNumber: "3",
    action: "1", circuitVersion: "1", salt,
    strategyParams: params,
    ...overrides,
  };
}

const CASES = {
  base_H1s: mk(),
  ver0: mk({ circuitVersion: "0" }),
  ver2: mk({ circuitVersion: "2" }),
  ver3: mk({ circuitVersion: "3" }),
  verKeccak: mk({ circuitVersion: V }),
  verBig: mk({ circuitVersion: "20260101" }),
  hold: mk({ action: "0", amount: "0" }),
  fortify: mk({ action: "2", amount: "0" }),
  extract10: mk({ amount: "10" }),
  extract1: mk({ amount: "1" }),
  turn1: mk({ turnNumber: "1" }),
  turn20: mk({ turnNumber: "20" }),
  turn21: mk({ turnNumber: "21" }),
  turn0: mk({ turnNumber: "0" }),
  match0: mk({ matchId: "0" }),
  match1: mk({ matchId: "1" }),
  bal0: mk({ selfBalance: "0", opponentBalance: "0" }),
  bal100: mk({ selfBalance: "100", opponentBalance: "100" }),
  bal200: mk({ selfBalance: "200", opponentBalance: "200" }),
  salt0: mk({}, PARAMS, "0"),
  salt1: mk({}, PARAMS, "1"),
  paramsZeros: mk({}, ["0", "0", "0", "0", "0", "0", "0", "0"]),
  paramsOnes: mk({}, ["1", "1", "1", "1", "1", "1", "1", "1"]),
};

for (const [name, input] of Object.entries(CASES)) {
  try {
    const w = await snarkjs.wtns.calculate(input, WASM, "/tmp/l75.wtns");
    console.log(`${name}: WITNESS OK (len=${w.length}) w1..9=${w.slice(1, 10).map((x) => x.toString()).join(",")}`);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).replace(/\n/g, " ").trim();
    console.log(`${name}: FAIL :: ${msg.slice(0, 140)}`);
  }
}
console.log("done line75 probe");
