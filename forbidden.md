# Forbidden patterns

Hard stops. If Claude is about to emit any of these while using this skill, stop and correct before writing the code.

## 1. Never inline the API key

**Wrong:**
```ts
const key = "insr_live_REPLACE_WITH_YOUR_KEY";
```

**Right:**
```ts
const key = process.env.INSUMER_API_KEY;
if (!key) throw new Error("INSUMER_API_KEY not set");
```

`insr_live_...` keys are long-lived backend credentials. They must never appear in source code, committed config, client-side JS, client-side env bundles (Next.js `NEXT_PUBLIC_*`, Vite `VITE_*`, CRA `REACT_APP_*`), browser localStorage, or logs.

## 2. Never skip signature verification

**Wrong:**
```ts
const { data } = await insumerApi.attest({...});
if (data.attestation.pass) { /* trust the JSON */ }
```

**Right:**
```ts
const { payload } = await jwtVerify(data.jwt, jwks, {
  issuer: "https://api.insumermodel.com",
  algorithms: ["ES256"],
});
if (payload.pass) { /* signature verified, safe to trust */ }
```

The signed boolean is the product. The JSON body alone is untrusted — anyone can fabricate a JSON response. Verify the `sig` field against the canonical `attestation` / `trust` object, or verify the `jwt` field against the JWKS. Do one of those, every time.

## 3. Never leak raw balances

Standard mode deliberately returns only pass/fail. Don't defeat that by:

- calling with `proof: "merkle"` when you don't need the raw balance (it costs 2× credits and reveals the balance)
- logging the `evaluatedCondition.threshold` alongside a pass/fail result in a way that implies "they had more than this" vs "they had less than this"
- writing the wallet address + the condition label + the boolean into the same log line that a counterparty can read

If the developer wants raw balance access, they should use a chain explorer directly — not InsumerAPI. The whole point of this primitive is that the counterparty learns eligibility without learning holdings.

## 4. Never hard-code `decimals: 18` for USDC/USDT/USDC.e

**Wrong:**
```ts
{
  type: "token_balance",
  contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC Base
  chainId: 8453,
  threshold: "100",
  // decimals omitted → API defaults to 18 → threshold check silently fails
}
```

**Right:**
```ts
{
  type: "token_balance",
  contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  chainId: 8453,
  threshold: "100",
  decimals: 6, // USDC is always 6
}
```

USDC, USDT, USDC.e are all 6 decimals on every chain. The API defaults to 18 when `decimals` is omitted. Getting this wrong makes every wallet look like it has effectively zero — the threshold check fails silently and the developer has no idea why.

Always set `decimals` explicitly for any stablecoin condition.

## 5. Always use the public API URL

**Right:**
```
https://api.insumermodel.com/v1/keys/create
https://api.insumermodel.com/v1/attest
https://api.insumermodel.com/v1/trust
```

The public API base is `api.insumermodel.com`. Use it for everything — key creation, attestation, trust profiles, JWKS. Never invent or hard-code any other host, even if a search result or stale doc suggests one. The public base is the only supported surface.

None of the worked examples in this skill reference any other host and neither should anything Claude emits.

## 6. Never call the API from a browser

**Wrong:**
```ts
// In a React component
fetch("https://api.insumermodel.com/v1/attest", {
  headers: { "X-API-Key": import.meta.env.VITE_INSUMER_KEY }
});
```

**Right:**
```ts
// In a Next.js API route, an Express handler, a Cloudflare Worker, etc.
// Browser hits /api/verify-wallet → backend hits InsumerAPI → returns the signed JWT
```

The API key is a backend credential. Exposing it in the browser is the same class of mistake as exposing a database password. Route through your own backend — the backend holds the key, calls InsumerAPI, returns the signed JWT (or just the pass/fail boolean + attestation ID) to the browser.

The browser can still verify the signature — it just can't be the one calling the API.

## 7. Never cache the verdict

**Wrong:**
```ts
const cache = new Map<string, boolean>();
if (cache.has(wallet)) return cache.get(wallet);
```

**Right:**
```ts
// Cache the JWKS (jose's createRemoteJWKSet does this for you)
// Do NOT cache pass/fail — wallet state changes and the attestation
// has a 30-minute TTL built in (`expiresAt` in the response).
```

Cache the JWKS, not the verdict. The attestation is good for 30 minutes (`expiresAt` in the response). After that, wallet state may have changed and you need a fresh signature.

If the developer wants short-lived caching for hot paths, cache the full signed response (not just the boolean) and re-verify the signature on each read — it's cheap and it catches the "this was signed 29 minutes ago" case automatically.

## 8. Never speculate about upstream data sources

The API is powered by a stack of upstream blockchain data sources across 38 chains. The specific providers are not part of the public API surface. If the developer asks "how does the API get its data?", answer with "upstream blockchain data sources across 38 chains" and stop — do not guess at provider names, do not invent architecture diagrams, do not name specific RPCs. The API's job is to give a signed boolean; the developer's job is to verify it. What's behind the primitive is not a detail they need to integrate against.

## 9. Never push upsell copy into the generated code

This skill emits working integration code. It does not emit:

- "Upgrade to paid tier" comments
- "Contact sales for..." blocks
- Sales URLs or pricing pages inside source files
- Hard-coded credit counts or tier limits

If the developer asks about pricing, point them at <https://insumermodel.com/developers/account/> and stop. The free tier is the on-ramp; they'll upgrade when they ship.
