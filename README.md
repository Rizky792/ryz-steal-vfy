# RYZ — Steal the VFY agent (Agent Games, zkVerify)

Practice-mode agent for **Steal the VFY** (Curi VFY), a head-to-head match event
in the zkVerify Agent Games (Season 01). Two agents play a 20-turn match for
the same pot of VFY; each starts with 100 VFY. Before each turn the platform
POSTs a signed turn envelope; the agent verifies the HMAC, decides
(HOLD / EXTRACT / FORTIFY), generates a fresh Groth16 proof for the
`vfy-policy` circuit that the move follows its committed strategy, and answers
within the 5-minute turn deadline.

**Status: built and tested locally. NOT deployed, NOT registered on the
dashboard, NO real secret. Practice-mode validation against a real platform
envelope is still open (see "Open validation").**

## Quick start

```bash
npm install
npm run build
npm start            # listens on http://0.0.0.0:8080 (PORT env overrides)
```

On startup the server prints the committed strategy and the **commitment**
(`Poseidon(strategyParams, salt)`) — register that value on the dashboard
(My Agents → Edit agent → Steal the VFY Strategy) before playing.

```bash
npm test             # end-to-end test: 97 checks, all must pass
```

## Configuration (`.env`)

Copy `.env.example` to `.env`. Never commit `.env`.

| Variable | Meaning |
|---|---|
| `AGENT_GAMES_HMAC_SECRET` | Platform-generated secret (Dashboard → Rotate Secret, shown once). Required for real runs; a built-in TEST secret is used if unset (loud warning). |
| `STRATEGY_SALT` | Salt for the commitment. Must be stable across restarts and match the registered commitment. If unset, an ephemeral salt is generated (loud warning) — proofs will not match a registered commitment. |
| `PORT` | Default `8080`. |
| `ZKVERIFY_RPC_URL` | Optional; only used by the (unwired) Kurier helper. |
| `AGENT_ENDPOINT_URL` | Optional; the agent's public URL, for reference. |

## API

### `GET /health`

```bash
curl http://localhost:8080/health
# {"ok":true,"protocolVersion":"v1"}
```

### `POST /agent` — turn envelope

Signed with HMAC-SHA256 over the raw body (`x-agent-games-signature`).
The example below uses the test secret; replace it with the real one.

```bash
BODY='{"protocolVersion":"v1","eventId":"steal-the-vfy","mode":"competition","matchId":"222222","turn":3,"deadline":"2026-11-14T09:00:00.000Z","nonce":"n_7f3a9c","state":{"self":{"balance":100,"fortifyActive":0},"opponent":{"balance":64,"fortifyActive":0}},"policyHash":"0xab...","circuitVersion":"vfy-policy-v1","policyProof":{"policyHash":"0xab...","publicInputsHash":"0x00...","vkHash":"0x6c56509f1c56fd1fd4e9737f906d2220f4b95f1d507f1adf6899085bd74be047","turn":3,"matchIdHash":"0xcd..."}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "test-secret-do-not-use-in-production" | cut -d' ' -f2)
curl -X POST http://localhost:8080/agent \
  -H 'content-type: application/json' \
  -H "x-agent-games-signature: 0x$SIG" \
  -d "$BODY"
```

Response (EXTRACT example):

```json
{
  "matchId": "222222",
  "turn": 3,
  "action": { "type": "EXTRACT", "amount": 10 },
  "policyProof": {
    "circuitVersion": "vfy-policy-v1",
    "proof": { "pi_a": ["0x...", "0x..."], "pi_b": [["0x...", "0x..."], ["0x...", "0x..."]], "pi_c": ["0x...", "0x..."], "protocol": "groth16", "curve": "bn128" },
    "publicSignals": ["0x...", "... 9 values ..."],
    "publicInputsHash": "0x...",
    "policyHash": "0x...",
    "matchIdHash": "0x...",
    "vkHash": "0x6c56509f1c56fd1fd4e9737f906d2220f4b95f1d507f1adf6899085bd74be047"
  },
  "signature": "0x...",
  "idempotencyKey": "222222:3"
}
```

`amount` is present **only** for EXTRACT; it is omitted for HOLD and FORTIFY.
Every response is signed (HMAC over the canonical response JSON excluding
the `signature` field) and the same value is sent as the
`x-agent-games-signature` header. Missing/invalid request signature → `401`;
malformed envelope → `400`. On any internal error the agent answers HOLD
(fail closed) — see `src/index.ts`.

### `POST /agent` — preflight

```bash
BODY='{"type":"agent-games.preflight.v1","agent_id":"ag_...","timestamp":1730000000,"challenge":"preflight_..."}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "test-secret-do-not-use-in-production" | cut -d' ' -f2)
curl -X POST http://localhost:8080/agent \
  -H 'content-type: application/json' \
  -H "x-agent-games-signature: 0x$SIG" \
  -d "$BODY"
# {"ok":true,"protocolVersion":"v1"}  (with a valid x-agent-games-signature header)
```

## Strategy (committed)

`strategyParams = [10, 30, 10, 0, 0, 0, 0, 0]` — changing any of these (or
the salt) changes the commitment and requires re-registration.

| Param | Meaning |
|---|---|
| `p0 = 10` | EXTRACT amount (game max is 10; `p0 ≥ 11` has NO valid move in the circuit). |
| `p1 = 30` | FORTIFY when own balance < 30 (protect what is left). |
| `p2 = 10` | HOLD when opponent balance ≤ 10 (nothing worth stealing). |
| `p3 = 0` | Passive flag (0/1); `1` forces HOLD unless FORTIFY triggers first. |
| `p4..p7 = 0` | Must be 0 — any nonzero value makes the circuit unsatisfiable. |

Decision tree (pure function `decideTurn` in `src/steal.ts`, exactly the tree
the circuit enforces — any other move makes the witness unsatisfiable):

1. `selfBalance < p1` → **FORTIFY** (costs 2, blocks up to 6).
2. `p3 == 1` or `opponentBalance <= p2` → **HOLD**.
3. Otherwise → **EXTRACT** `p0` (max 10).

FORTIFY has priority over HOLD. This is an initial practice strategy, not a
claim of optimality.

## The vfy-policy circuit — what was reverse-engineered

The `.circom` source is **not published** (only `vfy-policy.wasm` +
`vfy-policy_final.zkey` are served). Everything below was measured
empirically against those artifacts (probes in `scripts/probe-*.mjs`):

- zkey header: `nVars=1909, nPublic=9, domainSize=2048`.
- **17 witness inputs** (9 scalars + `strategyParams[8]`):
  `selfBalance, opponentBalance, amount, commitment, matchId, turnNumber,
  action, circuitVersion, salt` + `strategyParams[8]`.
  The starter prompt's witness names (`policyHash, strategyBits, stateHash,
  opponentHistoryHash, turn, matchIdHash, nonce, move`) are **not** circuit
  inputs — the wasm rejects them.
- **commitment = Poseidon(strategyParams[0..7], salt)** (9-input Poseidon).
  Proven by elimination: every other construction fails the witness at
  template line 72; `Poseidon(params, salt)` passes it.
- **publicSignals (9, circuit order)**:
  `[0] Poseidon(matchId, turnNumber, circuitVersion)`,
  `[1] commitment`,
  `[2] matchId, [3] turnNumber, [4] selfBalance, [5] opponentBalance,
  [6] action, [7] amount, [8] circuitVersion`.
  `salt` and `strategyParams` are private.
- **Circuit action encoding: `0=HOLD, 1=FORTIFY, 2=EXTRACT`.**
  Proven by balance semantics (action 2 requires `opponentBalance > 0`;
  action 1 is the low-own-balance move; action 0 is the low-opponent move).
- **Encoding discrepancy (important):** the starter prompt's
  `publicInputsHash` table says `HOLD=0, EXTRACT=1, FORTIFY=2`. That table is
  used for `publicInputsHash` only (see `src/publicInputs.ts`); the circuit
  uses the encoding above. Do not mix them up. If the platform rejects a
  practice response with "invalid publicInputsHash", try the circuit encoding
  in `publicInputsHash` first.
- **Prompt strategy vs circuit tree:** the prompt suggests "FORTIFY when the
  opponent's balance is low, HOLD when the agent's balance is low". The
  circuit enforces the opposite keying (FORTIFY on own balance, HOLD on
  opponent balance). The circuit is authoritative; this agent implements the
  circuit's tree.
- `vkHash`: `0x6c56509f1c56fd1fd4e9737f906d2220f4b95f1d507f1adf6899085bd74be047`.
- Circuit artifacts (verified SHA-256, 2026-11-15):
  - `circuits/vfy-policy.wasm` — 2,991,212 bytes,
    `bc0998250d2baf75b89deef5306867ffa7085a08d4f7d2caf0dd63a060b134d2`
  - `circuits/vfy-policy_final.zkey` — 810,586 bytes,
    `f9666a1655279ef27f7fee6d535ac8aa9e39286ac40ff6279fea87c21ab6ce41`
  - `circuits/vfy-policy.vkey.json` — exported from the zkey with snarkjs.
  - Re-download: `bash scripts/download-circuits.sh`.
- Measured proving time (this VM, Node 24, snarkjs): **~770–790 ms**
  steady-state per turn (~1,360 ms for the first, cold turn); total HTTP
  response ~800–870 ms — far inside the 5-minute turn deadline.
  Local `snarkjs verify` of a generated proof: ~114 ms.

## Project structure

```
package.json            Express + TypeScript + viem + snarkjs + circomlibjs
tsconfig.json
Dockerfile              Node 20 slim, exposes 8080
.env.example            variable names only (no secrets)
src/
  config.ts             env + committed strategy params + constants
  index.ts              Express app: POST /agent, GET /health, fail-closed HOLD
  hmac.ts               HMAC-SHA256 verify/sign (Node crypto)
  matchId.ts            matchId -> field element, Poseidon match hash
  publicInputs.ts       publicInputsHash (viem keccak256, prompt order)
  policy.ts             proof generation/verification (snarkjs), commitment
  steal.ts              decideTurn (pure) + turn-response assembly
  zkverify.ts           local verify + UNWIRED Kurier submitProof stub
  types.ts              TurnEnvelope, Decision, AgentResponse, CircuitInput
circuits/               vfy-policy.wasm / .zkey / .vkey.json (see above)
scripts/
  test-agent.mjs        end-to-end test (npm test) — 97 checks
  probe-*.mjs           circuit reverse-engineering probes (evidence)
  download-circuits.sh  re-download + verify circuit artifacts
```

## Open validation (must be checked against a real practice envelope)

1. **UUID → field element conversion.** The platform's `matchId` is a UUID
   string; the circuit takes one field element. This agent uses
   `keccak256(UTF-8 bytes of the UUID) mod p`. The first real envelope
   settles it: the envelope carries `matchIdHash`, and whichever conversion
   reproduces `Poseidon(matchIdField, turn, version) == matchIdHash` is the
   right one. Alternatives: UUID as a 128-bit integer mod p; Poseidon over
   the UUID bytes.
2. **Response signature canonicalization.** The signature is the HMAC over
   the canonical response JSON *excluding* the `signature` field (the only
   non-circular reading). If the platform expects the HMAC over the body
   with `signature` set to `""`/`"0x"`, adjust `src/hmac.ts`.
3. **`publicInputsHash` actionCode table.** Follows the prompt
   (`HOLD=0, EXTRACT=1, FORTIFY=2`). If the platform rejects it, try the
   circuit encoding (`HOLD=0, FORTIFY=1, EXTRACT=2`).
4. **Preflight without a signature.** This agent answers an unsigned
   preflight (liveness probe) but rejects a preflight with an *invalid*
   signature. If the platform requires preflight requests to be signed and
   rejects unsigned replies, tighten `src/index.ts`.
5. **`policyHash` / `matchIdHash` echo.** The agent echoes the envelope's
   values when present, falling back to the commitment hex (policyHash) and
   the computed Poseidon match hash (matchIdHash). Confirm the platform
   accepts the echoed values.
6. **Kurier submission is NOT wired** (`src/zkverify.ts`): no Kurier
   endpoint/path was provided in the task materials, so `submitProof`
   returns `{submitted:false}`. The turn loop does not need it — the
   platform verifies the proof from the turn response. Fill it in from
   https://docs.zkverify.io before any on-chain submission.

## Deploy

```bash
docker build -t ryz-steal-vfy .
docker run -p 8080:8080 \
  -e AGENT_GAMES_HMAC_SECRET='<from dashboard>' \
  -e STRATEGY_SALT='<the salt matching the registered commitment>' \
  ryz-steal-vfy
```

Fly.io / Railway: deploy this image (or the repo) with the same two env vars
set, expose port 8080 over HTTPS, then register the public URL on the
dashboard (My Agents → Edit agent → endpoint) and run a preflight.
