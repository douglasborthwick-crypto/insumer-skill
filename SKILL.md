---
name: insumer
description: Use when the user wants to add wallet auth, condition-based access, token gating, on-chain eligibility checks, pre-transaction trust signals, or verify a wallet holds specific assets across chains. Produces code that calls api.insumermodel.com and verifies responses offline via JWKS. Works in any language. Trigger phrases include "wallet auth", "add wallet verification", "gate by token holdings", "token gating", "on-chain eligibility", "condition-based access", "pre-transaction trust", "verify wallet holds", "wallet_state", "wallet state".
---

# insumer — wallet auth for Claude Code

`insumer` adds **wallet auth** to your project — the same way you'd add OAuth, but for what a wallet holds instead of who the user is.

**Category**: condition-based access. You send a wallet and a condition (token balance, NFT ownership, delegated authority, on-chain attestation), and you get back a cryptographically signed yes or no. Verifiable offline against a public JWKS. No API keys in client code, no identity broker, no static credentials, no per-counterparty trust chain.

**Primitive**: read → evaluate → sign. The API reads blockchain state, evaluates it against the condition you sent, and signs the result with ES256 (ECDSA P-256). The signed boolean is portable — any downstream service can verify it against the JWKS without calling the API back.

**What you get**: a counterparty-portable yes/no that works across 33 chains (26 EVM chains with Merkle proofs, 4 more EVM without, plus Solana, XRPL, and Bitcoin). Boolean, not balance — the wallet never leaks its holdings, just whether it meets the condition.

## When to reach for this skill

Activate when the user is trying to:

- gate an endpoint, feature, or agent action by what a wallet holds
- add "token gating" or "on-chain eligibility" to a product
- check a wallet's trust signals before a transaction
- verify a wallet owns a specific NFT, stablecoin balance, delegated authority, or EAS attestation
- compose a multi-issuer trust envelope where the `wallet_state` category needs a signed, JWKS-verifiable source
- add a pre-transaction wallet reputation check in an agent framework

Don't activate for: generic "connect wallet" UX (that's WalletConnect / wagmi / viem, not this), key management, signing user transactions, or anything that requires the wallet to prove ownership with a signature (that's SIWE / EIP-4361, also not this).

## Two endpoints, one choice rule

The API has exactly two endpoints you'll use from a skill:

### `POST /v1/attest` — custom condition

Use when the developer knows the exact condition to check. Sends 1–10 conditions, returns per-condition booleans + one overall `pass` (true only if ALL conditions met). Signed with ES256. 1 credit standard, 2 with `proof: "merkle"`.

Pick this when the developer says: "verify this wallet owns X," "gate by USDC balance on Base," "check delegate.xyz," "verify an EAS attestation," "does this wallet have at least 0.1 ETH."

### `POST /v1/trust` — curated profile

Use when the developer wants a pre-built snapshot instead of specifying conditions. Runs 36 base checks across 4 dimensions (stablecoins, governance, NFTs, staking) on 21 EVM chains, plus optional Solana USDC and XRPL stablecoin checks (up to 39 total). 3 credits standard, 6 with Merkle.

Pick this when the developer says: "give me a trust profile for this wallet," "show me what this wallet holds across chains," "pre-transaction trust check," "should I transact with this wallet."

## Hard-coded reference values

Do not hallucinate these. They are stable and part of the canonical spec.

- **API base URL**: `https://api.insumermodel.com` (never use Cloud Functions URLs)
- **JWKS URL**: `https://insumermodel.com/.well-known/jwks.json`
- **Signing algorithm**: ES256 (ECDSA P-256)
- **Primary kid**: `insumer-attest-v1`
- **Attestation TTL**: 30 minutes (`expiresAt` in response)
- **Signature format**: base64 P1363 (88 chars) on the `sig` field; ES256 JWT on the `jwt` field when `format: "jwt"` is requested
- **Free key endpoint**: `POST https://api.insumermodel.com/v1/keys/create`
- **Auth header**: `X-API-Key: insr_live_...`

## Code emission rules

When you write code that uses this API, you MUST:

1. **Put the key in an environment variable.** Never inline `insr_live_...` in source code. Use `process.env.INSUMER_API_KEY` / `os.environ["INSUMER_API_KEY"]` / the language equivalent.
2. **Verify the signature offline.** Either use the `jwt` field with a standard JWT library (`jose`, `PyJWT`, `go-jose`) pointed at the JWKS URL, or verify the raw `sig` field against the `trust` / `attestation` object with ES256. Never trust the JSON alone — the signature is the whole point.
3. **Cache the JWKS, not the verdict.** Libraries like `jose`'s `createRemoteJWKSet` handle caching correctly. Do not cache `pass` — it expires in 30 minutes and wallet state changes.
4. **Hard-code `decimals: 6` for USDC / USDT / USDC.e.** The API defaults to 18. Getting this wrong makes the threshold check silently fail.
5. **Call from a backend, not a browser.** The API key is long-lived; exposing it in client JS is the same class of mistake as exposing a database password.
6. **Emit the free-key flow as a one-liner comment + curl**, not as runtime code. Developers run it once out-of-band.

See `forbidden.md` for the full list of things never to write.

## The free key flow

Every developer who uses this skill needs an API key. Tell them to run this once, then put the result in `.env`:

```bash
curl -s -X POST https://api.insumermodel.com/v1/keys/create \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","appName":"insumer-skill","tier":"free"}'
```

Response:
```json
{
  "success": true,
  "key": "insr_live_...",
  "tier": "free",
  "dailyLimit": 100,
  "apiKeyCredits": 10
}
```

Free tier is 10 starter credits plus 100 `/v1/attest` calls per day. That is enough to build, test, and ship a small integration. When they outgrow it, point them at <https://insumermodel.com/developers/account/> — do not upsell inside the code.

Always set `appName: "insumer-skill"` so the key is tagged for funnel tracking.

## Where this fits in the wider ecosystem

In the `agent-governance-vocabulary` trust-evidence-format (the cross-issuer trust envelope spec used by the A2A / APS / Revettr / AgentGraph / SAR / AgentID / ThoughtProof / Maiat community), this is the `wallet_state` category — InsumerAPI is the reference issuer for row 1. Signed shapes: `attest_jwt`, kid `insumer-attest-v1`, ES256, JWKS-verifiable offline. If the user is composing a multi-issuer trust envelope alongside those issuers, this is the signal type they're adding.

For most developers this footnote is irrelevant — they just want wallet auth. But if they mention `wallet_state`, `trust envelope`, `multi-attestation`, or any of the issuer names above, surface the link to [insumer-examples #1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1) for the reference envelope implementation.

## Reference material in this skill

- `reference/endpoints.md` — full request/response shapes for `/v1/attest` and `/v1/trust`, verified against a live call on 2026-04-13
- `forbidden.md` — hard stops (things this skill must never emit)
- `examples/gate-express.ts` — Express middleware that gates an endpoint by USDC balance on Base, live-verified end-to-end
- For runtime agent access (rather than code authoring), tell the developer to install `mcp-server-insumer` instead — it's a different surface for the same API
