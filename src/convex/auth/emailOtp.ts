import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
// Relative, not the "@/" alias: Convex's own bundler does not resolve the
// Vite alias, so a specifier that works in the browser fails to deploy here.
import { EMAIL_PROVIDER_ID } from "../../lib/authProviders";

/**
 * Sign-in codes by email, delivered through SendGrid.
 *
 * ## Why SendGrid
 *
 * Two earlier choices, and what each cost:
 *
 *  - The platform endpoint `auth.freebuff.app/send_otp` needs a credential
 *    that is not self-serve, which left `/auth` permanently unable to send.
 *  - Resend fixed that, but only accepts its `onboarding@resend.dev` testing
 *    sender for delivery to the account holder's own inbox; anything else
 *    needs a verified *domain*, which means DNS records at a registrar.
 *
 * SendGrid's equivalent gate is a **single sender** verification, which is an
 * email click rather than a DNS change. For a student team that is the
 * difference between a five-minute setup and a half-hour one, and it is the
 * only reason this file changed — the anti-spam rule it is working around is
 * universal, not a Resend quirk.
 *
 * ## What this file is NOT
 *
 * Not a mail-queue, not a bounce handler, not a marketing sender. It sends one
 * transactional code and gets out of the way. The Auth.js provider hands
 * `sendVerificationRequest` only the request params — no database context and
 * no user session — so this callback cannot throttle or queue, which is why
 * `authThrottle.requestOtp` is spent one layer out before it.
 *
 * Set in the project's Keys/API keys tab:
 *   SENDGRID_API_KEY    — from https://app.sendgrid.com/settings/api_keys
 *   SENDGRID_FROM_EMAIL — a sender you have verified in SendGrid
 */

const SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send";

/**
 * Stand-in used when no sender is configured.
 *
 * SendGrid has no sandbox sender — every `from` must be verified first — so
 * this address is not expected to deliver anything. It exists so the request
 * that fails carries a message naming the fix, instead of a bare 403.
 */
const UNVERIFIED_SENDER = "no-reply@sahakar.invalid";

/**
 * The From address.
 *
 * SendGrid will not send from an address the account has not verified, so this
 * returns a placeholder unless SENDGRID_FROM_EMAIL names one. A developer who
 * has just pasted a key then gets a named failure naming the fix, rather than
 * a blank refusal.
 */
function fromAddress(): { email: string; name: string } {
  const raw = process.env.SENDGRID_FROM_EMAIL?.trim();
  if (!raw) return { email: UNVERIFIED_SENDER, name: "Sahakar Seva" };
  // Accept both "a@b.com" and "Name <a@b.com>" so the field can be pasted
  // either way without failing on the format.
  const angled = raw.match(/^(.*?)<([^>]+)>$/);
  if (angled) {
    return { email: angled[2].trim(), name: angled[1].trim() || "Sahakar Seva" };
  }
  return { email: raw, name: "Sahakar Seva" };
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

/**
 * Turn a SendGrid refusal into something a developer can act on.
 *
 * Without this the thrown message is a raw vendor payload, which Convex then
 * renders client-side as a bare `[CONVEX A(auth:signIn)] Server Error` — the
 * one symptom with dozens of causes. Naming the likely cause turns an
 * unactionable failure into a five-minute fix.
 *
 * The unverified-sender case is by far the most common on a fresh account, and
 * it is the one a developer cannot infer from a 403.
 */
export function describeSendgridFailure(
  status: number,
  detail: string,
  recipient: string,
): string {
  const to = maskEmail(recipient);
  const usingUnverifiedSender = !process.env.SENDGRID_FROM_EMAIL;

  if (status === 401) {
    return (
      `Email delivery failed for ${to}: SendGrid rejected the API key (401). ` +
      `SENDGRID_API_KEY is set but not valid — create a key under ` +
      `Settings → API Keys → Restricted Access, with Mail Send enabled.`
    );
  }

  // 403 is SendGrid's response for an unverified or unauthorised sender.
  if (status === 403) {
    if (usingUnverifiedSender) {
      return (
        `Email delivery failed for ${to}: SendGrid refused the sender (403). ` +
        `SENDGRID_FROM_EMAIL is not set, so there is no sender to send as. ` +
        `Verify an address under Settings → Sender Identity (an email click, ` +
        `no DNS needed), then set SENDGRID_FROM_EMAIL to it.`
      );
    }
    return (
      `Email delivery failed for ${to}: SendGrid refused the sender (403). ` +
      `SENDGRID_FROM_EMAIL is set to an address this account has not verified — ` +
      `check Settings → Sender Identity and its verification status.`
    );
  }

  if (status === 413) {
    return (
      `Email delivery failed for ${to}: the message was rejected as spam (413). ` +
      `SendGrid blocks suspicious template content; keep the code plain and the ` +
      `sender verified.`
    );
  }

  if (status === 429) {
    return (
      `Email delivery failed for ${to}: SendGrid rate-limited this account (429). ` +
      `The free tier is capped at 100 messages a day — wait, or upgrade.`
    );
  }

  return `Email delivery failed for ${to}: ${status} ${detail.slice(0, 300)}`;
}

/**
 * Flatten SendGrid's refusal body to a plain string.
 *
 * It answers with `{"errors":[{"message","field","help"}, ...]}` — an array,
 * not the single `message` most providers return, so a raw read of the body
 * renders as `[object Object]` and names nothing. Kept separate from
 * `describeSendgridFailure` so that stays a pure function of its arguments.
 */
function sendgridDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{ message?: string; field?: string; help?: string }>;
    };
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      return parsed.errors
        .map((entry) => {
          const where = entry.field ? `${entry.field}: ` : "";
          return `${where}${entry.message ?? entry.help ?? "unreadable SendGrid error"}`;
        })
        .join("; ");
    }
  } catch {
    // Not JSON. The raw body is still more informative than nothing.
  }
  return body;
}

/**
 * Send one sign-in code to one address through SendGrid.
 *
 * ## Why this is not just the provider callback
 *
 * `Email()` below is Convex Auth's provider shape, and it is one of two ways
 * this project sends a code. The other is Better Auth's `emailOTP` plugin,
 * whose `sendVerificationOTP` receives `{ email, otp, type }` — different
 * names, no Auth.js request object — and knows nothing about `Email()`.
 *
 * Given the same vendor, key, payload shape, failure vocabulary and masking,
 * the second path is four lines of glue if the transport is a plain function.
 * Left as a closure inside the provider, it would be a second copy of ~90
 * lines that silently drifts: a fixed 401 message in one file and a stale one
 * in the other. So the transport is a named export and the provider is a
 * caller of it.
 *
 * Throws on refusal (never returns a "maybe sent"), because both callers
 * surface the message to a developer who needs to know which key to fix.
 */
export async function sendSigninEmail({
  email,
  token,
}: {
  email: string;
  token: string;
}): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    // Fail loudly rather than silently dropping sign-in codes: a missing key
    // is a configuration error, and the thrown error surfaces in the server
    // log instead of looking like a delivery failure to the customer.
    throw new Error(
      "SENDGRID_API_KEY is not set — add it in the project's Keys/API keys tab.",
    );
  }

  // Plain fetch rather than axios: this is one POST to a JSON endpoint, and
  // fetch needs no dependency in the function bundle.
  let response: Response;
  try {
    response = await fetch(SENDGRID_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      // SendGrid's v3 shape: `personalizations` carries the recipients, and
      // both a text and an HTML part live in `content`. Its flat `to`/`text`
      // fields are Resend's, not its own, and are silently ignored.
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: fromAddress(),
        subject: `${token} is your Sahakar Seva sign-in code`,
        content: [
          {
            type: "text/plain",
            value: `${token} is your Sahakar Seva sign-in code. It expires in 15 minutes. Do not share it with anyone.`,
          },
          {
            type: "text/html",
            value:
              `<html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:420px">` +
              `<p style="font-size:15px;color:#0f172a">Your Sahakar Seva sign-in code is</p>` +
              `<p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#047857;margin:16px 0">${token}</p>` +
              `<p style="font-size:13px;color:#64748b">It expires in 15 minutes. Do not share it with anyone.</p>` +
              `</body></html>`,
          },
        ],
      }),
    });
  } catch (error) {
    throw new Error(
      `Email delivery failed for ${maskEmail(email)}: ${String(error)}`,
    );
  }

  // SendGrid answers 202 for an accepted send, and non-2xx with an `errors`
  // array for anything it refused — an unverified from address being the
  // usual one. Both are surfaced, because "the code did not arrive" is
  // otherwise indistinguishable from "the address is wrong".
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      describeSendgridFailure(response.status, sendgridDetail(detail), email),
    );
  }
}

/** Six digits, matching the code length the sign-in screens validate. */
export const SIGNIN_CODE_LENGTH = 6;

const base = Email({
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, SIGNIN_CODE_LENGTH);
  },

  async sendVerificationRequest({ identifier, token }) {
    await sendSigninEmail({ email: identifier, token });
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
