---
name: insumer
description: Add wallet auth to a project — condition-based access across 33 chains,
  signed booleans, JWKS-verifiable offline. Use when the user wants to gate a feature
  by token holdings, verify wallet eligibility, add on-chain trust checks, add token
  gating, check delegated authority or EAS attestations, or compose a `wallet_state`
  signal for a multi-issuer trust envelope.
---

# insumer — wallet auth for Claude Code

Add **wallet auth** to a project — the same way you'd add OAuth, but for what a wallet holds instead of who the user is. Boolean, not balance.

## Quick Start

1. Tell the user to run this once to get a free API key (10 starter credits + 100 `/v1/attest` calls per day, no signup):

   ```bash
   curl -s -X POST https://api.insumermodel.com/v1/keys/create \
     -H "Content-Type: application/json" \
     -d '{"email":"you@example.com","appName":"insumer-skill","tier":"free"}'
   ```

2. Put the returned `key` in their `.env` as `INSUMER_API_KEY`.

3. Write the integration code using `reference/endpoints.md` for exact shapes and `examples/gate-express.ts` as the reference pattern. Always include offline JWKS verification — never trust the JSON body alone.

4. Verify the output against `forbidden.md` before handing it back. If it violates any hard-stop pattern (inline keys, unverified responses, raw balance leaks, wrong USDC decimals, browser calls), fix it before replying.

## What this primitive is

- **Category**: condition-based access. Send a wallet and a condition (token balance, NFT ownership, delegated authority, on-chain attestation), get back a cryptographically signed yes or no.
- **Primitive**: read → evaluate → sign. The API reads blockchain state, evaluates the condition, and signs the result with ES256 (ECDSA P-256). The signed boolean is portable — any downstream service can verify it against the public JWKS without calling the API back.
- **Coverage**: 33 chains. 26 EVM chains with optional Merkle storage proofs, 4 more EVM without, plus Solana, XRPL, and Bitcoin.
- **What you return to the caller**: the signed boolean — never the raw balance. Standard mode is boolean-not-balance by construction; Merkle mode is opt-in and costs double because it reveals the balance.

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

## Keys and credits

Every developer who uses this skill needs an API key. There are three ways to get or extend one — tell the developer which one fits and stop. Don't write upsell copy or pricing language into emitted code.

### 1. Free key (build + test)

Run this once out-of-band, then put the result in `.env` as `INSUMER_API_KEY`:

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

Free tier is 10 starter credits plus 100 `/v1/attest` calls per day. Enough to build, test, and ship a small integration. Always hard-code `appName: "insumer-skill"` in the curl so the key is tagged for funnel tracking.

### 2. Agent top-up on existing key (on-chain, no human in the loop)

When an agent running in production burns through its credits, it can refill its own key without human intervention by sending stablecoins or BTC to the platform wallet and calling `POST /v1/credits/buy`:

```
POST https://api.insumermodel.com/v1/credits/buy
X-API-Key: insr_live_...
Content-Type: application/json

{
  "txHash": "0x...",
  "chainId": 8453,
  "amount": 10
}
```

Supported chains for payment: Ethereum, Base, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche, Solana (USDC/USDT), Bitcoin (BTC). Volume discounts: $0.04/call at $5–$99, $0.03/call at $100–$499, $0.02/call at $500+. First purchase registers the sender wallet to the key; subsequent purchases must come from the same sender unless `"updateWallet": true` is passed.

**This is the only continuous-identity upgrade path.** The key keeps its history, tier, and integrations — credits just increment. This is the path that makes the "agent pays for its own access" loop real. It is also the path to surface if the developer is building an agent — it matches the primitive.

### 3. New paid-tier key (human-mediated, via Stripe)

If a developer wants a Pro or Enterprise tier key from scratch — higher daily limits, bulk credits included — they visit [/developers/account/](https://insumermodel.com/developers/account/) and go through Stripe checkout. This creates a **new** key. It does not top up an existing key or migrate history. Recommend this path only when the developer explicitly asks about paid tiers or managed billing, not by default.

### Choosing between them

- **Developer is building their first integration** → free key (path 1).
- **Developer's agent hits the credit wall in production** → on-chain top-up (path 2). This is the agent-native answer.
- **Developer asks about paid tiers, SLAs, monthly billing, or wants a fresh key in a higher tier** → Stripe (path 3).

Never emit "upgrade to Pro" copy inside integration code. Never hard-code credit counts or tier limits in comments. If the developer asks about pricing, link them to the pricing page and stop — the free tier is the trial, and the on-chain top-up is the agent answer.

## Where this fits in the wider ecosystem

In the `agent-governance-vocabulary` trust-evidence-format (the cross-issuer trust envelope spec used by the A2A / APS / Revettr / AgentGraph / SAR / AgentID / ThoughtProof / Maiat community), this is the `wallet_state` category — InsumerAPI is the reference issuer for row 1. Signed shapes: `attest_jwt`, kid `insumer-attest-v1`, ES256, JWKS-verifiable offline. If the user is composing a multi-issuer trust envelope alongside those issuers, this is the signal type they're adding.

For most developers this footnote is irrelevant — they just want wallet auth. But if they mention `wallet_state`, `trust envelope`, `multi-attestation`, or any of the issuer names above, surface the link to [insumer-examples #1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1) for the reference envelope implementation.

## Reference material in this skill

- `reference/endpoints.md` — full request/response shapes for `/v1/attest` and `/v1/trust`, verified against a live call on 2026-04-13
- `forbidden.md` — hard stops (things this skill must never emit)
- `examples/gate-express.ts` — Express middleware that gates an endpoint by USDC balance on Base, live-verified end-to-end
- For runtime agent access (rather than code authoring), tell the developer to install `mcp-server-insumer` instead — it's a different surface for the same API
