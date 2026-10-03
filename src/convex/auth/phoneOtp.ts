import { Phone } from "@convex-dev/auth/providers/Phone";
// Relative, not the "@/" alias: Convex's own bundler does not resolve the
// Vite alias, so a specifier that works in the browser fails to deploy here.
import {
  PHONE_PROVIDER_ID,
  normalisePhone,
} from "../../lib/authProviders";
import axios from "axios";

// Re-exported so existing server-side imports (authThrottle, tests) keep
// working while the implementation lives in the shared module the sign-in
// screen also imports.
export { normalisePhone };

/**
 * Phone sign-in for gig workers.
 *
 * A worker registering with the federation is far more likely to have a phone
 * in their hand than an inbox, so the worker portal accepts a mobile number as
 * its identifier alongside email.
 *
 * Delivery uses Vonage's Messages API rather than their Verify product on
 * purpose: Convex Auth generates the code and stores it against the session,
 * and its `Phone` provider verifies the code the worker types against that
 * stored value. Verify would have Vonage generate its own code, which we then
 * could not match. Sending the token ourselves keeps the two in sync and works
 * with any SMS gateway.
 *
 * Keys are read from the deployment environment, never inlined here, because
 * this file ships with the deployment.
 *
 * Set in the project's Keys/API keys tab:
 *   VONAGE_API_KEY     — Vonage API key id
 *   VONAGE_API_SECRET  — Vonage API secret
 *   VONAGE_SMS_SENDER  — registered alphanumeric sender id (default below)
 *
 * Abuse note: as with email, the Auth.js provider hands this callback only the
 * request params and no database context, so throttling cannot live here. It is
 * enforced one layer out by `authThrottle.requestPhoneOtp`, which every screen
 * must call before asking for a code.
 */

const MESSAGES_URL = "https://messages.nexmo.com/v1/messages";

/** How long a code stays usable, in minutes. Also stated in the SMS text. */
export const CODE_TTL_MIN = 10;

/** A short, human-readable form for logs, so a failure never leaks a full number. */
function maskPhone(e164: string): string {
  return `••••• ${e164.slice(-5)}`;
}

/**
 * Turn a Vonage refusal into something a developer can act on.
 *
 * The raw payload alone reads as a blank failure, and Convex renders the
 * thrown message client-side as a bare `[CONVEX A(auth:signIn)] Server Error`.
 * Naming the cause turns that into a concrete next step.
 *
 * An unregistered sender id and an exhausted trial balance are the two that
 * bite on a fresh account, and neither is inferable from the status code.
 */
export function describeVonageFailure(
  to: string,
  status: number,
  body: string,
): string {
  const who = maskPhone(to);

  if (status === 401) {
    return (
      `SMS delivery failed for ${who}: Vonage rejected the credentials (401). ` +
      `Check VONAGE_API_KEY and VONAGE_API_SECRET in the Keys tab.`
    );
  }
  if (status === 402 || /balance/i.test(body)) {
    return (
      `SMS delivery failed for ${who}: the Vonage account has no credit (402). ` +
      `Top up, or use the free trial credit that new accounts start with.`
    );
  }
  // An alphanumeric sender must be registered on the account, so a refusal
  // here is usually the sender rather than the credentials.
  if (status === 403 || /sender/i.test(body)) {
    return (
      `SMS delivery failed for ${who}: Vonage refused the sender. ` +
      `VONAGE_SMS_SENDER defaults to "SahakarSeva" — an alphanumeric id must be ` +
      `registered on the account, so either register it in the Vonage dashboard ` +
      `or leave VONAGE_SMS_SENDER unset and use a numeric sender.`
    );
  }
  // Throttling is checked before the route branch: they are different
  // problems, and a rate-limited request must not be reported as an
  // unroutable number.
  if (status === 429 || /too many|throttl|rate limit/i.test(body)) {
    return (
      `SMS delivery failed for ${who}: Vonage throttled the request (429). ` +
      `Back off and retry, or raise the account's throughput limit.`
    );
  }
  // 422 is what Vonage returns for an unroutable destination. Trial accounts
  // frequently have no route to +91.
  if (status === 422 || /not.*rout|invoice account/i.test(body)) {
    return (
      `SMS delivery failed for ${who}: Vonage has no route for Indian numbers ` +
      `on this account. Trial accounts often cannot reach +91 — enable the ` +
      `India route in the Vonage dashboard.`
    );
  }
  return `SMS delivery failed for ${who}: ${status} ${body.slice(0, 300)}`;
}

const base = Phone({
  async sendVerificationRequest({ identifier, token }) {
    const apiKey = process.env.VONAGE_API_KEY;
    const apiSecret = process.env.VONAGE_API_SECRET;
    if (!apiKey || !apiSecret) {
      // Surface the misconfiguration in the server log instead of letting it
      // look to the worker like their phone number is unreachable.
      throw new Error(
        "VONAGE_API_KEY / VONAGE_API_SECRET are not set — add them in the project's Keys/API keys tab.",
      );
    }
    const to = normalisePhone(identifier);
    const from = process.env.VONAGE_SMS_SENDER || "SahakarSeva";
    try {
      await axios.post(
        MESSAGES_URL,
        {
          messageType: "text",
          // The lifetime is quoted from the same constant the provider is
          // configured with, so the message can never promise a window the
          // server will not honour.
          text: `${token} is your Sahakar Seva worker sign-in code. It expires in ${CODE_TTL_MIN} minutes. Do not share it with anyone.`,
          to,
          from,
        },
        {
          auth: { username: apiKey, password: apiSecret },
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      // The status is passed separately rather than pasted into a string and
      // matched with a regex: `detail` begins with the status, so a pattern
      // like /\s401\b/ can never match it, and an unanchored /\b4(22|29)\b/
      // happily matches a 429.
      const status = axios.isAxiosError(error)
        ? (error.response?.status ?? 0)
        : 0;
      const body = axios.isAxiosError(error)
        ? JSON.stringify(error.response?.data ?? "")
        : String(error);
      throw new Error(describeVonageFailure(to, status, body));
    }
  },
});

/**
 * `Phone()` builds its config object from hardcoded literals and ignores the
 * `id` and `maxAge` passed to it:
 *
 *   { id: "phone", type: "phone", maxAge: 60 * 20, ... }
 *
 * So a provider created as `Phone({ id: "phone-otp", maxAge: 600 })` is
 * registered under the id `"phone"` with a 20-minute life, with no error. The
 * screen would then call `signIn("phone-otp", ...)` and Convex Auth would throw
 * "Provider `phone-otp` is not configured" — the worker could not sign in at
 * all. Both values are therefore applied here, after the factory runs, so this
 * file owns its own contract.
 */
export const phoneOtp: typeof base = {
  ...base,
  id: PHONE_PROVIDER_ID,
  maxAge: 60 * CODE_TTL_MIN,
};
