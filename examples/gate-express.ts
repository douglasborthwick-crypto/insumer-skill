// gate-express.ts
//
// Express middleware that gates an endpoint by wallet auth.
// Checks that a wallet holds >= 100 USDC on Base, verifies the response
// offline against the InsumerAPI JWKS, and lets the request through
// if and only if the signed boolean says yes.
//
// Prereqs:
//   npm install express jose
//
// Free API key (run once, put the result in .env):
//   curl -s -X POST https://api.insumermodel.com/v1/keys/create \
//     -H "Content-Type: application/json" \
//     -d '{"email":"you@example.com","appName":"insumer-skill","tier":"free"}'
//
// Env vars:
//   INSUMER_API_KEY=insr_live_...
//
// Verified against a live /v1/attest response on 2026-04-13.

import express, { type Request, type Response, type NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const INSUMER_API = "https://api.insumermodel.com";
const INSUMER_JWKS_URL = new URL("https://insumermodel.com/.well-known/jwks.json");
const INSUMER_ISSUER = "https://api.insumermodel.com";

// USDC on Base — canonical contract, 6 decimals.
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_CHAIN_ID = 8453;
const MIN_USDC = "100"; // decimal string — v2 keys require the token_balance threshold as a string

// Cache the JWKS across requests. createRemoteJWKSet handles TTL + rotation.
const jwks = createRemoteJWKSet(INSUMER_JWKS_URL);

interface AttestClaims extends JWTPayload {
  pass: boolean;
  conditionHash: string[];
  blockNumber: string;
  blockTimestamp: string;
  results: Array<{
    condition: number;
    label: string;
    type: string;
    chainId: number | string;
    met: boolean;
    evaluatedCondition: Record<string, unknown>;
    conditionHash: string;
    blockNumber?: string;
    blockTimestamp?: string;
  }>;
}

interface InsumerResponse {
  ok: boolean;
  data?: {
    attestation: {
      id: string;
      pass: boolean;
      results: unknown[];
      attestedAt: string;
      expiresAt: string;
    };
    sig: string;
    kid: string;
    jwt: string;
  };
  error?: { code: string; message: string };
}

async function attestUsdcOnBase(wallet: string): Promise<AttestClaims> {
  const apiKey = process.env.INSUMER_API_KEY;
  if (!apiKey) {
    throw new Error("INSUMER_API_KEY is not set. Generate one with the curl in the file header.");
  }

  const res = await fetch(`${INSUMER_API}/v1/attest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      wallet,
      format: "jwt",
      conditions: [
        {
          type: "token_balance",
          contractAddress: USDC_BASE,
          chainId: BASE_CHAIN_ID,
          threshold: MIN_USDC,
          decimals: 6, // USDC is 6, not the default 18
          label: `USDC on Base >= ${MIN_USDC}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as InsumerResponse;
    throw new Error(
      `InsumerAPI /v1/attest failed: ${res.status} ${body.error?.code ?? ""} ${body.error?.message ?? ""}`.trim(),
    );
  }

  const body = (await res.json()) as InsumerResponse;
  if (!body.ok || !body.data?.jwt) {
    throw new Error("InsumerAPI returned ok:false or missing jwt field");
  }

  // Verify the signature offline against the public JWKS. This is the
  // whole point — the JSON body alone is untrusted, the signature is what
  // makes it portable and counterparty-auditable.
  const { payload } = await jwtVerify(body.data.jwt, jwks, {
    issuer: INSUMER_ISSUER,
    algorithms: ["ES256"],
  });

  return payload as AttestClaims;
}

/**
 * Express middleware. Expects the wallet address in req.query.wallet.
 * Replace with however your app surfaces the user wallet (session,
 * signed cookie, SIWE, wagmi callback, etc).
 */
export function gateByUsdcOnBase(req: Request, res: Response, next: NextFunction): void {
  const wallet = (req.query.wallet as string | undefined)?.trim();

  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    res.status(400).json({ error: "missing or malformed wallet" });
    return;
  }

  attestUsdcOnBase(wallet)
    .then((claims) => {
      if (claims.pass !== true) {
        res.status(403).json({
          error: "wallet does not meet eligibility condition",
          condition: `USDC on Base >= ${MIN_USDC}`,
          // Note: we never expose the raw balance, only the signed boolean.
          // That is the whole point of boolean-not-balance.
          attestationId: claims.jti,
          blockNumber: claims.blockNumber,
          blockTimestamp: claims.blockTimestamp,
        });
        return;
      }

      // Signature verified, wallet meets the condition. Carry on.
      // Attach the claims to the request so downstream handlers can read
      // the signed context without re-calling the API.
      (req as Request & { insumer?: AttestClaims }).insumer = claims;
      next();
    })
    .catch((err: Error) => {
      res.status(502).json({ error: `wallet auth check failed: ${err.message}` });
    });
}

// --- demo app ------------------------------------------------------------

const app = express();

app.get("/premium", gateByUsdcOnBase, (req: Request, res: Response) => {
  const claims = (req as Request & { insumer?: AttestClaims }).insumer;
  res.json({
    ok: true,
    message: "welcome — wallet is eligible",
    wallet: claims?.sub,
    attestationId: claims?.jti,
    blockNumber: claims?.blockNumber,
    expiresAt: claims ? new Date(((claims.exp as number) ?? 0) * 1000).toISOString() : null,
  });
});

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`gate-express listening on :${port}`);
    console.log(`try: curl "http://localhost:${port}/premium?wallet=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"`);
  });
}

export { app, attestUsdcOnBase };
