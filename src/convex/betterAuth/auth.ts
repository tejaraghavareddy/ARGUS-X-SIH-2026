import { betterAuth } from "better-auth";
import { createClient } from "@convex-dev/better-auth";
import type { CreateAuth, GenericCtx } from "@convex-dev/better-auth";
import type { GenericDataModel } from "convex/server";
import { components } from "../_generated/api";

/**
 * Better Auth server configuration — the equivalent of the `lib/auth.ts` the
 * generic setup guide asks for.
 *
 * ## Why this lives in src/convex/ and not src/lib/
 *
 * Two hard reasons, both about how Convex builds its bundle:
 *
 *   1. It imports `components` from `_generated/api`, which only exists under
 *      `src/convex/`. Convex discovers functions by following imports from its
 *      own entry points; a config reachable only from `src/lib/` would never
 *      be bundled.
 *   2. It closes over a Convex `ctx`. The database adapter is not a pooled
 *      connection — it is `authComponent.adapter(ctx)`, a set of function
 *      references that read and write through *this request's* transaction.
 *      There is no such thing as a ctx outside a Convex function.
 *
 * The mirror image of the note in src/lib/authProviders.ts, which keeps
 * *server* modules out of `src/lib/` for the same reason in the other
 * direction: `src/lib/` is reachable from the browser bundle.
 *
 * ## No migration step
 *
 * `npx auth migrate` targets a SQL database. This project's database is
 * Convex, and the Better Auth component ships its own schema (user, session,
 * account, verification tables) which `app.use(betterAuth)` in
 * convex.config.ts provisions as part of the deployment. Running the CLI
 * would have nothing to migrate against.
 */

// Exported rather than kept module-private: http.ts needs the same instance
// to register routes. One client per process, not one per importer.
export const authComponent = createClient(components.betterAuth);

/**
 * Browser origins allowed to call Better Auth.
 *
 * Better Auth checks the `Origin` header against this list on every
 * state-changing request, and the CORS layer below reuses it for
 * `Access-Control-Allow-Origin`. Two entries matter:
 *
 *   - SITE_URL — wherever this preview is actually served from. Read from the
 *     deployment rather than hardcoded, because the preview hostname is not
 *     knowable at build time.
 *   - localhost:5173 — this project's dev port (see `dev` in package.json).
 *
 * Anything not listed gets a 403 that looks, to a visitor, exactly like an
 * auth failure. That is why the list is built once and shared rather than
 * spelled out twice.
 */
function trustedOrigins(): string[] {
  const origins = new Set<string>([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);

  const site = process.env.SITE_URL?.trim();
  if (site) {
    try {
      origins.add(new URL(site).origin);
    } catch {
      // A malformed SITE_URL must not take the whole auth router down with
      // it; the dev origins above still work, and the failure surfaces as a
      // rejected cross-origin request rather than a crash.
    }
  }

  return [...origins];
}

/**
 * The Better Auth instance, built fresh per request.
 *
 * `createAuth` is a function rather than a singleton because the adapter
 * needs the current request's Convex ctx — every call gets its own database
 * transaction. Convex Auth's `registerRoutesLazy` invokes it lazily, so this
 * does not execute during deployment push, only when a request arrives.
 */
// `GenericDataModel`, not this app's `DataModel`: `createClient` is called
// without an explicit generic above, so it infers the generic model, and the
// adapter's ctx parameter follows suit. Annotating with the app's narrower
// DataModel made the parameter contravariant-incompatible — a ctx carrying
// only this project's table names is not a ctx that may be used where any
// table name is expected. The adapter only ever touches the component's own
// user/session/account tables, so the generic model is also the honest one.
export const createAuth: CreateAuth<GenericDataModel> = (
  ctx: GenericCtx<GenericDataModel>,
) =>
  betterAuth({
    // Existing database. No new store is created: this hands Better Auth the
    // Convex component's tables and all reads/writes go through ctx.
    database: authComponent.adapter(ctx),

    emailAndPassword: {
      enabled: true,
    },

    // Resolves to `${CONVEX_SITE_URL}/api/auth`, which is where the routes
    // registered in http.ts actually mount. Without it Better Auth derives the
    // origin from the incoming request and any absolute URL it emits (links in
    // emails, redirects) would point at the wrong host.
    baseURL: process.env.CONVEX_SITE_URL,

    // Required — Better Auth throws without it, and in production it also
    // refuses its own built-in default. Set via `convex env set`, never in a
    // committed file.
    secret: process.env.BETTER_AUTH_SECRET,

    trustedOrigins: trustedOrigins(),
  });
