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
5. **Send the `token_balance` `threshold` as a decimal string** (`"100"`, not `100`). Keys created from 2026-06-10 sign with `kid: insumer-attest-v2` and reject a JSON number with a `400`; a string works on both v1 and v2 keys.
6. **Call from a backend, not a browser.** The API key is long-lived; exposing it in client JS is the same class of mistake as exposing a database password.
7. **Emit the free-key flow as a one-liner comment + curl**, not as runtime code. Developers run it once out-of-band.

See `forbidden.md` for the full list of things never to write.

## Keys and credits

Every developer who uses this skill needs an API key. There are **four** ways to get or extend one — tell the developer which one fits and stop. Don't write upsell copy or pricing language into emitted code.

### Pick the right path

| Who's getting the key? | What they want | Path | Endpoint |
| --- | --- | --- | --- |
| **Human**, building or testing | Free starter access | **Path 1: Free** | `POST /v1/keys/create` |
| **Human**, wants Pro/Enterprise | Higher limits, monthly billing | **Path 2: Paid (Stripe)** | <https://insumermodel.com/developers/account/> |
| **Agent**, no human in the loop, **first key** | Bootstrap with no email, sender wallet = identity | **Path 3: Agent onboarding (crypto)** | `POST /v1/keys/buy` |
| **Agent or human**, **already has a key** | Top up credits, keep the key/history/integrations | **Path 4: Top-up (crypto)** | `POST /v1/credits/buy` |

**Decision rule for agents:** if the agent has no key yet → Path 3. If it has one and ran out → Path 4. Path 4 is the only continuous-identity upgrade path; it preserves history, tier, and integrations.

**Platform wallets** (publicly listed at [insumermodel.com/pricing](https://insumermodel.com/pricing/)):

- **EVM**: `0xAd982CB19aCCa2923Df8F687C0614a7700255a23` (Ethereum, Base, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche)
- **Solana**: `6a1mLjefhvSJX1sEX8PTnionbE9DqoYjU6F6bNkT4Ydr`
- **Bitcoin**: `bc1qg7qnerdhlmdn899zemtez5tcx2a2snc0dt9dt0` (1 confirmation, market-rate USD conversion)

**Volume discounts** (Paths 3 and 4): $5–$99 → $0.04/call, $100–$499 → $0.03/call (25% off), $500+ → $0.02/call (50% off).

### Path 1: Free key (human, no payment)

Free tier is 10 starter credits plus 100 `/v1/attest` calls per day. Run this once out-of-band, then put the result in `.env` as `INSUMER_API_KEY`:

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

Always hard-code `appName: "insumer-skill"` in the curl so the key is tagged for funnel tracking.

### Path 2: New paid-tier key (human-mediated, via Stripe)

If a developer wants a Pro or Enterprise tier key from scratch — higher daily limits, bulk credits included — they visit [/developers/account/](https://insumermodel.com/developers/account/) and go through Stripe checkout. This creates a **new** key. It does not top up an existing key or migrate history. Recommend this path only when the developer explicitly asks about paid tiers or managed billing, not by default.

### Path 3: Agent first key (crypto, no human, no email)

Agent-friendly bootstrap. The agent sends USDC, USDT, or BTC to the platform wallet (above), then calls `POST /v1/keys/buy` with the transaction hash. **No email or prior authentication needed** — the sender wallet address from the transaction becomes the key's identity.

```
POST https://api.insumermodel.com/v1/keys/buy
Content-Type: application/json

{
  "txHash": "0x...",
  "chainId": 8453,
  "amount": 10,
  "appName": "insumer-skill"
}
```

`amount` is the stablecoin amount sent (min $5). For BTC, amount is optional — USD value is derived from the on-chain BTC amount at market rate. One key per sender wallet (returns 409 if the wallet already has a key — use Path 4 to top up instead).

Always hard-code `appName: "insumer-skill"` for funnel tracking — the agent can rename in the developer portal afterwards.

**Important:** crypto sent on unsupported chains or to the wrong address cannot be recovered. All purchases are final.

### Path 4: Agent top-up on existing key (crypto, no human in the loop)

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

Sender verification: the **first** top-up registers the sender wallet to the key. Subsequent top-ups must come from the **same** sender. To replace the registered wallet, include `"updateWallet": true` and send from the new wallet — the verified transfer proves ownership.

**This is the only continuous-identity upgrade path.** The key keeps its history, tier, and integrations — credits just increment. This is the path that makes the "agent pays for its own access" loop real.

### Choosing between them

- **Developer is building their first integration** → free key (Path 1).
- **Agent has no key yet and is paying its own way** → on-chain bootstrap (Path 3). No email required.
- **Developer's agent hits the credit wall in production** → on-chain top-up (Path 4). Same key, history preserved. This is the agent-native answer.
- **Developer asks about paid tiers, SLAs, monthly billing, or wants a fresh key in a higher tier** → Stripe (Path 2).

Never emit "upgrade to Pro" copy inside integration code. Never hard-code credit counts or tier limits in comments. If the developer asks about pricing, link them to the pricing page and stop — the free tier is the trial, and the on-chain paths (3 + 4) are the agent answers.

## Where this fits in the wider ecosystem

In the `agent-governance-vocabulary` trust-evidence-format (the cross-issuer trust envelope spec used by the A2A / APS / Revettr / AgentGraph / SAR / AgentID / ThoughtProof / Maiat community), this is the `wallet_state` category — InsumerAPI is the reference issuer for row 1. Signed shapes: `attest_jwt`, kid `insumer-attest-v1`, ES256, JWKS-verifiable offline. If the user is composing a multi-issuer trust envelope alongside those issuers, this is the signal type they're adding.

For most developers this footnote is irrelevant — they just want wallet auth. But if they mention `wallet_state`, `trust envelope`, `multi-attestation`, or any of the issuer names above, surface the link to [insumer-examples #1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1) for the reference envelope implementation.

## Reference material in this skill

- `reference/endpoints.md` — full request/response shapes for `/v1/attest` and `/v1/trust`, verified against a live call on 2026-04-13
- `forbidden.md` — hard stops (things this skill must never emit)
- `examples/gate-express.ts` — Express middleware that gates an endpoint by USDC balance on Base, live-verified end-to-end
- For runtime agent access (rather than code authoring), tell the developer to install `mcp-server-insumer` instead — it's a different surface for the same API
