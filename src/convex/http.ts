import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { authComponent, createAuth } from "./betterAuth/auth";

const http = httpRouter();

// Order matters.
//
// Convex Auth registers `/.well-known/openid-configuration` and
// `/.well-known/jwks.json`. Better Auth's registerRoutesLazy looks that first
// path up with `http.lookup(...)` and only installs its own redirect if the
// path is free — so registering Convex Auth first means Better Auth skips its
// redirect and the deployment keeps serving Convex Auth's OIDC discovery
// document at the URL that src/convex/auth.config.ts already points at.
// Reverse the two lines and the OIDC provider entry would start redirecting
// to a Better Auth endpoint, which is exactly the silent sign-in loop the
// comment in auth.config.ts warns about.
auth.addHttpRoutes(http);

// The route handler the setup guide describes as
// `app/api/auth/[...all]/route.ts`. Convex has no file-based API routes, so
// the equivalent is registering a path prefix on the HTTP router.
//
//   - `Lazy` so `createAuth({})` is not invoked during deployment push, only
//     when a request actually arrives. The eager form constructs a Better Auth
//     instance at module load, which needs BETTER_AUTH_SECRET to be present
//     and would fail the whole push if it were not.
//   - `cors: true` because the browser runs on a different origin (the
//     preview host) than `.convex.site`. Without it every call dies at the
//     preflight and surfaces to a visitor as a generic network error.
authComponent.registerRoutesLazy(http, createAuth, {
  cors: true,
});

export default http;
