import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { authComponent, createAuth } from "./betterAuth/auth";

const http = httpRouter();

// Convex Auth's own routes (/api/auth/signIn, /api/auth/signOut, the OIDC
// discovery document). These are what every sign-in screen in this app calls
// today and they stay exactly as they were.
auth.addHttpRoutes(http);

/**
 * Better Auth's routes, mounted at the same `/api/auth` prefix it uses in every
 * other framework — `${CONVEX_SITE_URL}/api/auth/*`.
 *
 * ## This is the API route handler
 *
 * The standard Better Auth setup ends with `app/api/auth/[...all]/route.ts`.
 * That file exists because Next.js needs somewhere to receive HTTP requests.
 * Convex has no such place: `http.ts` *is* the request entry point, so
 * registering the handler here is the whole of that step.
 *
 * ## Lazy, and why that matters right now
 *
 * `registerRoutesLazy` rather than `registerRoutes`. The eager variant calls
 * `createAuth({})` at module load, and Better Auth throws at construction if
 * `BETTER_AUTH_SECRET` is unset — which would take down the *entire*
 * deployment's HTTP surface, Convex Auth's routes included, over a missing
 * variable in an auth system that is not yet the one in use. The lazy variant
 * defers construction to the first request, so a deployment without the secret
 * serves everything else normally and fails only if someone actually calls
 * `/api/auth/*`.
 *
 * ## cors: true, not optional
 *
 * This is a browser SPA on `SITE_URL` calling `CONVEX_SITE_URL` — a different
 * origin. Without CORS the browser drops every response, and Better Auth's
 * session cookie with it. The component derives allowed origins from
 * `trustedOrigins`, which ./betterAuth/auth.ts sets to SITE_URL.
 */
authComponent.registerRoutesLazy(http, createAuth, { cors: true });

export default http;
