/**
 * Worker sign-in: phone number handling, the SMS throttle, portal routing, and
 * the email code delivery that backs the second sign-in tab.
 *
 * These cover the parts of the worker sign-in flow that can silently do the
 * wrong thing: a number that normalises differently between the send and the
 * verify step locks a worker out of their own account, an unthrottled SMS
 * endpoint bills the cooperative, a mis-routed redirect drops a worker into the
 * customer portal, and a mail payload in the wrong vendor's shape is accepted
 * by nothing and reported by nobody.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalisePhone,
  phoneOtp,
  CODE_TTL_MIN,
  describeVonageFailure,
} from "@/convex/auth/phoneOtp";
import { emailOtp, describeSendgridFailure } from "@/convex/auth/emailOtp";
import { EMAIL_PROVIDER_ID, PHONE_PROVIDER_ID } from "@/lib/authProviders";
import { signInPathFor, isWorkerPath } from "@/lib/portal";
import { setupTest, api, must, seedUser } from "./convexHarness";

describe("phone provider wiring", () => {
  it("is a phone-typed provider under the id the screen signs in with", () => {
    // Regression: Convex Auth's `Phone()` factory builds its config from
    // hardcoded literals and ignores the `id` handed to it, so the provider
    // was registered as "phone" while the screen called
    // signIn("phone-otp", ...). That fails at runtime with "Provider
    // `phone-otp` is not configured" — the screen simply never worked.
    expect(phoneOtp.id).toBe(PHONE_PROVIDER_ID);
    expect(phoneOtp.type).toBe("phone");
  });

  it("honours the code lifetime it promises in the SMS", () => {
    // The same factory also hardcodes maxAge to 20 minutes. The SMS text
    // quotes CODE_TTL_MIN, so the two must be the same number or we promise
    // the worker a window the server will not honour.
    expect(phoneOtp.maxAge).toBe(60 * CODE_TTL_MIN);
  });

  it("the users table really can store and look up a phone number", async () => {
    // The project redefines the `users` table, and that override had silently
    // dropped `phone` and the by_phone index. Convex Auth writes `phone` when
    // it creates the account during phone sign-in, so prove the column is
    // writable and the index resolves rather than trusting the schema file.
    const t = setupTest();
    const id = await seedUser(t, {
      email: "gig@example.com",
      phone: "+919876543210",
      phoneVerificationTime: 1_700_000_000_000,
    });
    const found = must(
      await t.run((ctx) =>
        ctx.db
          .query("users")
          .withIndex("phone", (q) => q.eq("phone", "+919876543210"))
          .first(),
      ),
      "user by phone index",
    );
    expect(found._id).toBe(id);
    expect(found.phoneVerificationTime).toBe(1_700_000_000_000);
  });
});

describe("normalisePhone", () => {
  it("accepts every way an Indian worker types their own number", () => {
    // These must all collapse to one value, because the code is verified
    // against the identifier used to request it.
    const expected = "+919876543210";
    expect(normalisePhone("9876543210")).toBe(expected);
    expect(normalisePhone("09876543210")).toBe(expected);
    expect(normalisePhone("+91 98765 43210")).toBe(expected);
    expect(normalisePhone("+91-98765-43210")).toBe(expected);
    expect(normalisePhone("98765 43210")).toBe(expected);
  });

  it("does not treat a leading trunk zero as part of the subscriber number", () => {
    // "09876543210" and "9876543210" are the same person; a naive normaliser
    // would send them to two different accounts.
    expect(normalisePhone("09876543210")).toBe(normalisePhone("9876543210"));
  });

  it("preserves an already-international number", () => {
    expect(normalisePhone("+919876543210")).toBe("+919876543210");
  });

  it("rejects a number that is too short to be a mobile", () => {
    expect(() => normalisePhone("12345")).toThrow(/valid mobile number/i);
  });

  it("rejects an empty or junk value", () => {
    expect(() => normalisePhone("")).toThrow(/valid mobile number/i);
    expect(() => normalisePhone("not a phone")).toThrow(/valid mobile number/i);
  });
});

describe("authThrottle.requestPhoneOtp", () => {
  it("spends one budget per normalised number, not per spelling", async () => {
    // A caller must not get a fresh allowance by re-spelling the number, which
    // is the obvious way to bypass a per-number SMS limit.
    const t = setupTest();
    const forms = [
      "9876543210",
      "09876543210",
      "+91 98765 43210",
      "98765 43210",
      "+919876543210",
    ];
    for (const phone of forms) {
      await t.mutation(api.authThrottle.requestPhoneOtp, { phone });
    }
    // The OTP budget is 5 per 15 minutes; the sixth request in any spelling
    // must be refused.
    await expect(
      t.mutation(api.authThrottle.requestPhoneOtp, { phone: "9876543210" }),
    ).rejects.toThrow();
  });

  it("rejects a malformed number before spending any budget", async () => {
    const t = setupTest();
    await expect(
      t.mutation(api.authThrottle.requestPhoneOtp, { phone: "abc" }),
    ).rejects.toThrow(/valid mobile number/i);

    // A rejected call must not have consumed the real number's allowance.
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.authThrottle.requestPhoneOtp, { phone: "9876543210" });
    }
    await expect(
      t.mutation(api.authThrottle.requestPhoneOtp, { phone: "9876543210" }),
    ).rejects.toThrow();
  });

  it("returns the normalised number so the caller signs in with the same string", async () => {
    const t = setupTest();
    const res = await t.mutation(api.authThrottle.requestPhoneOtp, {
      phone: "098765 43210",
    });
    expect(res.phone).toBe("+919876543210");
  });

  it("gives a different number its own budget", async () => {
    const t = setupTest();
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.authThrottle.requestPhoneOtp, { phone: "9876543210" });
    }
    // One worker hitting their limit must not lock out every other worker.
    await expect(
      t.mutation(api.authThrottle.requestPhoneOtp, { phone: "9000000001" }),
    ).resolves.toEqual({ ok: true, phone: "+919000000001" });
  });
});

describe("portal routing", () => {
  it("sends a worker to the worker sign-in", () => {
    // This is the bug the mapping exists to fix: a worker deep-linking to the
    // hub used to be redirected to the generic screen, and a worker signing
    // out used to be dropped into the customer catalog.
    expect(signInPathFor("/dashboard")).toBe("/login/worker");
    expect(signInPathFor("/onboarding")).toBe("/login/worker");
    expect(signInPathFor("/welfare")).toBe("/login/worker");
  });

  it("sends a customer to the customer sign-in", () => {
    expect(signInPathFor("/services")).toBe("/login/customer");
    expect(signInPathFor("/book/abc")).toBe("/login/customer");
    expect(signInPathFor("/bookings")).toBe("/login/customer");
    expect(signInPathFor("/bookings/xyz")).toBe("/login/customer");
  });

  it("keeps the admin and platform consoles on the generic screen", () => {
    // Their consoles open their own clearance modal, which the generic screen
    // carries shortcuts for.
    expect(signInPathFor("/admin")).toBe("/auth");
    expect(signInPathFor("/super")).toBe("/auth");
  });

  it("does not match a path that merely shares a prefix", () => {
    // "/servicesx" and "/dashboard-old" are not the customer or worker portal.
    // A prefix match without the boundary would send them to the wrong screen.
    expect(signInPathFor("/servicesx")).toBe("/auth");
    expect(signInPathFor("/dashboard-old")).toBe("/auth");
    expect(signInPathFor("/booking")).toBe("/auth");
  });

  it("identifies worker paths", () => {
    expect(isWorkerPath("/dashboard")).toBe(true);
    expect(isWorkerPath("/services")).toBe(false);
    expect(isWorkerPath("/")).toBe(false);
  });
});

/**
 * SMS failure classification.
 *
 * These messages are the only thing standing between a failed OTP send and a
 * bare `[CONVEX A(auth:signIn)] Server Error`, so a misclassification sends a
 * developer chasing the wrong problem — telling them to fix DNS when the real
 * fault is an exhausted balance.
 *
 * The status is compared as a number rather than matched out of a string,
 * because it used to be interpolated first: /\s401\b/ could never match a
 * string beginning "401 ", and an unanchored /\b4(22|29)\b/ matched 429.
 */
describe("describeVonageFailure", () => {
  const who = "+919876543210";
  const classify = (status: number, body: string) =>
    describeVonageFailure(who, status, body);

  it("names bad credentials on 401", () => {
    expect(classify(401, "")).toMatch(/VONAGE_API_KEY and VONAGE_API_SECRET/);
  });

  it("names an exhausted balance on 402", () => {
    expect(classify(402, "")).toMatch(/no credit/i);
  });

  it("points at the sender on 403, since that is the usual cause", () => {
    expect(classify(403, "")).toMatch(/VONAGE_SMS_SENDER/);
  });

  it("recognises a sender refusal reported on a 400", () => {
    expect(classify(400, '{"error_title":"Invalid sender"}')).toMatch(
      /VONAGE_SMS_SENDER/,
    );
  });

  // The regression that motivated passing the status separately: 429 must not
  // be reported as an unroutable destination.
  it("reports throttling as throttling, not as an unroutable number", () => {
    expect(classify(429, "Concurrent requests")).toMatch(/throttled/i);
    expect(classify(429, "")).not.toMatch(/no route/i);
  });

  it("recognises throttling from the body when the status is unhelpful", () => {
    expect(classify(400, "Too many requests")).toMatch(/throttled/i);
  });

  it("names the missing India route on 422", () => {
    expect(classify(422, "")).toMatch(/no route for Indian/i);
  });

  it("falls back to the raw detail for an unrecognised failure", () => {
    expect(classify(500, "boom")).toMatch(/SMS delivery failed.*boom/);
  });

  it("never leaks a full phone number into the message", () => {
    for (const status of [401, 402, 403, 422, 429, 500]) {
      expect(classify(status, "")).not.toContain("9876543210");
      expect(classify(status, "")).toContain("•••••");
    }
  });
});

/**
 * Email delivery.
 *
 * The provider is the same trap as `Phone()` in one respect and the opposite in
 * another: it must register under the id the screen signs in with, and it must
 * send in the shape the *live* vendor parses. A payload written for a different
 * provider is not rejected loudly at the boundary — it is dropped, and the user
 * simply never receives a code. That is the failure this section pins.
 */
describe("email provider wiring", () => {
  it("is an email-typed provider under the id the screen signs in with", () => {
    expect(emailOtp.id).toBe(EMAIL_PROVIDER_ID);
    expect(emailOtp.type).toBe("email");
  });

  it("gives codes a 15-minute life, matching what the screen promises", () => {
    expect(emailOtp.maxAge).toBe(60 * 15);
  });
});

type SendArgs = { identifier: string; token: string };

/**
 * `sendVerificationRequest` receives the provider config alongside the request
 * from Auth.js; the sender tests only care about the first two fields.
 */
function sendCode(identifier: string, token: string): Promise<void> {
  const send = emailOtp.sendVerificationRequest as unknown as (
    args: SendArgs,
  ) => Promise<void>;
  return send({ identifier, token });
}

/** Capture the single fetch the send performs, and reply with `status`. */
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

describe("email send payload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("speaks SendGrid's v3 shape, not the flat to/text one", async () => {
    // Regression: the payload was written in Resend's shape (top-level `to`,
    // `text`, `html`). SendGrid reads `personalizations` and `content`, and
    // answers "The personalizations field is required" — so this is exactly
    // the vendor error that produced the bare Server Error.
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "no-reply@sahakar.example");
    const { calls } = captureSend();

    await sendCode("kisan@example.com", "424242");

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe("https://api.sendgrid.com/v3/mail/send");

    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer SG.test-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(String(call.init.body));
    expect(body.personalizations).toEqual([{ to: [{ email: "kisan@example.com" }] }]);
    expect(body.from).toEqual({
      email: "no-reply@sahakar.example",
      name: "Sahakar Seva",
    });
    expect(body.subject).toContain("424242");
    expect(body.content.map((part: { type: string }) => part.type)).toEqual([
      "text/plain",
      "text/html",
    ]);
    // The fields SendGrid does not read must be gone, or they read as though
    // the payload were correct while still delivering to nobody.
    expect(body).not.toHaveProperty("to");
    expect(body).not.toHaveProperty("text");
    expect(body).not.toHaveProperty("html");
  });

  it("carries the code in both parts of the message", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "no-reply@sahakar.example");
    const { calls } = captureSend();

    await sendCode("kisan@example.com", "424242");

    const body = JSON.parse(String(calls[0].init.body));
    for (const part of body.content) {
      expect(part.value).toContain("424242");
    }
  });

  it("splits a pasted 'Name <a@b.com>' sender into the two SendGrid fields", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "Sahakar Seva <no-reply@sahakar.example>");
    const { calls } = captureSend();

    await sendCode("kisan@example.com", "424242");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.from).toEqual({
      email: "no-reply@sahakar.example",
      name: "Sahakar Seva",
    });
  });

  it("fails by name when no API key is configured", async () => {
    // An unset key used to reach the vendor as `Bearer undefined` and come back
    // as an opaque 401 that read like bad credentials rather than a missing one.
    vi.stubEnv("SENDGRID_API_KEY", "");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "no-reply@sahakar.example");
    captureSend();

    await expect(sendCode("kisan@example.com", "424242")).rejects.toThrow(
      /SENDGRID_API_KEY is not set/,
    );
  });

  it("turns a refusal into a named error instead of a bare status", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "no-reply@sahakar.example");
    captureSend(403);

    await expect(sendCode("kisan@example.com", "424242")).rejects.toThrow(/403/);
  });
});

/**
 * Email failure classification — the mirror of the SMS section above, and the
 * only thing standing between a refused send and a bare
 * `[CONVEX A(auth:signIn)] Server Error`.
 */
describe("describeSendgridFailure", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const who = "kisan.sahakar@example.com";
  const classify = (status: number, detail: string) =>
    describeSendgridFailure(status, detail, who);

  it("names bad credentials on 401", () => {
    expect(classify(401, "")).toMatch(/Restricted Access, with Mail Send/);
  });

  it("blames the sender identity on 403, which is the usual cause", () => {
    vi.stubEnv("SENDGRID_FROM_EMAIL", "no-reply@sahakar.example");
    expect(classify(403, "")).toMatch(/has not verified/);
  });

  it("tells an unconfigured sender apart from an unverified one", () => {
    // The two 403s need different advice: one is "go and verify something",
    // the other is "the thing you verified is not this". Conflating them sends
    // a developer to re-verify an address that is already verified.
    vi.stubEnv("SENDGRID_FROM_EMAIL", "");
    expect(classify(403, "")).toMatch(/SENDGRID_FROM_EMAIL is not set/);
  });

  it("reports throttling as throttling, not as a sender problem", () => {
    // 429 must never read as "fix your sender identity" — it is a daily quota,
    // and the two have opposite remedies.
    vi.stubEnv("SENDGRID_FROM_EMAIL", "");
    expect(classify(429, "")).toMatch(/100 messages a day/);
    expect(classify(429, "")).not.toMatch(/Sender Identity/);
  });

  it("names a spam rejection on 413", () => {
    expect(classify(413, "")).toMatch(/spam/i);
  });

  it("falls back to the raw detail for an unrecognised failure", () => {
    expect(classify(500, "boom")).toMatch(/Email delivery failed.*boom/);
  });

  it("never leaks a full address into the message", () => {
    for (const status of [401, 403, 413, 429, 500]) {
      expect(classify(status, "")).not.toContain(who);
    }
  });
});
