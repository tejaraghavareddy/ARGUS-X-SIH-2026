import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
// Relative, not the "@/" alias: Convex's own bundler does not resolve the
// Vite alias, so a specifier that works in the browser fails to deploy here.
import { EMAIL_PROVIDER_ID } from "../../lib/authProviders";

/**
 * Sign-in codes by email, delivered through Resend.
 *
 * ## One credential, not two
 *
 * Resend authenticates with a single API key. There is no second secret, and
 * this file asks for exactly one: `RESEND_API_KEY`. That is deliberate — an
 * earlier iteration required a key *and* a verified sender address, which is
 * SendGrid's shape, not Resend's, and it meant email sign-in could never be
 * switched on from a single pasted value.
 *
 * ## What the single key does and does not buy
 *
 * With only the key, sends go out as `onboarding@resend.dev` — Resend's
 * testing sender — and **Resend delivers those only to the email address on
 * the account that owns the key.** Sending to any other address is refused
 * with a 403. That is an anti-spam rule, not a bug, and it is the one thing
 * to know before testing.
 *
 * So out of the box this file delivers real codes to the account holder and
 * to nobody else. Lifting that needs a verified sending domain (DNS records at
 * a registrar), after which `RESEND_FROM_EMAIL` can name any address on it.
 * That variable is optional and absent-by-default: unset is a working
 * configuration, not a misconfiguration.
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
 *   RESEND_API_KEY     — from https://resend.com/api-keys
 *   RESEND_FROM_EMAIL  — optional; a sender on a verified Resend domain
 */

const RESEND_URL = "https://api.resend.com/emails";

/**
 * The sender used when `RESEND_FROM_EMAIL` is unset.
 *
 * This is a real, working sender — not a placeholder — but Resend restricts
 * it to the account holder's own inbox. Choosing it as the default is what
 * makes a single API key a sufficient configuration.
 */
const TESTING_SENDER = "Sahakar Seva <onboarding@resend.dev>";

/**
 * The `from` value, exactly as Resend wants it.
 *
 * Resend takes one string and parses `Name <a@b.com>` itself, so — unlike the
 * SendGrid version of this file — there is nothing to split and nothing to
 * reassemble. A pasted value is passed through verbatim, which is also why a
 * malformed one surfaces as Resend's own 422 rather than a silent no-op.
 */
function fromAddress(): string {
  const raw = process.env.RESEND_FROM_EMAIL?.trim();
  return raw || TESTING_SENDER;
}

/** True when sends are going out as Resend's account-restricted testing sender. */
function usingTestingSender(): boolean {
  return !process.env.RESEND_FROM_EMAIL?.trim();
}

/**
 * A short, human-readable form for logs, so a failure never echoes a full
 * address back into a server log or an error surface.
 *
 * Defensive about a missing address on purpose. This runs only on the failure
 * path, so a crash here does not merely lose a feature — it replaces a named,
 * actionable Resend error ("the sender is restricted to your account") with an
 * unhandled `TypeError`, which Convex surfaces as a bare Server Error. That is
 * the one symptom with dozens of causes, and it is the exact thing this file
 * exists to avoid. Observed live, not hypothesised: a malformed sign-in call
 * arrived with no identifier and the crash buried the vendor's own reason.
 */
function maskEmail(address: string | null | undefined): string {
  if (typeof address !== "string" || !address.includes("@")) return "•••";
  const [local = "", domain = ""] = address.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

/**
 * Turn a Resend refusal into something a developer can act on.
 *
 * Without this the thrown message is a raw vendor payload, which Convex then
 * renders client-side as a bare `[CONVEX A(auth:signIn)] Server Error` — the
 * one symptom with dozens of causes.
 *
 * The 403 branch is the one that matters most here. With only an API key
 * configured, *every* send to anyone but the account holder lands there, and
 * the generic reading — "forbidden" — sends people looking for a permissions
 * problem that does not exist. It is a sender restriction, and the fix is a
 * verified domain.
 */
export function describeResendFailure(
  status: number,
  detail: string,
  recipient: string | null | undefined,
): string {
  const to = maskEmail(recipient);

  if (status === 401) {
    // Distinct from 403 on purpose: a 401 is the key itself and nothing to do
    // with the sender. Merging the two tells someone with a revoked key to go
    // and verify a domain, which cannot possibly help.
    return (
      `Email delivery failed for ${to}: Resend API key is invalid (401). ` +
      `RESEND_API_KEY is set but not valid — create one at ` +
      `https://resend.com/api-keys and check it is not revoked.`
    );
  }

  if (status === 403) {
    if (usingTestingSender()) {
      // 403 here is almost never a permissions problem: it is Resend refusing
      // to deliver onboarding@resend.dev to an address that is not the
      // account holder's. Anything sent to your own inbox still works.
      return (
        `Email delivery failed for ${to}: Resend refused the testing sender ` +
        `(403). onboarding@resend.dev only delivers to the address on the ` +
        `Resend account that owns the key. Either send to that address, or ` +
        `verify a sending domain on Resend and set RESEND_FROM_EMAIL to a ` +
        `sender on it.`
      );
    }
    return (
      `Email delivery failed for ${to}: Resend rejected the request (${status}). ` +
      `If RESEND_FROM_EMAIL is set, that address is on no verified Resend ` +
      `domain — verify the domain first, then set RESEND_FROM_EMAIL.`
    );
  }

  if (status === 422) {
    return (
      `Email delivery failed for ${to}: Resend rejected the message as invalid ` +
      `(422). ${detail.slice(0, 300)}`
    );
  }

  if (status === 429) {
    // Never reads as a sender problem — it is a quota, and the two have
    // opposite remedies.
    return (
      `Email delivery failed for ${to}: Resend rate-limited this account (429). ` +
      `The free tier is capped at 100 emails a day and 10 an hour — wait, ` +
      `or upgrade.`
    );
  }

  return `Email delivery failed for ${to}: ${status} ${detail.slice(0, 300)}`;
}

/**
 * Flatten a Resend refusal body to a plain string.
 *
 * `message` is usually a string, but validation failures answer with an array
 * of `{ message, fieldName }` objects. A raw read of that renders as
 * `[object Object]` and names nothing, which defeats the point of carrying the
 * detail at all.
 */
function resendDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      message?: string | Array<{ message?: string; fieldName?: string }>;
      name?: string;
    };
    const { message } = parsed;
    if (typeof message === "string" && message) return message;
    if (Array.isArray(message) && message.length > 0) {
      return message
        .map((entry) => {
          const where = entry.fieldName ? `${entry.fieldName}: ` : "";
          return `${where}${entry.message ?? "unreadable Resend error"}`;
        })
        .join("; ");
    }
  } catch {
    // Not JSON. The raw body is still more informative than nothing.
  }
  return body;
}

/** Six digits, matching the code length the sign-in screens validate. */
export const SIGNIN_CODE_LENGTH = 6;

/**
 * Send one sign-in code to one address through Resend.
 *
 * ## Why this is a named function and not just the provider callback
 *
 * `Email()` below is Convex Auth's provider shape, and `sendVerificationRequest`
 * is its callback. Pulling the body out here means the transport — vendor, key,
 * payload shape, failure vocabulary, address masking — is one named thing with
 * one name to test against, rather than a closure reachable only by faking an
 * Auth.js request object.
 *
 * That matters because every detail in here is silent when wrong. A payload in
 * the wrong vendor's shape is not rejected at the boundary — it is dropped, and
 * the user simply never receives a code. So the send is a value that can be
 * called, asserted on, and reasoned about directly.
 *
 * Throws on refusal and never returns a "maybe sent": the caller surfaces the
 * message to a developer who needs to know which key to fix, and "the code did
 * not arrive" is otherwise indistinguishable from "the address is wrong".
 */
export async function sendSigninEmail({
  email,
  token,
}: {
  email: string | null | undefined;
  token: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Fail loudly rather than silently dropping sign-in codes: a missing key
    // is a configuration error, and the thrown error surfaces in the server
    // log instead of looking like a delivery failure to the customer.
    throw new Error(
      "RESEND_API_KEY is not set — add it in the project's Keys/API keys tab.",
    );
  }

  const text = `${token} is your Sahakar Seva sign-in code. It expires in 15 minutes. Do not share it with anyone.`;

  // Plain fetch rather than the `resend` SDK: this is one POST to a JSON
  // endpoint, and fetch needs no dependency in the function bundle.
  let response: Response;
  try {
    response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      // Resend's shape: flat `from` / `to` / `subject` / `text` / `html`, with
      // `to` an array. The nested `personalizations` + `content` pair belongs
      // to SendGrid and is silently ignored here — which is the exact way a
      // code goes missing while the API answers 200.
      body: JSON.stringify({
        from: fromAddress(),
        to: [email],
        subject: `${token} is your Sahakar Seva sign-in code`,
        text,
        html:
          `<html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:420px">` +
          `<p style="font-size:15px;color:#0f172a">Your Sahakar Seva sign-in code is</p>` +
          `<p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#047857;margin:16px 0">${token}</p>` +
          `<p style="font-size:13px;color:#64748b">It expires in 15 minutes. Do not share it with anyone.</p>` +
          `</body></html>`,
      }),
    });
  } catch (error) {
    throw new Error(
      `Email delivery failed for ${maskEmail(email)}: ${String(error)}`,
    );
  }

  // Resend answers 200 with `{ "id": "..." }` for an accepted send, and non-2xx
  // with `{ statusCode, message, name }` for anything it refused — the
  // account-restricted testing sender being the usual one. Both are surfaced,
  // because "the code did not arrive" is otherwise indistinguishable from
  // "the address is wrong".
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      describeResendFailure(response.status, resendDetail(detail), email),
    );
  }
}

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
