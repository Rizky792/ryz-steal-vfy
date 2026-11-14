#!/usr/bin/env bash
# Re-download the vfy-policy circuit artifacts from the official source.
# Run from the project root:  bash scripts/download-circuits.sh
# Verifies SHA-256 afterwards (values measured 2026-11-15).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p circuits
BASE="https://agentgames.zkverify.io/circuits"
curl -fsSL -o circuits/vfy-policy.wasm "$BASE/vfy-policy.wasm"
curl -fsSL -o circuits/vfy-policy_final.zkey "$BASE/vfy-policy_final.zkey"
echo "Downloaded:"
ls -l circuits/vfy-policy.wasm circuits/vfy-policy_final.zkey
echo "Expected SHA-256:"
echo "  wasm: bc0998250d2baf75b89deef5306867ffa7085a08d4f7d2caf0dd63a060b134d2"
echo "  zkey: f9666a1655279ef27f7fee6d535ac8aa9e39286ac40ff6279fea87c21ab6ce41"
sha256sum circuits/vfy-policy.wasm circuits/vfy-policy_final.zkey
echo "Then export the verification key:"
echo "  npx snarkjs zkey export verificationkey circuits/vfy-policy_final.zkey circuits/vfy-policy.vkey.json"
