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
/**
 * Whether email sign-in can be attempted: one credential, `RESEND_API_KEY`.
 *
 * Exported as its own function rather than inlined in the handler so the rule
 * can be asserted directly. The gate decides whether the sign-in screens
 * offer email at all, and both failure directions are silent — too strict and
 * a working method stays hidden, too loose and a dead button is put in front
 * of a user whose code will never arrive.
 *
 * One credential is the whole requirement. Resend authenticates with an API
 * key alone and falls back to its `onboarding@resend.dev` testing sender when
 * `RESEND_FROM_EMAIL` is unset, so a key is a complete configuration. The
 * SendGrid setup this replaced needed two values (key *and* a verified sender
 * address) and that is why email sign-in could never be switched on from a
 * single pasted credential.
 */
export function emailOtpAvailable(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Whether SMS sign-in can be attempted.
 *
 * Vonage genuinely needs both halves — a key alone authenticates nothing, and
 * a secret alone is not a credential — so unlike email this one is not
 * reducible to a single value.
 */
export function phoneOtpAvailable(): boolean {
  return Boolean(process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET);
}

export const delivery = query({
  args: {},
  handler: async () => {
    return {
      emailOtp: emailOtpAvailable(),
      phoneOtp: phoneOtpAvailable(),
    };
  },
});
