# Endpoints reference

Verified against a live call on 2026-04-13 using a free-tier key tagged `appName: "insumer-skill"`. All field names, types, and nesting match the response the API actually returned. When in doubt, trust a fresh live call over this document — the spec at <https://insumermodel.com/openapi.yaml> is the source of truth.

## `POST /v1/attest`

Verify 1–10 on-chain conditions for a wallet. Returns ECDSA-signed booleans.

### Request

```http
POST https://api.insumermodel.com/v1/attest
Content-Type: application/json
X-API-Key: insr_live_...
```

```json
{
  "wallet": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "format": "jwt",
  "conditions": [
    {
      "type": "token_balance",
      "contractAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "chainId": 8453,
      "threshold": "100",
      "decimals": 6,
      "label": "USDC on Base >= 100"
    }
  ]
}
```

**Wallet fields** (at least one required, depending on chain):

| Field | Format | Used for |
|---|---|---|
| `wallet` | `0x...` 40 hex chars | All 32 EVM chains |
| `solanaWallet` | base58 | Solana conditions |
| `xrplWallet` | r-address 25–35 chars | XRPL conditions |
| `bitcoinWallet` | P2PKH / P2SH / bech32 / Taproot | Bitcoin conditions |

**Optional flags**:

| Flag | Value | Effect |
|---|---|---|
| `format` | `"jwt"` | Adds a ready-to-verify ES256 JWT to the response (no extra credit cost) |
| `proof` | `"merkle"` | Adds EIP-1186 Merkle storage proofs for `token_balance` conditions on 28 of 32 EVM chains. Costs 2 credits instead of 1. Note: Merkle mode reveals the raw balance — standard mode never does. |

**Condition types**: `token_balance`, `nft_ownership` (34 of 38 chains: EVM + Solana + XRPL), `eas_attestation`, `farcaster_id`, `evm_view_call` (single-address-argument view function returning bool; needs `selector`, RPC EVM only), `ratio_to_amount`, `ratio_to_supply`, `erc8004_agent` (Base; needs `agentId`), and `erc7710_delegation` (Base; needs `delegationManager`, `expectedDelegator`, `delegation`; max 3 per call, 5-minute attestation expiry).

**Max conditions per call**: 10.

### Condition shapes

**Token balance (ERC-20, SPL, XRP, XRPL trust line, Bitcoin)**:
```json
{
  "type": "token_balance",
  "contractAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "chainId": 8453,
  "threshold": "100",
  "decimals": 6,
  "label": "USDC on Base >= 100"
}
```
- `threshold` is a **decimal string** in token/display units (e.g. `"100"`, not `100`). Keys created from 2026-06-10 sign with `kid: insumer-attest-v2`, which requires the string form to preserve full precision and rejects a JSON number with a `400`. (Older `insumer-attest-v1` keys accept either; a string is safe on both.)
- `decimals` defaults to `18`. Always set it explicitly for USDC / USDT / USDC.e (they're 6).
- For native tokens (ETH, SOL, XRP, BTC), set `contractAddress: "native"`.
- For XRPL trust line tokens, add `currency: "RLUSD"` (or similar currency code).

**NFT ownership (ERC-721, ERC-1155, XRPL NFToken)**:
```json
{
  "type": "nft_ownership",
  "contractAddress": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
  "chainId": 1,
  "label": "Bored Ape holder"
}
```

**EAS attestation (via compliance template)**:
```json
{
  "type": "eas_attestation",
  "template": "coinbase_verified_account",
  "label": "Coinbase KYC verified"
}
```

**EAS attestation (raw)**:
```json
{
  "type": "eas_attestation",
  "schemaId": "0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9",
  "attester": "0x357458739F90461b99789350868CD7CF330Dd7EE",
  "indexer": "0x2c7eE1E5f416dfF40054c27A62f7B357C4E8619C",
  "chainId": 8453,
  "label": "Coinbase Verified Account"
}
```

### Response (live, 2026-04-13)

```json
{
  "ok": true,
  "data": {
    "attestation": {
      "id": "ATST-85ADCD1399EF9C2A",
      "pass": false,
      "results": [
        {
          "condition": 0,
          "label": "USDC on Base >= 100",
          "type": "token_balance",
          "chainId": 8453,
          "met": false,
          "evaluatedCondition": {
            "type": "token_balance",
            "chainId": 8453,
            "contractAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "operator": "gte",
            "threshold": 100,
            "decimals": 6
          },
          "conditionHash": "0x60c2b6298d381185a85767ab332390eda5e9993be93bdeb2c002776bf7464c22",
          "blockNumber": "0x2a93c39",
          "blockTimestamp": "2026-04-13T11:36:53.000Z"
        }
      ],
      "passCount": 0,
      "failCount": 1,
      "attestedAt": "2026-04-13T11:36:55.032Z",
      "expiresAt": "2026-04-13T12:06:55.032Z"
    },
    "sig": "SGyO7nOrviIF/QQMp9lWPhtnIuraV4vrcVJyF0Z1ZWxsOSmXJmDNMzNZEb6KAk96T62iuTqzgr0eYkD+3Xg4YQ==",
    "kid": "insumer-attest-v1",
    "jwt": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Imluc3VtZXItYXR0ZXN0LXYxIn0.eyJwYXNzIjpmYWxzZSwiY29uZGl0aW9uSGFzaCI6WyIweDYwYzJiNjI5OGQzODExODVhODU3NjdhYjMzMjM5MGVkYTVlOTk5M2JlOTNiZGViMmMwMDI3NzZiZjc0NjRjMjIiXSwiYmxvY2tOdW1iZXIiOiIweDJhOTNjMzkiLCJibG9ja1RpbWVzdGFtcCI6IjIwMjYtMDQtMTNUMTE6MzY6NTMuMDAwWiIsInJlc3VsdHMiOlsuLi5dLCJpc3MiOiJodHRwczovL2FwaS5pbnN1bWVybW9kZWwuY29tIiwic3ViIjoiMHhkOGRBNkJGMjY5NjRhRjlEN2VFZDllMDNFNTM0MTVEMzdhQTk2MDQ1IiwianRpIjoiQVRTVC04NUFEQ0QxMzk5RUY5QzJBIiwiaWF0IjoxNzc2MDgwMjE1LCJleHAiOjE3NzYwODIwMTV9.6GSiVkD74qhLPg-Asnb-_9Gcl0G9waTKvfLQZguFx8_HXgGzEUxwiXDTQgeGEWzd46Qk-LsARA6S9zcn22JI7Q"
  },
  "meta": {
    "version": "1.0",
    "timestamp": "2026-04-13T11:36:55.194Z",
    "creditsRemaining": 9,
    "creditsCharged": 1
  }
}
```

### JWT claims (when `format: "jwt"`)

Standard claims:
- `iss`: `"https://api.insumermodel.com"`
- `sub`: the wallet address
- `jti`: the attestation ID (e.g. `"ATST-85ADCD1399EF9C2A"`)
- `iat`: issued-at, Unix seconds
- `exp`: expires-at, Unix seconds (always `iat + 1800` — 30 minutes)

Custom claims:
- `pass`: overall boolean (true only if all conditions met)
- `conditionHash`: array of per-condition SHA-256 hashes (one per condition in the request)
- `blockNumber`: hex block number the conditions were evaluated against
- `blockTimestamp`: ISO 8601 timestamp of that block
- `results`: full per-condition results array (same shape as the top-level `data.attestation.results`)

Header: `{"alg":"ES256","typ":"JWT","kid":"insumer-attest-v1"}`.

Verify the JWT with any standard library pointed at `https://insumermodel.com/.well-known/jwks.json`.

### Key response fields

| Field | Meaning |
|---|---|
| `ok` | Top-level success flag |
| `data.attestation.pass` | True only if ALL conditions met |
| `data.attestation.results[].met` | Per-condition boolean |
| `data.attestation.results[].evaluatedCondition` | Canonical form of the condition that was actually evaluated (may differ from your input if the API normalized operators or defaults) |
| `data.attestation.results[].conditionHash` | SHA-256 of `evaluatedCondition`, prefixed `0x`. Callers can recompute to verify the condition wasn't tampered with. |
| `data.attestation.results[].blockNumber` | Hex block number (all 32 EVM chains; Solana uses `slot`, XRPL uses `ledgerIndex`). API returns 503 if the anchor can't be captured rather than signing a partial result. |
| `data.attestation.results[].blockTimestamp` | ISO 8601 timestamp of the evaluation block |
| `data.sig` | Base64 P1363 ES256 signature over the canonical `data.attestation` object (88 chars) |
| `data.kid` | Signing key ID — look up in JWKS |
| `data.jwt` | Present only when `format: "jwt"` requested; ES256 JWT with claims listed above |
| `meta.creditsRemaining` | Credit balance after this call |
| `meta.creditsCharged` | `1` standard, `2` with `proof: "merkle"` |

### Error responses

| Status | Meaning |
|---|---|
| `400` | Validation error (malformed wallet, unknown chain, missing required field) |
| `401` | Missing or invalid `X-API-Key` |
| `402` | Insufficient credits — top up or upgrade tier |
| `503` | Upstream data source unavailable. No attestation signed, no credits charged. Retry after a short delay. |

All errors follow the `ErrorEnvelope` shape:
```json
{
  "ok": false,
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

---

## `POST /v1/trust`

Curated 36-check wallet trust profile across 4 dimensions. Returns a signed profile with per-check booleans and an overall summary.

### Request

```http
POST https://api.insumermodel.com/v1/trust
Content-Type: application/json
X-API-Key: insr_live_...
```

```json
{
  "wallet": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "solanaWallet": "...",
  "xrplWallet": "...",
  "bitcoinWallet": "..."
}
```

- `wallet` is required (EVM).
- `solanaWallet`, `xrplWallet`, `bitcoinWallet` are all optional; each unlocks additional checks.
- Optional `proof: "merkle"` costs 6 credits instead of 3.

### Response shape

```json
{
  "ok": true,
  "data": {
    "trust": {
      "id": "TRST-A1B2C",
      "wallet": "0xd8dA...",
      "conditionSetVersion": "v1",
      "dimensions": {
        "stablecoins": {
          "checks": [ { "label": "...", "met": true, "chainId": 1, "..." } ],
          "passCount": 3,
          "failCount": 4,
          "total": 7
        },
        "governance": { "checks": [ ... ], "passCount": 0, "failCount": 5, "total": 5 },
        "nfts":       { "checks": [ ... ], "passCount": 0, "failCount": 5, "total": 5 },
        "staking":    { "checks": [ ... ], "passCount": 0, "failCount": 5, "total": 5 },
        "solana":     { "checks": [ ... ], "...": "only present when solanaWallet provided" },
        "xrpl":       { "checks": [ ... ], "...": "only present when xrplWallet provided" }
      },
      "summary": {
        "totalChecks": 36,
        "totalPassed": 3,
        "totalFailed": 33,
        "dimensionsWithActivity": 1,
        "dimensionsChecked": 4
      },
      "profiledAt": "2026-04-13T12:00:00.000Z",
      "expiresAt": "2026-04-13T12:30:00.000Z"
    },
    "sig": "base64 P1363 signature over trust object",
    "kid": "insumer-attest-v1"
  },
  "meta": {
    "creditsRemaining": 97,
    "creditsCharged": 3,
    "version": "1.0",
    "timestamp": "2026-04-13T12:00:00.000Z"
  }
}
```

### Dimensions

- **stablecoins** — USDC + USDT across 7 EVM chains (14 checks)
- **governance** — governance token holdings (UNI, AAVE, COMP, etc.)
- **nfts** — blue-chip NFT collections
- **staking** — staking / LP positions
- **solana** — Solana USDC (only when `solanaWallet` provided)
- **xrpl** — XRPL stablecoins (only when `xrplWallet` provided)
- **bitcoin** — native BTC balance (only when `bitcoinWallet` provided)

Base profile is 44 checks across 25 chains. With optional Solana + XRPL + Bitcoin + Tron wallets it reaches up to 49 checks across 27 chains total.

### Credits

- Standard: 3 credits
- With `proof: "merkle"`: 6 credits

---

## JWKS verification

Fetch the public key once and cache it. Every library that supports ES256 / P-256 JWTs understands the JWKS at <https://insumermodel.com/.well-known/jwks.json>.

The JWKS contains an array of keys. Match on `kid` (currently `insumer-attest-v1`).

See `../examples/gate-express.ts` for a live-verified Node/TypeScript example using `jose`'s `createRemoteJWKSet`.

## Chain IDs

- **EVM**: standard chain IDs (1 for Ethereum, 8453 for Base, 137 for Polygon, 42161 for Arbitrum, 10 for Optimism, etc.)
- **Solana**: `"solana"`
- **XRPL**: `"xrpl"`
- **Bitcoin**: `"bitcoin"`

For the authoritative list of supported chains, GET <https://insumermodel.com/openapi.yaml> and inspect the `ChainId` schema.
