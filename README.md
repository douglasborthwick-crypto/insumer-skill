# insumer-skill

**Wallet auth for Claude Code.** Add condition-based access to any project — token balances, NFT ownership, on-chain eligibility, pre-transaction trust — in whatever language you're writing. One install, one free API key, signature-verifying code on the first try.

> OAuth proves who the user is. Wallet auth proves what the wallet holds. Boolean, not balance.

## What this skill does

When you're working in Claude Code and you ask Claude to "add wallet verification," "gate this endpoint by USDC balance," "check if a wallet holds a specific NFT," or "add a pre-transaction trust check," this skill gives Claude the canonical shapes, verification recipes, and hard-coded reference values for [InsumerAPI](https://insumermodel.com) so the code Claude emits works on the first try.

Concretely, the skill contains:

- `SKILL.md` — the instructions Claude reads when the skill activates
- `reference/endpoints.md` — full request/response shapes for `/v1/attest` and `/v1/trust`, verified against a live call
- `examples/gate-express.ts` — Express middleware that gates an endpoint by USDC balance on Base, with offline JWKS verification via `jose`
- `forbidden.md` — hard stops (things the skill must never emit: inline API keys, unverified responses, raw balance leaks, wrong decimals, Cloud Functions URLs)

## Install

### Option A — Smithery (one line, once it indexes)

```bash
smithery install insumer-skill
```

### Option B — Manual

```bash
git clone https://github.com/douglasborthwick-crypto/insumer-skill.git ~/.claude/skills/insumer
```

Claude Code picks up any skill inside `~/.claude/skills/`. Restart Claude Code after copying and the skill will be available on the next conversation where you mention wallet auth, token gating, condition-based access, or any of the trigger phrases in `SKILL.md`.

## First use

1. Install the skill (above).
2. Generate a free API key — 10 starter credits + 100 `/v1/attest` calls per day, no signup:

   ```bash
   curl -s -X POST https://api.insumermodel.com/v1/keys/create \
     -H "Content-Type: application/json" \
     -d '{"email":"you@example.com","appName":"insumer-skill","tier":"free"}'
   ```

3. Put the returned key in `.env` as `INSUMER_API_KEY`.
4. In Claude Code, describe what you want: *"add wallet verification to my /premium endpoint so it only lets through wallets with at least 100 USDC on Base."*

Claude will use the skill to produce correct, signature-verifying code.

## The primitive

InsumerAPI is a wallet auth primitive: read → evaluate → sign.

1. **Read**: the API reads blockchain state across 33 chains (26 EVM with Merkle proofs, 4 EVM without, plus Solana, XRPL, Bitcoin).
2. **Evaluate**: it evaluates your conditions (token balance threshold, NFT ownership, delegated authority, EAS attestation) against that state.
3. **Sign**: it returns a boolean — pass / fail — signed with ES256 and wrapped in an ES256 JWT with a `kid` that any party can resolve through a public JWKS at `https://insumermodel.com/.well-known/jwks.json`.

The signed boolean is counterparty-portable. Agent A can hand it to Agent B, who can verify it against the JWKS without ever calling the API. There are no secrets to rotate, no identity broker, no static credentials.

**Boolean, not balance**: standard mode returns only the pass/fail result. The wallet's actual holdings never leave the verification layer. Merkle mode is available for callers who need the raw balance for client-side proof reconstruction — it costs double and is opt-in.

## Endpoints (the two the skill uses)

- `POST /v1/attest` — 1–10 custom conditions, per-condition booleans, one overall `pass`. 1 credit.
- `POST /v1/trust` — curated 36-check profile across 4 dimensions (stablecoins, governance, NFTs, staking), up to 39 checks with Solana/XRPL/Bitcoin. 3 credits.

Full shapes in `reference/endpoints.md`.

## Try the example end-to-end (2 minutes)

The `examples/gate-express.ts` file is a working Express server. Verify the full flow — API call, JWKS fetch, offline signature verification, gating — in a scratch dir:

```bash
mkdir /tmp/insumer-skill-try && cd /tmp/insumer-skill-try
npm init -y >/dev/null
npm install express jose tsx typescript @types/express @types/node >/dev/null
curl -sO https://raw.githubusercontent.com/douglasborthwick-crypto/insumer-skill/main/examples/gate-express.ts

# Get a free key (if you haven't already)
curl -s -X POST https://api.insumermodel.com/v1/keys/create \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","appName":"insumer-skill","tier":"free"}'
# → copy the "key" field

# Start the server
INSUMER_API_KEY=insr_live_... npx tsx gate-express.ts
```

In another terminal:

```bash
# Fail path: a wallet without 100 USDC on Base → 403 with signed attestation metadata, no raw balance
curl -sS "http://localhost:3000/premium?wallet=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"

# Success path (lower MIN_USDC in gate-express.ts to 1 for a quick check with a whale):
curl -sS "http://localhost:3000/premium?wallet=0x28C6c06298d514Db089934071355E5743bf21d60"

# Validation path: 400 before any API call
curl -sS "http://localhost:3000/premium?wallet=notawallet"
```

The 403 response includes `attestationId`, `blockNumber`, and `blockTimestamp` — enough for a downstream auditor to re-verify — but never the raw balance. That is boolean-not-balance in practice.

## Related tools

- [`mcp-server-insumer`](https://github.com/douglasborthwick-crypto/mcp-server-insumer) — MCP server for runtime agent access to the same API. Install this if you want an agent to *call* InsumerAPI at runtime; install `insumer-skill` if you want Claude Code to help you *write* code that calls it.
- [`eliza-plugin-insumer`](https://www.npmjs.com/package/eliza-plugin-insumer) — ElizaOS plugin for the same API.
- [`insumer-verify`](https://github.com/douglasborthwick-crypto/insumer-verify) — standalone offline verification library for Node.

## See also

For multi-issuer trust envelope builders: this skill ships the `wallet_state` category of the trust-evidence-format as defined in [agent-governance-vocabulary](https://github.com/aeoess/agent-governance-vocabulary). For the full multi-issuer envelope pattern (9 issuers, 10 dimensions, JWKS-verifiable offline), see [insumer-examples #1](https://github.com/douglasborthwick-crypto/insumer-examples/issues/1).

## License

MIT.
