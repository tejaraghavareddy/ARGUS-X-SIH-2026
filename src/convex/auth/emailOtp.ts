import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
// Relative, not the "@/" alias: Convex's own bundler does not resolve the
// Vite alias, so a specifier that works in the browser fails to deploy here.
import { EMAIL_PROVIDER_ID } from "../../lib/authProviders";

/**
 * Sign-in codes by email, delivered through Resend.
 *
 * ## Why Resend rather than the platform endpoint
 *
 * This originally POSTed to `auth.freebuff.app/send_otp`, which needs an
 * `x-api-key` issued by the platform. That credential is not self-serve: a
 * project cannot obtain one, which left `/auth` — the route every judge and
 * every new customer lands on — permanently unable to send a code.
 *
 * Resend is self-serve, has a free tier, and authenticates with a plain bearer
 * token, which is what this callback can actually offer: the Auth.js provider
 * hands `sendVerificationRequest` only the request params, with no database
 * context and no user session to attach anything to.
 *
 * ## What this file is NOT
 *
 * Not a mail-queue, not a bounce handler, not a marketing sender. It sends one
 * transactional code and gets out of the way. Anything larger belongs in a
 * `"use node"` action, which this provider callback cannot become — see the
 * abuse note below.
 *
 * Set in the project's Keys/API keys tab:
 *   RESEND_API_KEY        — from https://resend.com/api-keys
 *   RESEND_FROM_EMAIL     — optional; see the note on the from address
 */

const RESEND_URL = "https://api.resend.com/emails";

/**
 * The From address.
 *
 * Resend's testing sender (`onboarding@resend.dev`) is restricted to the
 * account holder's own inbox, which is exactly right for a smoke test and
 * useless for a real sign-in. Sending to arbitrary customers requires a
 * verified domain, so a real deployment sets RESEND_FROM_EMAIL to a sender on
 * one. The default is chosen so a developer who has just pasted a key can
 * confirm the plumbing works before doing the DNS work.
 */
function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || "Sahakar Seva <onboarding@resend.dev>";
}

/**
 * A short, human-readable form for logs, so a failure never echoes a full
 * address back into a server log or an error surface.
 */
function maskEmail(address: string): string {
  const [local = "", domain = ""] = address.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

const base = Email({
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },

  async sendVerificationRequest({ identifier: email, token }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Fail loudly rather than silently dropping sign-in codes: a missing key
      // is a configuration error, and the thrown error surfaces in the server
      // log instead of looking like a delivery failure to the customer.
      throw new Error(
        "RESEND_API_KEY is not set — add it in the project's Keys/API keys tab.",
      );
    }

    // Plain fetch rather than axios: this is one POST to a JSON endpoint, and
    // fetch needs no dependency in the function bundle.
    let response: Response;
    try {
      response = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [email],
          subject: `${token} is your Sahakar Seva sign-in code`,
          text: `${token} is your Sahakar Seva sign-in code. It expires in 15 minutes. Do not share it with anyone.`,
          html:
            `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:420px">` +
            `<p style="font-size:15px;color:#0f172a">Your Sahakar Seva sign-in code is</p>` +
            `<p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#047857;margin:16px 0">${token}</p>` +
            `<p style="font-size:13px;color:#64748b">It expires in 15 minutes. Do not share it with anyone.</p>` +
            `</div>`,
        }),
      });
    } catch (error) {
      throw new Error(
        `Email delivery failed for ${maskEmail(email)}: ${String(error)}`,
      );
    }

    // Resend answers 200 for an accepted send, and non-2xx with a `message` for
    // anything it refused — an unverified from address being the usual one.
    // Both are surfaced, because "the code did not arrive" is otherwise
    // indistinguishable from "the address is wrong".
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Email delivery failed for ${maskEmail(email)}: ${response.status} ${detail.slice(0, 300)}`,
      );
    }
  },
});

/**
 * `Email()` builds its config object from hardcoded literals and ignores the
 * `id` and `maxAge` passed to it:
 *
 *   { id: "email", type: "email", maxAge: 60 * 60, ... }
 *
 * So a provider created as `Email({ id: "email-otp", maxAge: 900 })` is
 * registered under the id `"email"` with a 1-hour life, with no error at all.
 * Every screen in this app calls `signIn("email-otp", ...)`, so Convex Auth
 * threw "Provider `email-otp` is not configured" and email sign-in could never
 * work — a missing API key was only the first of two faults. The same trap is
 * documented and worked around in ./phoneOtp.ts; both values are applied here,
 * after the factory runs, so this file owns its own contract.
 */
export const emailOtp: typeof base = {
  ...base,
  id: EMAIL_PROVIDER_ID,
  maxAge: 60 * 15,
};
