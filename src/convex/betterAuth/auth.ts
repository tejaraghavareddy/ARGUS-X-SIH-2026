import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import betterAuthConfig from "../betterAuth/authConfig";
import { emailOtp } from "./emailOtp";

/**
 * Better Auth, running inside Convex.
 *
 * ## Why this file exists at all
 *
 * The standard Better Auth setup is `lib/auth.ts` plus an API route handler in
 * `app/api/auth/[...all]/route.ts` — that shape assumes a Next.js server
 * process and a SQL database it can open a connection to. This project is a
 * Vite SPA with a Convex document database, so both halves move:
 *
 *   lib/auth.ts               -> this file
 *   app/api/auth/[...all]     -> registerRoutes() in ../http.ts
 *   a SQL connection string   -> authComponent.adapter(ctx)
 *
 * The adapter is not a hand-rolled database layer. `@convex-dev/better-auth`
 * is a Convex component that owns the `user` / `session` / `account` /
 * `verification` tables, and `adapter(ctx)` hands Better Auth a
 * `DBAdapter` that reads and writes them through Convex queries and mutations.
 * There is no connection string to pass because Convex *is* the database, and
 * the component's own schema is what the tables are created from.
 *
 * ## Not yet the identity layer
 *
 * Convex Auth is still fully live and still owns every `users` row; 19 foreign
 * keys across `src/convex/schema.ts` point at it and 13 modules call
 * `getAuthUserId`. Nothing here replaces that yet. This file makes Better Auth
 * *available and correct* — its own instance, its own tables, its own routes —
 * so the later cutover is a repoint rather than a rewrite. See
 * `authConfig.ts` for why both providers are registered at once.
 */

export const authComponent = createClient<DataModel>(components.betterAuth);

/**
 * The literal Better Auth falls back to when no secret is configured. It is
 * published in better-auth's own source, so it is not a secret in any sense —
 * it is a constant, and a session signed with it is forgeable by anyone who
 * has read the package.
 */
const PUBLISHED_DEFAULT_SECRET = "better-auth-secret-12345678901234567890";

/**
 * Whether this deployment can issue Better Auth sessions.
 *
 * ## Why this is checked at all
 *
 * Better Auth does guard the default secret — but only when
 * `NODE_ENV === "production"`, and Convex's runtime does not set `NODE_ENV` to
 * that. So on Convex the guard never fires: with `BETTER_AUTH_SECRET` unset,
 * Better Auth constructs happily, `/api/auth/convex/jwks` answers 200, and
 * every session is signed with a string anyone can read off npm. Nothing
 * errors. Nothing looks wrong. The system appears to work and is forgeable.
 *
 * That was observed on this deployment, not hypothesised: the routes were
 * reachable and a JWKS was being served while the variable was unset.
 *
 * So the check is made here, explicitly, rather than inherited from a
 * library's environment assumption.
 */
export function betterAuthSecretProblem(): string | null {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    return (
      "BETTER_AUTH_SECRET is not set. Better Auth would otherwise sign every " +
      "session with its published default constant, which is forgeable. Set " +
      "BETTER_AUTH_SECRET (32+ chars) in the project's Keys/API keys tab."
    );
  }
  if (secret === PUBLISHED_DEFAULT_SECRET) {
    return (
      "BETTER_AUTH_SECRET is set to Better Auth's published default value. " +
      "Any session signed with it is forgeable — generate a real one."
    );
  }
  if (secret.length < 32) {
    return (
      `BETTER_AUTH_SECRET is only ${secret.length} characters. Use at least 32.`
    );
  }
  return null;
}

/**
 * The Better Auth instance.
 *
 * Built per call because the Convex adapter is bound to the calling `ctx` —
 * the same shape as `createApiOptions` in the component's own docs. The
 * alternative, a module-level singleton, captures the first request's context
 * and then writes through a dead one.
 *
 * Throws before constructing if the secret is missing or too weak. Combined
 * with `registerRoutesLazy` in ../http.ts, that confines the failure to
 * `/api/auth/*` and leaves Convex Auth's routes — the ones the product
 * actually uses — untouched.
 */
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const problem = betterAuthSecretProblem();
  if (problem) {
    throw new Error(problem);
  }
  return betterAuth({
    // The Better Auth server runs on the Convex *site* URL, not the app's own
    // domain: the browser talks to `${CONVEX_SITE_URL}/api/auth/*` directly.
    baseURL: process.env.CONVEX_SITE_URL,
    // Session cookies are scoped to that site URL, so the app's origin must be
    // trusted explicitly or every cookie write is rejected as cross-origin.
    trustedOrigins: [process.env.SITE_URL!].filter(Boolean),
    // Checked above; passed through so Better Auth never reads an empty value
    // and substitutes its own default.
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      // Makes Better Auth issue the RS256 JWT that `ctx.auth` validates, and
      // serves the JWKS that `getAuthConfigProvider()` points at.
      convex({ authConfig: betterAuthConfig }),
      emailOtp,
    ],
  });
};
