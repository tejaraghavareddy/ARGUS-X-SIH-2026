import { query } from "./_generated/server";

/**
 * Which sign-in methods this deployment can actually deliver.
 *
 * The OTP providers throw when their delivery credentials are absent, and an
 * exception thrown inside `sendVerificationRequest` propagates all the way out
 * of `auth:signIn`. To a worker that surfaces as
 * `[CONVEX A(auth:signIn)] Server Error` — an opaque failure with no idea
 * what went wrong, on a screen whose only option was the one that failed.
 *
 * Email is delivered by Resend (see ./auth/emailOtp.ts) and SMS by Vonage.
 * Both providers also fail if the key is present but wrong — that surfaces as
 * a non-2xx from the vendor, not as a false here — so this reports whether a
 * send is *attemptable*, never whether it succeeded.
 *
 * The screen needs to know in advance so it can offer a method that will
 * actually work. This returns booleans and nothing else: reporting *whether* a
 * key exists is not the same as revealing it, so it is safe to make public.
 */
export const delivery = query({
  args: {},
  handler: async () => {
    return {
      emailOtp: Boolean(process.env.RESEND_API_KEY),
      phoneOtp: Boolean(
        process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET,
      ),
    };
  },
});
