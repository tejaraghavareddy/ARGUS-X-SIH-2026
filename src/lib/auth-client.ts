import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Better Auth in the browser.
 *
 * `better-auth/react` is the React entry point — it adds `useSession()`,
 * `useAuth()` and friends as hooks. This is a Vite + React app, so per the
 * framework table this is the correct specifier (`better-auth/vue`,
 * `/svelte`, `/client` are for the other frameworks and none are installed).
 *
 * ## `baseURL` points at Convex, not at this app
 *
 * The Better Auth server is the Convex deployment, mounted at
 * `${CONVEX_SITE_URL}/api/auth` by `src/convex/http.ts`. It is not this app's
 * own origin, which is why the component's `crossDomain` handling and the
 * `cors: true` registration both exist. Pointing this at `window.location`
 * would 404 against Vite's dev server.
 *
 * ## Not wired into the app yet
 *
 * `src/main.tsx` still mounts `ConvexAuthProvider`. Swapping it for
 * `ConvexBetterAuthProvider` is the cutover step, and it cannot happen before
 * Better Auth sessions are mapped onto this project's `users` rows — 19
 * foreign keys in `src/convex/schema.ts` point at that table and every
 * permission check in the app reads from it. Until then this export is
 * unused, deliberately: it is the client half of the migration, kept
 * compiling and kept honest so the cutover is a provider swap rather than a
 * day of wiring.
 *
 * ## VITE_CONVEX_SITE_URL
 *
 * `VITE_CONVEX_URL` (the `.convex.cloud` API host) is already set for the
 * Convex React client and is not enough here — Better Auth's HTTP routes and
 * JWKS are served from the `.convex.site` host. Both are derived from the same
 * deployment name, so a missing value falls back to that derivation rather
 * than sending requests to `undefined`.
 */
function convexSiteUrl(): string {
  const configured = import.meta.env.VITE_CONVEX_SITE_URL as
    | string
    | undefined;
  if (configured) return configured;

  const apiUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (!apiUrl) {
    throw new Error(
      "VITE_CONVEX_URL is not set — the Better Auth client cannot find its server.",
    );
  }
  // https://adjective-animal-123.convex.cloud -> https://adjective-animal-123.convex.site
  return apiUrl.replace(/\.convex\.cloud(?=$|\/)/, ".convex.site");
}

export const authClient = createAuthClient({
  baseURL: convexSiteUrl(),
  plugins: [
    // Teaches the client that the Convex JWT comes from
    // `${CONVEX_SITE_URL}/api/auth/convex/token` rather than from the app.
    convexClient(),
  ],
});
