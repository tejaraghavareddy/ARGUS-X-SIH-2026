import { createAuthClient } from "better-auth/react";

/**
 * Better Auth browser client — the `lib/auth-client.ts` from the setup guide,
 * using the React import because this is a React app (`better-auth/react`,
 * not `/client`, `/vue` or `/svelte`).
 *
 * ## Why the base URL needs converting
 *
 * Convex serves two hostnames per deployment:
 *
 *   - `*.convex.cloud` — the function API (queries, mutations, actions)
 *   - `*.convex.site`  — user-defined HTTP routes
 *
 * Better Auth's `/api/auth/*` routes are registered on the HTTP router in
 * src/convex/http.ts, so they live on `.convex.site`. `VITE_CONVEX_URL` points
 * at `.convex.cloud`, because that is what `ConvexReactClient` needs in
 * main.tsx. The two are the same deployment under different hostnames, so the
 * swap is a string replacement on the hostname rather than a second env var
 * for you to maintain.
 *
 * Falls back to same-origin if the var is missing, which is what a Vite
 * dev-server proxy would produce — and is better than silently building a
 * client pointed at an empty string.
 */
const convexUrl = (import.meta.env.VITE_CONVEX_URL ?? "") as string;
const authBaseURL =
  convexUrl.replace(/\.convex\.cloud$/, ".convex.site") || undefined;

/**
 * No `plugins: [convexClient()]` here, deliberately.
 *
 * That plugin bridges Better Auth sessions into Convex-verified JWTs, and it
 * only means anything once the server opts into the same bridge via the
 * `convex()` plugin plus `getAuthConfigProvider()` in
 * src/convex/auth.config.ts. Adding only the client half would advertise a
 * session format the server never issues.
 *
 * The existing Convex Auth session (src/hooks/use-auth.ts) remains what
 * authenticates Convex queries, and it is untouched by this file. This client
 * exists for Better Auth's own email/password endpoints.
 */
export const authClient = createAuthClient({
  baseURL: authBaseURL,
});
