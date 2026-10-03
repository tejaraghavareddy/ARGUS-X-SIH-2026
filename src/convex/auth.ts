// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { emailOtp } from "./auth/emailOtp";
import { phoneOtp } from "./auth/phoneOtp";
import { demoAdmin } from "./auth/demoAdmin";
import { demoSuperAdmin } from "./auth/demoSuperAdmin";

/**
 * `Anonymous` is registered by reference, and `convexAuth` materialises a
 * function provider by CALLING it with no arguments
 * (`typeof provider === "function" ? provider() : provider`). Called that way,
 * `Anonymous()` builds its config and spreads an empty `...config` into
 * `ConvexCredentials({ id: "anonymous", ... })` — and ConvexCredentials, like
 * Email() and Phone(), hardcodes its own `id` and ignores the one passed in.
 * The provider therefore registered as `"credentials"`, while all three
 * sign-in screens call `signIn("anonymous")`. Guest sign-in threw
 * "Provider `anonymous` is not configured".
 *
 * Passing an explicit id is not enough on its own — the id has to be applied
 * AFTER the factory, which is what this spread does. Same fix, same reason, as
 * ./auth/phoneOtp.ts and ./auth/emailOtp.ts.
 */
const anonymousBase = Anonymous();

/** The id the sign-in screens call. Asserted in src/test/authProviders.test.ts. */
export const ANONYMOUS_PROVIDER_ID = "anonymous";

export const anonymous: typeof anonymousBase = {
  ...anonymousBase,
  id: ANONYMOUS_PROVIDER_ID,
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, phoneOtp, demoAdmin, demoSuperAdmin, anonymous],
});