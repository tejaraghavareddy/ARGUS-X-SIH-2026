import { describe, expect, it, afterEach, vi } from "vitest";
import {
  EMAIL_PROVIDER_ID,
  PHONE_PROVIDER_ID,
} from "@/lib/authProviders";
import { emailOtp } from "@/convex/auth/emailOtp";
import { emailOtpAvailable, phoneOtpAvailable } from "@/convex/authConfig";
import { phoneOtp, CODE_TTL_MIN } from "@/convex/auth/phoneOtp";
import {
  demoAdmin,
  DEMO_ADMIN_PROVIDER_ID,
} from "@/convex/auth/demoAdmin";
import {
  demoSuperAdmin,
  DEMO_SUPERADMIN_PROVIDER_ID,
} from "@/convex/auth/demoSuperAdmin";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { ANONYMOUS_PROVIDER_ID, anonymous } from "@/convex/auth";

/**
 * Provider registration.
 *
 * Three of Convex Auth's provider factories build their config from hardcoded
 * literals and IGNORE the `id` (and `maxAge`) passed in:
 *
 *     Email()            -> { id: "email",       maxAge: 60 * 60 }
 *     Phone()            -> { id: "phone",       maxAge: 60 * 20 }
 *     ConvexCredentials()-> { id: "credentials", ... }
 *
 * No error is raised. The provider simply registers under the factory's id,
 * while every screen calls `signIn("email-otp")`, `signIn("phone-otp")` or
 * `signIn("demo-admin")`, so Convex Auth throws "Provider `x` is not
 * configured" and sign-in can never work — with no hint that the provider id
 * was the problem.
 *
 * None of this was hypothetical: all three providers shipped in exactly this
 * state, so both demo doors and email sign-in were dead regardless of whether
 * the delivery keys were set.
 *
 * These assertions are the guard. They fail loudly at build time instead of
 * failing silently in front of a judge.
 */

describe("auth provider registration", () => {
  it("registers the email provider under the id the screens sign in with", () => {
    expect(emailOtp.id).toBe(EMAIL_PROVIDER_ID);
    expect(emailOtp.id).toBe("email-otp");
  });

  it("registers the phone provider under the id the screens sign in with", () => {
    expect(phoneOtp.id).toBe(PHONE_PROVIDER_ID);
    expect(phoneOtp.id).toBe("phone-otp");
  });

  // The factory defaults are `email` and `phone`. If either assertion above
  // ever regresses, this names the value that leaked through.
  it("is not registered under either factory default id", () => {
    expect(emailOtp.id).not.toBe("email");
    expect(phoneOtp.id).not.toBe("phone");
  });

  it("overrides the factory's hardcoded code lifetimes", () => {
    // Factory defaults are 3600s for email and 1200s for phone; the SMS text
    // quotes CODE_TTL_MIN, so the two must agree or the message lies.
    expect(emailOtp.maxAge).toBe(60 * 15);
    expect(phoneOtp.maxAge).toBe(60 * CODE_TTL_MIN);
    expect(phoneOtp.maxAge).not.toBe(60 * 20);
  });

  it("keeps a sendVerificationRequest on both OTP providers", () => {
    expect(typeof emailOtp.sendVerificationRequest).toBe("function");
    expect(typeof phoneOtp.sendVerificationRequest).toBe("function");
  });

  it("registers both demo providers under the ids the admin modal calls", () => {
    expect(demoAdmin.id).toBe(DEMO_ADMIN_PROVIDER_ID);
    expect(demoAdmin.id).toBe("demo-admin");
    expect(demoSuperAdmin.id).toBe(DEMO_SUPERADMIN_PROVIDER_ID);
    expect(demoSuperAdmin.id).toBe("demo-superadmin");
  });

  it("does not leave a demo provider on the factory default", () => {
    expect(demoAdmin.id).not.toBe("credentials");
    expect(demoSuperAdmin.id).not.toBe("credentials");
  });

  it("gives the two demo providers distinct ids", () => {
    // Both come from the same factory with the same hardcoded default, so an
    // unapplied override would register two providers under one id.
    expect(demoAdmin.id).not.toBe(demoSuperAdmin.id);
  });

  it("registers the anonymous provider under the id the screens call", () => {
    // Asserted against the SAME object handed to convexAuth in ./auth.ts, not
    // a fresh `Anonymous()` call. A bare call reproduces the bug rather than
    // the app: convexAuth materialises a function provider by invoking it with
    // no config, so the registered object is what matters.
    //
    // `Anonymous()` on its own returns id "credentials" — the library's own
    // factories ignore the id they are handed. That call is kept deliberately,
    // as documentation of why the spread in ./auth.ts exists.
    expect(Anonymous().id).toBe("credentials");
    expect(ANONYMOUS_PROVIDER_ID).toBe("anonymous");
    // And the object actually registered is the fixed one, not the raw factory
    // result: its id must not be the "credentials" default above.
    expect(anonymous.id).toBe("anonymous");
    expect(anonymous.id).not.toBe("credentials");
  });
});

/**
 * The delivery gate.
 *
 * `authConfig.delivery` decides whether a sign-in screen offers email or SMS at
 * all. Getting it wrong is invisible either way: too strict and a working
 * method stays hidden, too loose and a dead button is put in front of a user
 * whose code will never arrive.
 *
 * The email gate is one credential — `RESEND_API_KEY` — and that is the whole
 * point of the switch to Resend. Resend authenticates with a key alone and
 * falls back to its `onboarding@resend.dev` testing sender, so requiring a
 * second value here (as the SendGrid configuration did, needing a verified
 * sender address) would make email sign-in impossible to switch on from a
 * single pasted key. These assertions exist so that regression is loud.
 */
describe("email delivery gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const gate = () => emailOtpAvailable();

  it("is available from the API key alone, with no sender configured", () => {
    // The requirement, stated as a test: one credential is a whole
    // configuration. If this ever needs RESEND_FROM_EMAIL as well, something
    // has reintroduced SendGrid's two-value shape.
    vi.stubEnv("RESEND_API_KEY", "re_test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    expect(gate()).toBe(true);
  });

  it("stays available when a sender IS configured", () => {
    // The optional variable must not become a requirement in the other
    // direction either — a verified domain is an upgrade, not a gate.
    vi.stubEnv("RESEND_API_KEY", "re_test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@sahakar.example");
    expect(gate()).toBe(true);
  });

  it("is unavailable with no key at all", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(gate()).toBe(false);
  });

  it("does not fall back to the SendGrid variables", () => {
    // Guards a subtler regression: leaving the old keys in the predicate would
    // mean a deployment carrying only SendGrid config still shows a live email
    // button, and one carrying only Resend config does not.
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SENDGRID_API_KEY", "SG.stale-key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "no-reply@sahakar.example");
    expect(gate()).toBe(false);
  });
});

/**
 * The SMS gate, for contrast.
 *
 * Vonage is not reducible to one value the way Resend is: a key alone
 * authenticates nothing and a secret alone is not a credential. Both halves are
 * genuinely required, so this pins the *difference* between the two vendors
 * rather than restating the email rule.
 */
describe("SMS delivery gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("needs both a key and a secret, because Vonage genuinely requires both", () => {
    vi.stubEnv("VONAGE_API_KEY", "key-only");
    vi.stubEnv("VONAGE_API_SECRET", "");
    expect(phoneOtpAvailable()).toBe(false);

    vi.stubEnv("VONAGE_API_KEY", "");
    vi.stubEnv("VONAGE_API_SECRET", "secret-only");
    expect(phoneOtpAvailable()).toBe(false);

    vi.stubEnv("VONAGE_API_KEY", "both");
    vi.stubEnv("VONAGE_API_SECRET", "both");
    expect(phoneOtpAvailable()).toBe(true);
  });
});
