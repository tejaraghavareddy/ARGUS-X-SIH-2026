import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

// Freebuff-signed federated tokens (see freebuff web's
// src/lib/vly-convex-jwt.ts) let a signed-in freebuff.com user carry their
// identity into this project without going through local sign-in. customJwt
// is correct for this provider: freebuff's tokens and JWKS both carry a
// `kid` header, which the customJwt validation path requires.
const freebuffIssuer =
  process.env.VLY_CONVEX_AUTH_ISSUER ?? "https://freebuff.com";

export default {
  providers: [
    // Standard Convex Auth provider for this project's own sign-in ("Get
    // Started" email/guest, see src/convex/auth.ts). The deployment
    // self-issues JWTs (iss = CONVEX_SITE_URL, no `kid` header) validated
    // via OIDC discovery at `${domain}/.well-known/openid-configuration`,
    // served by auth.addHttpRoutes() in convex/http.ts. Do NOT convert this
    // entry to `type: "customJwt"` — that path rejects tokens without a
    // `kid` header, so sign-in would silently never confirm and RequireAuth
    // would loop back to /auth forever.
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
    {
      type: "customJwt",
      issuer: freebuffIssuer,
      jwks: `${freebuffIssuer}/api/web/.well-known/jwks.json`,
      applicationID: "vly-convex",
      algorithm: "RS256",
    },

    // Better Auth's own provider (see ./betterAuth/authConfig.ts). Added
    // alongside the two above rather than replacing them, because both
    // identity systems are signed-in-capable at once during the migration and
    // `ctx.auth` has to accept either token. Three providers is not a
    // conflict: Convex matches on the token's issuer, and these three have
    // three different ones.
    //
    // Do NOT hand this file to Better Auth's `convex()` plugin — it filters
    // providers on `applicationID === "convex"` and throws if it finds more
    // than one, which the entry above guarantees. The plugin gets
    // ./betterAuth/authConfig.ts instead, which holds only this provider.
    getAuthConfigProvider(),
  ],
} satisfies AuthConfig;
