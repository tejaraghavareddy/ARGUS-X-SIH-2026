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
      const detail =
        axios.isAxiosError(error)
          ? `${error.response?.status ?? ""} ${JSON.stringify(error.response?.data ?? "")}`
          : String(error);
      throw new Error(`SMS delivery failed for ${maskPhone(to)}: ${detail}`);
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
