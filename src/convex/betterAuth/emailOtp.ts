/**
 * Better Auth's `emailOTP` plugin, pointed at this project's existing SendGrid
 * transport.
 *
 * ## The plugin does not send email
 *
 * `emailOTP({...})` ships with an **empty** `sendVerificationOTP` callback. It
 * validates a code, stores it, expires it — and sends nothing at all. Wiring it
 * up without a sender produces a sign-in flow that reports success and delivers
 * nothing, which is the one failure mode this project treats as unacceptable.
 *
 * So the callback is not optional glue here, it is the feature.
 *
 * ## Why it reuses ../auth/emailOtp instead of copying it
 *
 * The Convex Auth path already sends through SendGrid with a tested payload
 * shape, a named failure per HTTP status, and masked addresses. Better Auth's
 * callback gets `{ email, otp, type }` — no Auth.js request object — so it is a
 * different signature but the same job. `sendSigninEmail` is that job as a
 * plain function, so both paths share one transport and one set of messages.
 *
 * ## Why this awaits the send
 *
 * Better Auth's own docs say "do not await the email sending, to avoid timing
 * attacks" and suggests `waitUntil`. That advice is written for a long-lived
 * Node server. On Convex the function is frozen the moment its handler returns,
 * so an unawaited `fetch` would simply never complete — a code that is stored
 * and never delivered, with a success response. Awaiting is the correct choice
 * on this runtime; the timing signal is a theoretical concern next to a real
 * one.
 */

import { emailOTP } from "better-auth/plugins";
import { sendSigninEmail, SIGNIN_CODE_LENGTH } from "../auth/emailOtp";

/** 15 minutes, matching the Convex Auth `email-otp` provider's `maxAge`. */
const OTP_EXPIRES_IN_SECONDS = 60 * 15;

export const emailOtp = emailOTP({
  otpLength: SIGNIN_CODE_LENGTH,
  expiresIn: OTP_EXPIRES_IN_SECONDS,
  // Sign-in must not silently create an account: an address that has never
  // used this app gets an explicit failure rather than a new profile it did
  // not ask for. Account creation stays an explicit act.
  disableSignUp: true,
  async sendVerificationOTP({ email, otp }) {
    await sendSigninEmail({ email, token: otp });
  },
});
