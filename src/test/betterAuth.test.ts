/**
 * Better Auth wiring.
 *
 * The Convex Auth sign-in path has its own tests in ./workerAuth.test.ts. This
 * file covers the *second* identity system's setup, which currently supports no
 * sign-in screen — so nothing about it is exercised end to end and the only
 * thing standing between this migration and a silent no-op is these assertions.
 *
 * Each test below pins a specific way the wiring can be wrong while every
 * check still passes: a plugin that validates codes but never sends one, an
 * auth config handed to the component that makes it throw at runtime, a route
 * handler that takes the whole deployment's HTTP surface down when one env var
 * is missing.
 */
import { describe, expect, it, afterEach, vi } from "vitest";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

import convexAuthConfig from "@/convex/auth.config";
import betterAuthAuthConfig from "@/convex/betterAuth/authConfig";
import { emailOtp as betterAuthEmailOtp } from "@/convex/betterAuth/emailOtp";
import { SIGNIN_CODE_LENGTH } from "@/convex/auth/emailOtp";
import { betterAuthSecretProblem } from "@/convex/betterAuth/auth";

type EmailOtpOptions = {
  otpLength?: number;
  expiresIn?: number;
  disableSignUp?: boolean;
  sendVerificationOTP: (data: {
    email: string;
    otp: string;
    type: string;
  }) => Promise<void>;
};

const betterAuthOptions = () =>
  (betterAuthEmailOtp as unknown as { options: EmailOtpOptions }).options;

/**
 * Capture the single fetch a send performs, and reply with `status`.
 */
function captureSend(status = 202): {
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 202 ? "" : '{"errors":[]}', { status });
  });
  return { calls };
}

/**
 * The `emailOTP` plugin validates and expires a code and ships with an **empty**
 * `sendVerificationOTP`. Left as shipped it reports a successful send and
 * delivers nothing — the exact failure this project treats as unacceptable, and
 * one no type error or unit test of the auth flow would ever catch.
 */
describe("Better Auth emailOTP delivery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("actually sends a code instead of validating one and stopping", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "no-reply@sahakar.example");
    const { calls } = captureSend();

    await betterAuthOptions().sendVerificationOTP({
      email: "kisan@example.com",
      otp: "424242",
      type: "sign-in",
    });

    // Zero calls means the plugin shipped its default empty callback and the
    // user is told a code is on its way that will never arrive.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.sendgrid.com/v3/mail/send");
  });

  it("sends through the same SendGrid transport as Convex Auth, in the same shape", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "no-reply@sahakar.example");
    const { calls } = captureSend();

    await betterAuthOptions().sendVerificationOTP({
      email: "kisan@example.com",
      otp: "424242",
      type: "sign-in",
    });

    const body = JSON.parse(String(calls[0].init.body));
    // SendGrid v3, not Resend's flat shape. Wrong shape is accepted by nobody
    // and reported by nobody.
    expect(body.personalizations).toEqual([
      { to: [{ email: "kisan@example.com" }] },
    ]);
    expect(body.from).toEqual({
      email: "no-reply@sahakar.example",
      name: "Sahakar Seva",
    });
    expect(body.subject).toContain("424242");
    expect(body).not.toHaveProperty("to");
    expect(body).not.toHaveProperty("text");
  });

  it("fails by name when SendGrid is unconfigured, rather than reporting a send", async () => {
    // A send that cannot happen must not look like one that did.
    vi.stubEnv("SENDGRID_API_KEY", "");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "no-reply@sahakar.example");
    captureSend();

    await expect(
      betterAuthOptions().sendVerificationOTP({
        email: "kisan@example.com",
        otp: "424242",
        type: "sign-in",
      }),
    ).rejects.toThrow(/SENDGRID_API_KEY is not set/);
  });

  it("surfaces a vendor refusal instead of swallowing it", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "not-verified@sahakar.example");
    captureSend(403);

    await expect(
      betterAuthOptions().sendVerificationOTP({
        email: "kisan@example.com",
        otp: "424242",
        type: "sign-in",
      }),
    ).rejects.toThrow(/403/);
  });

  it("uses the same code length and lifetime as the Convex Auth provider", () => {
    // Two code paths, one product: a code pasted from one into the other must
    // behave identically, and the sign-in screens validate six digits.
    expect(betterAuthOptions().otpLength).toBe(SIGNIN_CODE_LENGTH);
    expect(SIGNIN_CODE_LENGTH).toBe(6);
    expect(betterAuthOptions().expiresIn).toBe(60 * 15);
  });

  it("does not create an account for an address that never signed up", () => {
    // Silently provisioning a profile on a mistyped address is how one person
    // ends up with two half-configured accounts and no way to tell which.
    expect(betterAuthOptions().disableSignUp).toBe(true);
  });
});

/**
 * Auth config.
 *
 * Better Auth's `convex()` plugin filters providers on
 * `applicationID === "convex"` and throws if it finds more than one. The app's
 * own config has to keep Convex Auth's provider for the live sign-in screens,
 * so the plugin must be handed the isolated file instead — a mismatch here is
 * a runtime throw inside every Better Auth request, not a type error.
 */
describe("Better Auth Convex auth config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hands the component a config with exactly one 'convex' provider", () => {
    const convexProviders = betterAuthAuthConfig.providers.filter(
      (provider) => provider.applicationID === "convex",
    );
    expect(convexProviders).toHaveLength(1);
  });

  it("uses RS256, the only algorithm the convex() plugin accepts", () => {
    // The plugin throws outright on any other algorithm for a customJwt
    // provider, so this is a load-time invariant, not a preference.
    const provider = betterAuthAuthConfig.providers[0];
    expect("type" in provider && provider.type === "customJwt").toBe(true);
    if ("type" in provider && provider.type === "customJwt") {
      expect(provider.algorithm).toBe("RS256");
    }
  });

  it("points at a JWKS the route handler in http.ts actually serves", () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://demo-123.convex.site");
    const provider = getAuthConfigProvider();
    expect(provider.jwks).toBe(
      "https://demo-123.convex.site/api/auth/convex/jwks",
    );
  });

  it("keeps the app's Convex Auth provider live alongside Better Auth's", () => {
    // Both identity systems are signed-in-capable during the migration, so
    // `ctx.auth` must accept either token. Removing the OIDC provider here
    // breaks every sign-in screen the product currently ships.
    expect(convexAuthConfig.providers).toHaveLength(3);
    expect(
      convexAuthConfig.providers.some(
        (provider) =>
          !("type" in provider) &&
          provider.applicationID === "convex" &&
          provider.domain === process.env.CONVEX_SITE_URL,
      ),
    ).toBe(true);
  });

  it("gives the two systems distinct issuers so Convex can tell them apart", () => {
    const issuers = convexAuthConfig.providers.map((provider) =>
      "type" in provider ? provider.issuer : provider.domain,
    );
    // Convex matches a token's provider by issuer. Two providers sharing one
    // issuer is an ambiguous config, not a redundant one.
    expect(new Set(issuers).size).toBe(issuers.length);
  });
});

/**
 * The session secret.
 *
 * Better Auth guards its own default secret — but only when
 * `NODE_ENV === "production"`, and Convex's runtime never sets that. So on this
 * platform the library's guard is inert: with the variable unset, Better Auth
 * constructs, serves a JWKS, signs sessions with the literal
 * `"better-auth-secret-12345678901234567890"` published in its own source, and
 * reports no problem at all.
 *
 * These were observed live on this deployment before the check below existed:
 * `/api/auth/convex/jwks` returned 200 while `BETTER_AUTH_SECRET` was unset.
 * A system that looks configured and is forgeable is the failure mode this
 * project treats as unacceptable, so it is checked explicitly.
 */
describe("Better Auth session secret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to run with no secret rather than using the published default", () => {
    // Without this, Better Auth signs every session with a constant anyone can
    // read off npm. It does not error on Convex — `isProduction` is false, so
    // its own guard never runs.
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(betterAuthSecretProblem()).toMatch(/BETTER_AUTH_SECRET is not set/);
  });

  it("refuses the published default constant even when explicitly set", () => {
    // The obvious wrong fix: pasting the value out of the library's source,
    // which satisfies "is it set?" while remaining publicly known.
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "better-auth-secret-12345678901234567890",
    );
    expect(betterAuthSecretProblem()).toMatch(/published default value/);
  });

  it("refuses a secret too short to be worth signing with", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "hunter2");
    expect(betterAuthSecretProblem()).toMatch(/only 7 characters/);
  });

  it("treats whitespace as unset", () => {
    // `BETTER_AUTH_SECRET=" "` passes a naive truthiness check and is a 1-char
    // secret in practice.
    vi.stubEnv("BETTER_AUTH_SECRET", "   ");
    expect(betterAuthSecretProblem()).toMatch(/is not set/);
  });

  it("accepts a real 32+ character secret", () => {
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "k3Jd8sPq2wZx7mNv4Rt6yHc1Ub5Ae9Gi0Ol",
    );
    expect(betterAuthSecretProblem()).toBeNull();
  });
});
