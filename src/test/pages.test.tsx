/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { queryResults, mutationErrors, mutationCalls, authSignInCalls } from "./setup";
import { freshMocks, renderPage } from "./renderHarness";

import Landing from "@/pages/Landing";
import NotFound from "@/pages/NotFound";
import Services from "@/pages/Services";
import ServiceDetail from "@/pages/ServiceDetail";
import Book from "@/pages/Book";
import Bookings from "@/pages/Bookings";
import BookingDetail from "@/pages/BookingDetail";
import Dashboard from "@/pages/Dashboard";
import Onboarding from "@/pages/Onboarding";
import Auth from "@/pages/Auth";
import CustomerAuth from "@/pages/CustomerAuth";
import WorkerAuth from "@/pages/WorkerAuth";
import Admin from "@/pages/Admin";
import Welfare from "@/pages/Welfare";
import WorkerProfile from "@/pages/WorkerProfile";
import SuperAdmin from "@/pages/SuperAdmin";

/** A booking id string; page code only compares identity, never validates it. */
const BOOKING_ID = "kg2abc123def456ghijk789lmn01op";

beforeEach(() => {
  freshMocks();
});

/** Shared seed so the authenticated screens have something to render. */
function seedCommon() {
  queryResults.set("users:currentUser", { _id: "u1", name: "Asha", email: "a@x.com" });
  queryResults.set("artisans:getMyArtisan", {
    _id: "a1",
    userId: "u1",
    fullName: "Asha",
    trade: "electrician",
    district: "Kurnool",
    state: "Andhra Pradesh",
    kycStatus: "verified",
    quizPassed: true,
    credentialId: "SSC-2026-AB12",
    skillStatus: "verified",
    isOnline: true,
    welfareBalance: 700,
    dailyRate: 900,
    upiVpa: "asha@upi",
    lat: 15.83,
    lng: 78.03,
  });
  queryResults.set("artisans:federationStats", {
    total: 12,
    online: 5,
    verified: 9,
    byTrade: { electrician: 4, plumber: 3 },
  });
  queryResults.set("artisans:listArtisans", [
    {
      _id: "a1",
      fullName: "Asha",
      trade: "electrician",
      kycStatus: "verified",
      lat: 15.84,
      lng: 78.04,
      isOnline: true,
    },
  ]);
  queryResults.set("admin:amAdmin", true);
  queryResults.set("forecasts:publicLatest", {
    topTrade: "electrician",
    topTradeReason: "Monsoon short circuits.",
    fairRatePerHour: 240,
    confidence: 78,
    source: "heuristic",
    at: Date.now(),
  });
  queryResults.set("societies:directory", [
    { _id: "s1", name: "Kurnool Co-op", district: "Kurnool", state: "Andhra Pradesh" },
  ]);
  queryResults.set("workerAdmin:unreadCount", 1);
  queryResults.set("workerAdmin:myNotifications", [
    {
      _id: "n1",
      kind: "worker_added",
      title: "Welcome",
      body: "You are registered.",
      createdAt: Date.now(),
    },
  ]);
  queryResults.set("workSamples:mySamples", []);
  queryResults.set("bookings:listForCustomer", []);
  queryResults.set("bookings:listForWorker", { mine: [], radar: [] });
  queryResults.set("bookings:listMessages", []);
  queryResults.set("disputes:myDisputeForBooking", null);
  queryResults.set("forecasts:latest", null);
  queryResults.set("forecasts:history", []);
  queryResults.set("gis:mapData", { artisans: [], bookings: [], societies: [], demandPoints: [] });
  queryResults.set("gis:radar", null);
  queryResults.set("admin:overview", {
    bookings: 0,
    byStatus: {},
    revenueSettled: 0,
    welfarePool: 0,
    workerPayouts: 0,
    opsPool: 0,
    workers: 0,
    online: 0,
    verified: 0,
    credentials: 0,
    byTrade: {},
  });
  queryResults.set("admin:auditLog", []);
  queryResults.set("admin:earningsLedger", []);
  queryResults.set("admin:workerDirectory", []);
  queryResults.set("admin:removedWorkers", []);
  queryResults.set("admin:memberList", []);
  queryResults.set("admin:verificationQueue", []);
  queryResults.set("workSamples:reviewQueue", []);
  queryResults.set("societies:listForAdmin", []);
  queryResults.set("disputes:listForAdmin", []);
  queryResults.set("bookings:listForAdmin", []);
  queryResults.set("gis:forecastContext", {
    perTrade: {},
    districts: {},
    totalUnserviced: 0,
    totalBookings: 0,
    societiesActive: 0,
    welfarePoolAccrued: 0,
    generatedAt: Date.now(),
  });
}

describe("public pages", () => {
  it("renders the landing page", () => {
    seedCommon();
    renderPage(<Landing />, { route: "/" });
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(80);
  });

  it("renders the services catalogue", () => {
    seedCommon();
    renderPage(<Services />, { route: "/services" });
    expect(screen.getAllByText(/AC service/i).length).toBeGreaterThan(0);
  });

  it("renders a service detail page for a real service id", () => {
    seedCommon();
    renderPage(<ServiceDetail />, { route: "/services/ap-ac", path: "/services/:id" });
    expect(screen.getAllByText(/AC service & gas top-up/i).length).toBeGreaterThan(0);
  });

  it("shows a not-found card for an unknown service", () => {
    seedCommon();
    renderPage(<ServiceDetail />, {
      route: "/services/not-a-service",
      path: "/services/:id",
    });
    expect(screen.getAllByText(/Service not found/i).length).toBeGreaterThan(0);
  });

  it("renders the booking form", () => {
    seedCommon();
    renderPage(<Book />, { route: "/book/ap-ac", path: "/book/:id" });
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(80);
  });

  it("renders the 404 page", () => {
    renderPage(<NotFound />, { route: "/nope" });
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("auth pages", () => {
  it("renders worker sign-in", () => {
    seedCommon();
    renderPage(<Auth />, { route: "/auth" });
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });

  it("renders customer sign-in", () => {
    seedCommon();
    renderPage(<CustomerAuth />, { route: "/customer-auth" });
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });

  it("renders worker sign-in on the mobile tab by default", () => {
    seedCommon();
    renderPage(<WorkerAuth />, { route: "/login/worker" });
    // The phone is the primary identifier for a worker, so the SMS field must
    // be the one on screen without a click.
    const phone = document.querySelector('input[name="phone"]');
    expect(phone).not.toBeNull();
    expect(document.querySelector('input[name="email"]')).toBeNull();
  });

  it("does not offer SMS when this deployment cannot deliver it", () => {
    // Regression: with no Vonage credentials the phone provider throws inside
    // sendVerificationRequest, and that surfaces to the worker as a bare
    // "[CONVEX A(auth:signIn)] Server Error" with no way to tell a missing
    // credential from a bad phone number. The phone tab must therefore be
    // inert — the worker must not be able to submit a number that can only fail.
    seedCommon();
    queryResults.set("authConfig:delivery", {
      emailOtp: false,
      phoneOtp: false,
    });
    renderPage(<WorkerAuth />, { route: "/login/worker" });
    const phoneTab = screen.getByRole("button", { name: /mobile/i });
    expect((phoneTab as HTMLButtonElement).disabled).toBe(true);
    // The phone form is inert end to end: the tab, the field and the submit.
    // A disabled tab alone still left a worker able to type a number into a
    // live input and press the only enabled button.
    const phone = document.querySelector('input[name="phone"]') as HTMLInputElement | null;
    if (phone) expect(phone.disabled).toBe(true);
    const submit = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    expect(submit).not.toBeNull();
    expect(submit!.disabled).toBe(true);
  });

  // Regression: the customer screens used to render the email-otp form with no
  // delivery check at all, so a deployment without EMAIL_OTP_API_KEY showed a
  // working-looking form whose only action threw — surfacing as a bare
  // "[CONVEX A(auth:signIn)] Server Error" the visitor could not interpret.
  it.each([
    ["customer sign-in", <CustomerAuth />, "/login/customer"],
    ["the /auth gateway screen", <Auth />, "/auth"],
  ])("disables the code form on %s when email OTP is unconfigured", (_label, page, route) => {
    seedCommon();
    queryResults.set("authConfig:delivery", { emailOtp: false, phoneOtp: false });
    renderPage(page, { route });
    const email = document.querySelector('input[name="email"]') as HTMLInputElement | null;
    expect(email).not.toBeNull();
    expect(email!.disabled).toBe(true);
    const submit = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    expect(submit).not.toBeNull();
    expect(submit!.disabled).toBe(true);
    // The reason must be on screen, not just an inert button.
    expect(document.body.textContent).toMatch(/cannot be sent/i);
    // Guest sign-in still works, so the visitor is not locked out entirely.
    expect(screen.getAllByRole("button").length).toBeGreaterThan(1);
  });

  it("keeps the code form enabled when email OTP is configured", () => {
    seedCommon();
    queryResults.set("authConfig:delivery", { emailOtp: true, phoneOtp: false });
    renderPage(<CustomerAuth />, { route: "/login/customer" });
    const email = document.querySelector('input[name="email"]') as HTMLInputElement | null;
    expect(email!.disabled).toBe(false);
    const submit = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    expect(submit!.disabled).toBe(false);
  });

  it("falls back to email when SMS is the only unconfigured method", () => {
    seedCommon();
    queryResults.set("authConfig:delivery", {
      emailOtp: true,
      phoneOtp: false,
    });
    renderPage(<WorkerAuth />, { route: "/login/worker" });
    // The worker must not be left staring at the one method that cannot work.
    expect(document.querySelector('input[name="email"]')).not.toBeNull();
    expect(document.querySelector('input[name="phone"]')).toBeNull();
  });

  it("keeps the phone tab when the deployment can deliver SMS", () => {
    seedCommon();
    queryResults.set("authConfig:delivery", {
      emailOtp: true,
      phoneOtp: true,
    });
    renderPage(<WorkerAuth />, { route: "/login/worker" });
    expect(document.querySelector('input[name="phone"]')).not.toBeNull();
    const phoneTab = screen.getByRole("button", { name: /mobile/i });
    expect((phoneTab as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers email as a second tab on the worker sign-in", () => {
    seedCommon();
    renderPage(<WorkerAuth />, { route: "/login/worker" });
    const emailTab = screen.getByRole("button", { name: /email/i });
    fireEvent.click(emailTab);
    expect(document.querySelector('input[name="email"]')).not.toBeNull();
    expect(document.querySelector('input[name="phone"]')).toBeNull();
  });

  it("refuses a malformed worker number without spending an SMS", () => {
    seedCommon();
    renderPage(<WorkerAuth />, { route: "/login/worker" });
    const phone = document.querySelector(
      'input[name="phone"]',
    ) as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: /text me a code/i }));
    // No requestPhoneOtp call may be made for a number that cannot be sent to.
    const smsCalls = mutationCalls.filter(
      (c) => c.path === "authThrottle:requestPhoneOtp",
    );
    expect(smsCalls).toHaveLength(0);
  });

  it("asks Convex Auth for a code WITHOUT a `code` field, so it actually sends one", async () => {
    // Regression: Convex Auth branches on whether `code` is *present*
    // (`args.params?.code !== undefined`), not whether it is non-empty. An
    // empty `code` on the send step therefore took the verify path with a
    // blank code: no SMS was ever sent and the worker could not sign in at
    // all, while the UI looked like it had worked.
    seedCommon();
    renderPage(<WorkerAuth />, { route: "/login/worker" });
    const phone = document.querySelector(
      'input[name="phone"]',
    ) as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "98765 43210" } });
    fireEvent.click(screen.getByRole("button", { name: /text me a code/i }));
    await screen.findByText(/we texted a code/i);

    expect(authSignInCalls).toHaveLength(1);
    const call = authSignInCalls[0];
    expect(call.provider).toBe("phone-otp");
    // The number is normalised to the same string the verify step will send.
    expect(call.params.phone).toBe("+919876543210");
    // Absent, not empty: this is the whole point of the test.
    expect(call.params).not.toHaveProperty("code");
  });

  it("verifies with the phone number and the code, and nothing else", async () => {
    seedCommon();
    renderPage(<WorkerAuth />, { route: "/login/worker" });
    const phone = document.querySelector(
      'input[name="phone"]',
    ) as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /text me a code/i }));
    await screen.findByText(/we texted a code/i);

    // input-otp renders one 6-character field with visual slot divs, not six
    // separate inputs, so type the whole code into it.
    const otp = document.querySelector<HTMLInputElement>(
      'input[data-input-otp="true"]',
    );
    expect(otp).not.toBeNull();
    await userEvent.type(otp as HTMLInputElement, "123456");
    fireEvent.click(screen.getByRole("button", { name: /^verify code$/i }));

    const verify = authSignInCalls[authSignInCalls.length - 1];
    expect(verify.provider).toBe("phone-otp");
    // The verify step must carry the same normalised number the code was sent
    // to, plus the code itself.
    expect(verify.params.phone).toBe("+919876543210");
    expect(verify.params.code).toBe("123456");
  });
});

describe("authenticated portals", () => {
  it("renders the customer bookings list", () => {
    seedCommon();
    renderPage(<Bookings />, { route: "/bookings" });
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(20);
  });

  it("renders a booking detail page with its chat panel", () => {
    seedCommon();
    queryResults.set("bookings:getBooking", {
      _id: BOOKING_ID,
      customerId: "u1",
      serviceId: "ap-ac",
      serviceName: "AC service & gas top-up",
      trade: "appliance",
      address: "12 Gandhi Street",
      lat: 15.83,
      lng: 78.03,
      scheduledFor: Date.now() + 3600_000,
      urgent: false,
      base: 449,
      hourly: 350,
      welfareAmt: 31,
      opsAmt: 14,
      workerShare: 404,
      total: 449,
      status: "accepted",
      createdAt: Date.now(),
    });
    renderPage(<BookingDetail />, {
      route: `/bookings/${BOOKING_ID}`,
      path: "/bookings/:id",
    });
    expect(screen.getAllByText(/AC service & gas top-up/i).length).toBeGreaterThan(0);
    // The dispute flag must be offered when the customer has not already filed one.
    expect(screen.getAllByText(/Raise a dispute/i).length).toBeGreaterThan(0);
  });

  it("shows the dispute outcome instead of the flag form once one is open", () => {
    seedCommon();
    queryResults.set("bookings:getBooking", {
      _id: BOOKING_ID,
      customerId: "u1",
      serviceName: "AC service & gas top-up",
      trade: "appliance",
      address: "12 Gandhi Street",
      scheduledFor: Date.now(),
      urgent: false,
      base: 449,
      hourly: 0,
      welfareAmt: 31,
      opsAmt: 14,
      workerShare: 404,
      total: 449,
      status: "completed",
      createdAt: Date.now(),
    });
    queryResults.set("disputes:myDisputeForBooking", {
      _id: "d1",
      category: "quality",
      details: "The AC still leaks",
      status: "resolved",
      resolution: "Refund issued",
      createdAt: Date.now(),
    });
    renderPage(<BookingDetail />, {
      route: `/bookings/${BOOKING_ID}`,
      path: "/bookings/:id",
    });
    expect(screen.getAllByText(/The AC still leaks/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Refund issued/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Raise a dispute/i)).toHaveLength(0);
  });

  it("renders the worker dashboard", () => {
    seedCommon();
    renderPage(<Dashboard />, { route: "/dashboard" });
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(80);
  });

  it("renders worker onboarding", () => {
    seedCommon();
    // No profile yet -> step 1.
    queryResults.set("artisans:getMyArtisan", null);
    renderPage(<Onboarding />, { route: "/onboarding" });
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });

  it("renders the federation admin console", () => {
    seedCommon();
    renderPage(<Admin />, { route: "/admin" });
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(80);
  });

  it("renders the welfare schemes page", () => {
    seedCommon();
    queryResults.set("welfareSchemes:myEligibility", {
      profile: {
        trade: "electrician",
        tradeLabel: "Electrician",
        experienceYears: 6,
        completedJobs: 12,
        annualIncome: 180000,
        registered: true,
      },
      schemes: [
        {
          id: "pmaywas",
          name: "PM Awas Yojana",
          benefit: "₹1,20,000 assistance",
          url: "https://example.gov.in",
          criteria: ["Registered member of a cooperative"],
          likelyEligible: true,
          unmet: [],
        },
      ],
      disclaimer: "This is the cooperative's own reading of published criteria.",
    });
    renderPage(<Welfare />, { route: "/welfare" });
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(80);
  });

  it("tells the officer when the server refuses an action", async () => {
    seedCommon();
    // A pending worker, and a server that refuses the review — exactly what a
    // scoped federation admin hits when they touch another federation's work.
    queryResults.set("admin:verificationQueue", [
      {
        _id: "a1",
        fullName: "Ramesh",
        trade: "electrician",
        district: "Kurnool",
        idType: "aadhaar",
        idLast4: "1234",
        phone: "9000000000",
        experienceYears: 5,
        dailyRate: 800,
        kycStatus: "pending",
      },
    ]);
    mutationErrors.set("admin:reviewKyc", "Not in your federation");

    const user = userEvent.setup();
    renderPage(<Admin />, { route: "/admin" });
    // The KYC queue lives behind its own tab.
    await user.click(screen.getByRole("button", { name: /KYC Queue/i }));
    const approve = screen.getAllByRole("button", { name: /approve/i })[0];
    await user.click(approve);

    // The refusal must be visible, not a silent no-op.
    expect(await screen.findByText("Not in your federation")).toBeTruthy();
  });

  it("renders the super-admin platform console", () => {
    seedCommon();
    queryResults.set("superAdmin:amSuperAdmin", true);
    queryResults.set("superAdmin:platformOverview", {
      federations: 2,
      byStatus: { active: 2 },
      federationAdmins: 1,
      unscopedAdmins: 0,
      workers: 12,
      bookings: 40,
      revenueSettled: 52000,
      welfarePool: 3640,
    });
    queryResults.set("superAdmin:listFederations", []);
    queryResults.set("superAdmin:listFederationAdmins", []);
    renderPage(<SuperAdmin />, { route: "/super" });
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(80);
  });

  it("renders a worker's public profile", () => {
    seedCommon();
    queryResults.set("artisans:profile", {
      _id: "a1",
      fullName: "Asha",
      trade: "electrician",
      district: "Kurnool",
      state: "Andhra Pradesh",
      experienceYears: 6,
      slots: 0,
      credentialId: "SSC-2026-AB12",
      kycStatus: "verified",
      kycVerifiedAt: Date.now(),
      skillStatus: "verified",
      skillVerifiedAt: Date.now(),
      ratingAvg: 4.8,
      ratingCount: 12,
      completedJobs: 40,
      isOnline: true,
      listings: [],
    });
    renderPage(<WorkerProfile />, {
      route: "/workers/a1",
      path: "/workers/:id",
    });
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(80);
  });
});

describe("no raw translation keys leak into the UI", () => {
  // The 4th entry is the route pattern, needed for pages that read useParams.
  const pages: [string, () => React.ReactElement, string, string?][] = [
    ["Landing", () => <Landing />, "/"],
    ["Services", () => <Services />, "/services"],
    ["ServiceDetail", () => <ServiceDetail />, "/services/ap-ac", "/services/:id"],
    ["Bookings", () => <Bookings />, "/bookings"],
    ["Dashboard", () => <Dashboard />, "/dashboard"],
    ["Onboarding", () => <Onboarding />, "/onboarding"],
    ["Admin", () => <Admin />, "/admin"],
    ["Welfare", () => <Welfare />, "/welfare"],
    [
      "WorkerProfile",
      () => <WorkerProfile />,
      "/workers/a1",
      "/workers/:id",
    ],
    ["SuperAdmin", () => <SuperAdmin />, "/super"],
  ];

  for (const [name, make, route, path] of pages) {
    it(`${name} renders no untranslated keys`, () => {
      seedCommon();
      const { unmount } = renderPage(make(), { route, path });
      const text = document.body.textContent ?? "";
      // A leaked key looks like a bare snake_case token that is not real copy.
      const leaked = text.match(/\b[a-z]{2,6}_[a-z0-9_]{2,}\b/g) ?? [];
      expect(leaked, `raw i18n keys on ${name}: ${leaked.join(", ")}`).toEqual([]);
      unmount();
    });
  }
});
