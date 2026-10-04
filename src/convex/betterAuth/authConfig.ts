import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

/**
 * Better Auth's own view of the Convex auth config.
 *
 * ## Why this is separate from ../auth.config.ts
 *
 * Better Auth's `convex()` plugin reads this object to learn which JWT
 * algorithm to sign with and where the JWKS lives, and it refuses to guess:
 *
 *   Multiple auth providers with applicationID 'convex' detected.
 *   Please use only one.
 *
 * `../auth.config.ts` already holds a provider with `applicationID: "convex"`
 * — the Convex Auth one this app's sign-in screens use today, which stays live
 * through this migration. Passing that file to `convex()` would trip that
 * check, because the plugin filters on `applicationID` and cannot tell the two
 * apart.
 *
 * So the plugin is handed this file, which contains only Better Auth's
 * provider. Convex itself keeps validating against `../auth.config.ts` — both
 * providers are registered there, and `ctx.auth` accepts either token. The
 * duplication is the point: it is what lets both systems be signed-in at once
 * during the cutover.
 *
 * ## What the provider says
 *
 *   issuer:        CONVEX_SITE_URL — where the JWKS is actually served
 *   algorithm:     RS256           — the only algorithm the plugin supports
 *   jwks:          CONVEX_SITE_URL + /api/auth/convex/jwks
 *
 * That JWKS URL is served by the route handler registered in ../http.ts. It
 * does not resolve until Better Auth has issued a signing key, which happens
 * on first request — so a JWT minted before that point fails validation with
 * an unfetchable JWKS, which is why `BETTER_AUTH_SECRET` is required before
 * any Better Auth sign-in is worth trying.
 */
export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
