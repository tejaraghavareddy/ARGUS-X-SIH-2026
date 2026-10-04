# Sahakar Seva (सहकार सेवा)

**A cooperative-owned gig-work federation marketplace for India.**

Sahakar Seva is a full-stack platform that lets district cooperative societies
recruit, verify, dispatch and pay independent tradespeople — electricians,
plumbers, carpenters, masons, painters and appliance technicians — while
households book verified workers with transparent pricing and zero commission.

Built for **SIH 2026 problem statement 26089** (Ministry of Cooperation).

---

## Table of contents

- [The problem](#the-problem)
- [What makes it cooperative](#what-makes-it-cooperative)
- [Feature tour](#feature-tour)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project layout](#project-layout)
- [Data model](#data-model)
- [The 90/7/3 split](#the-9073-split)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Testing](#testing)
- [Security posture](#security-posture)
- [Accessibility & localisation](#accessibility--localisation)
- [Known limitations](#known-limitations)
- [License](#license)

---

## The problem

Gig platforms route Indian service work through a broker who keeps a cut of
every job, treats the worker as interchangeable inventory, and leaves the
household with no idea whether the person at the door is verified. The worker
absorbs the platform's margin, the platform's churn and the platform's
disputes. A cooperative society — an existing, legally constituted district
body with its own membership and charter — already has the trust, the
membership and the mandate. What it lacks is the software.

Sahakar Seva is that software. The cooperative owns the marketplace; the
platform is a tool the society uses, not a party to the transaction.

## What makes it cooperative

This is not a marketplace with a "cooperative" label. Three commitments are
enforced in the data model and the server, not in the copy:

1. **The split is fixed in code.** `WORKER_SHARE_RATE = 0.9`,
   `WELFARE_RATE = 0.07`, `OPS_RATE = 0.03` in `src/convex/bookings.ts`. There
   is no operator UI that changes them, and no admin override.
2. **The welfare fund is a real ledger.** 7% of every settled booking accrues
   to a welfare balance; a super admin allocates it to registered schemes. It
   is money that is accounted for, not money that is mentioned.
3. **Federation data is genuinely scoped.** A federation admin governs exactly
   one society (`users.societyId`). The scoping is enforced in the query and
   mutation layer, with isolation tests that fail if it is removed.

## Feature tour

### For households (customers)
- Browse six trades and a catalogue of services, filtered by district.
- **Group bookings** — several nearby households agree on one visit and split
  the cost. The worker does one job instead of three, and is still paid the
  full price.
- Book, then pay by **direct UPI to the worker's own VPA** (zero
  commission, the default) and confirm with the UPI transaction reference.
- **Live GPS radar** tracking the worker en route, with ETA.
- **Safety Mode** — show only fully verified workers, and keep the exact
  address hidden until the worker sets off.
- In-booking chat, one review per completed booking, and double-blind
  dispute arbitration.

### For workers (artisans)
- Sign in by **mobile OTP** (SMS) or email, from a dedicated worker portal.
- Four-gate onboarding: trade profile → KYC → voice-skill quiz → operational
  setup. Passing awards a digital cooperative trade credential (`SSC-YYYY-XXXX`).
- Go online, declare coarse weekly availability, and appear on the district
  radar.
- Accept, advance and settle jobs; publish your own service listings (inside a
  standard trade or a category you name yourself) for board approval.
- Welfare and dividend balances, a digital ID card, and a voice-request
  interface for low-literacy users.
- File an accident claim against a named cover route (PMJJBY, the society
  welfare pool, or an external insurer) and track its status. The panel leads
  with the 7% balance actually accrued in the member's own cooperative ledger —
  not an "insured" badge, because the cooperative is not an underwriter.

### For federation admins
- Verify KYC, review work samples, approve or reject worker listings.
- Approve and register district societies; govern one federation.
- Review disputes, cancel bookings, manage members, and read an earnings
  ledger scoped to their own society.
- Adjudicate accident claims, recording where each was forwarded.
- Every privileged action writes to an append-only `adminAuditLog`.

### For platform super admins
- See the whole network: federations, workers, bookings, revenue.
- Create federations, suspend or activate them, and appoint or remove
  federation admins.
- Allocate welfare reserves to schemes.

### Intelligence
- **Demand forecasting** combining real weather (Open-Meteo, no API key
  required), real festival dates, season and local repair history, through
  Google Gemini.
- **Fair-rate stabilisation** recommendations for branch managers.
- Both degrade to a heuristic rather than failing when the model is
  unavailable — a forecast feature that cannot run is a feature that does not
  exist.

## Tech stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript 5.9 (strict) |
| UI | React 19, React Router 7 |
| Build | Vite 7, Bun |
| Styling | Tailwind CSS v4, shadcn/ui, Radix primitives |
| Animation | Framer Motion |
| Maps | Leaflet / react-leaflet |
| Charts | Recharts |
| Backend & database | Convex (reactive queries, mutations, actions) |
| Auth | Convex Auth — email OTP, SMS OTP, anonymous, two demo providers |
| Payments | Direct UPI (worker's own VPA) with UTR confirmation |
| AI | Google Gemini (`@google/genai`) |
| Weather | Open-Meteo (keyless) |
| Email | Resend (single API key) |
| SMS | Vonage Messages API |
| Tests | Vitest, `convex-test`, Testing Library, jsdom |

## Architecture

**Convex is the single source of truth.** There is no separate API server.
Every screen reads from a reactive query and writes through a mutation, so a
payment webhook, an admin action and a GPS ping all converge on the same data
without a synchronisation step.

Runtimes are used deliberately, because Convex has two:

- **V8 runtime** (default) — queries, mutations, and anything calling
  `crypto.subtle`.
- **Node runtime** (`"use node"`) — actions that need `axios` or a Node API:
  Gemini, Open-Meteo, and the SMS sender.

One consequence worth knowing: **`httpAction` runs in V8 and cannot import from
a `"use node"` module.** HTTP endpoints stay thin, and anything they call lives
in the default runtime.

### Trust boundaries

- **Money is server-side only.** Payment completion is the customer submitting
  the UPI transaction reference (UTR) at the payment stage, recorded as
  `upi_manual` in the ledger — and `NEXT_STATUS` does not let a worker skip
  the payment step.
- **Federation scoping is enforced in the data layer**, not in the UI, with
  dedicated isolation tests.
- **Every phone and email identifier is hashed** before it becomes a
  rate-limit key, so the limiter is never a second, less-protected copy of the
  member list.

## Project layout

```
src/
  convex/                 backend: schema, queries, mutations, actions
    auth/                 Convex Auth providers (email OTP, phone OTP, demo)
    _generated/           codegen output — never hand-edited
  components/             shared UI, route guards, maps
    map/                  Leaflet radar, GIS map, location picker
    ui/                   shadcn/ui primitives
  lib/                    pure logic: geo, trades, slots, i18n, voice intents
  pages/                  one file per route
  test/                   test harness + 29 test files
```

Tests live in `src/test/` and colocate as `*.test.ts` next to pure library
modules (`src/lib/geo.test.ts`).

### Key modules

| File | Responsibility |
| --- | --- |
| `src/lib/geo.ts` | Haversine, bearing, ETA, accuracy classification, fix plausibility, reverse geocoding with a bounded cache |
| `src/lib/useLocation.ts` | GPS acquisition, staleness, manual-pin handling, quality grading |
| `src/lib/portal.ts` | Maps a path to the sign-in screen that owns it |
| `src/lib/trades.ts` | The six trades and the service catalogue |
| `src/lib/i18n.tsx` | Five-language dictionary + provider |
| `src/convex/identity.ts` | Role checks, federation scoping |
| `src/convex/rateLimit.ts` | Fixed-window per-subject limiter |

## Data model

14 application tables on top of the Convex Auth tables:

| Table | Purpose |
| --- | --- |
| `users` | Identity, role, `societyId` scope, safety preference, phone + email |
| `artisans` | Worker profile, KYC, credential, presence, availability, welfare balance, optional PAN/GSTIN/SAC for invoicing |
| `bookings` | The dispatch lifecycle, payment and settlement facts |
| `bookingGroups` | Cost-shared multi-household visits |
| `reviews` | One per completed booking, denormalised onto the worker |
| `societies` | District cooperative registration and charter |
| `forecasts` | Gemini demand and price-stabilisation snapshots |
| `messages` | In-booking chat |
| `workSamples` | Worker evidence photos, purged after the board rules |
| `customServices` | Worker-published listings awaiting board approval |
| `disputes` | Double-blind arbitration |
| `invoices` | Sequential-numbered receipts; money and seller tax columns frozen at issue time |
| `insuranceClaims` | Accident claims against a cover route, with forwarding receipts |
| `notifications` | Admin-to-worker notices |
| `adminAuditLog` | Append-only record of every privileged action |
| `rateLimits` | Per-scope, per-subject fixed windows |

> **A note on `users`.** The project redefines this table to add cooperative
> fields. Because the override *replaces* the table contributed by
> `...authTables`, any Convex Auth column omitted here is silently dropped —
> which is exactly how `phone` and the `by_phone` index went missing once.
> If you extend it, keep the auth columns.

## The 90/7/3 split

Applied once per settled booking, on the **full** job price — a group booking
with three households still pays the worker the whole amount, with the
cooperative share taken once per *visit*, not once per participant. Getting
this wrong is the most likely way to lose a worker, so it has dedicated tests
(`groupWelfare.test.ts`).

| Recipient | Share |
| --- | --- |
| Worker | 90% |
| Welfare fund | 7% |
| Operational cost | 3% |

## Environment variables

Set these in the project's **Keys / API keys** tab. They are never committed.

### Required for sign-in

| Variable | Used by | If missing |
| --- | --- | --- |
| `RESEND_API_KEY` | `auth/emailOtp.ts` | Email sign-in fails. **The only credential email sign-in needs** |
| `RESEND_FROM_EMAIL` | `auth/emailOtp.ts` | Optional. Unset, sends go out as `onboarding@resend.dev`, which **Resend delivers only to the address on the Resend account that owns the key.** Set it to a sender on a verified Resend domain to reach any other inbox |
| `VONAGE_API_KEY` | `auth/phoneOtp.ts` | SMS sign-in fails. **Both this and `VONAGE_API_SECRET` are required** — Vonage authenticates with HTTP Basic (`api_key:api_secret`), so either alone leaves the method unavailable |
| `VONAGE_API_SECRET` | `auth/phoneOtp.ts` | The second half of the pair above. Same dashboard page as the key, same row |
| `VONAGE_SMS_SENDER` | `auth/phoneOtp.ts` | Falls back to `SahakarSeva`; **must be a sender id registered with Vonage** |

Sign-in methods degrade honestly rather than erroring opaquely: every screen
queries `authConfig.delivery` and keeps a method **inert** until the server has
positively confirmed a delivery credential exists — an unknown answer is
treated as "not deliverable", so the only way to submit an address is after the
server says a code can actually be sent.

### Payment credentials

None required. Payments run over direct UPI to the worker's own VPA — there is
no gateway account and no API key on this rail.

### Platform-provided

`JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL`, `CONVEX_SITE_URL`, `VLY_APP_NAME`,
`VLY_CONVEX_AUTH_ISSUER`, `VLY_INTEGRATION_*`, `VITE_CONVEX_URL`.

### Not required

- **Gemini** — the forecast falls back to a documented heuristic.
- **Weather** — Open-Meteo is keyless by design. A forecast feature behind a
  credential nobody can obtain in the time available is a feature that does
  not run.

## Local development

```bash
bun install
bunx convex dev --once   # push functions + regenerate types
bun run dev
```

> Always pass `--once`. Bare `convex dev` is interactive and will hang in a
> non-interactive terminal, and will leave codegen incomplete.

### Scripts

| Command | Does |
| --- | --- |
| `bun run dev` | Vite dev server |
| `bun run test` | Full Vitest suite |
| `bun run lint` | ESLint |
| `bun run build` | Typecheck + production build |
| `bun run format` | Prettier |

### Before you push

```bash
bun run test && bunx convex dev --once && bunx tsc -b --noEmit && bun run lint
```

The platform runs the typecheck automatically after each change. If you edited
anything under `src/convex/`, the Convex push must succeed first.

## Testing

**570 tests across 32 files**, all passing.

| Area | Files |
| --- | --- |
| End-to-end journeys | `workflows.test.ts` |
| Federation isolation | `superAdmin.test.ts` |
| Payments & crypto | `payments.test.ts`, `cryptoHex.test.ts` |
| Booking lifecycle | `bookings.test.ts`, `bookingGroups.test.ts`, `groupWelfare.test.ts` |
| Governance | `admin.test.ts`, `societies.test.ts`, `workerAdmin.test.ts`, `disputes.test.ts` |
| Workers | `artisans.test.ts`, `workSamples.test.ts`, `customServices.test.ts` |
| Sign-in | `workerAuth.test.ts`, `demoAdmin.test.ts`, `i18n.test.ts` |
| Geospatial | `geo.test.ts`, `useLocation.test.ts` |
| Forecasting | `forecastAi.test.ts`, `weather.test.ts`, `forecasts.test.ts` |
| Rate limiting | `rateLimit.test.ts` |
| Rendering | `pages.test.tsx` (all 16 pages) |

### Harnesses

- **`src/test/convexHarness.ts`** — runs real Convex functions against
  `convex-test`, with real database reads and writes, not mocks. Seed helpers
  (`seedWorker`, `seedAdmin`, `seedBooking`, …) and bound identities
  (`x.as.mutation(fn, args)`) let a test act as a specific signed-in user.
- **`src/test/setup.tsx`** — mocks the reactive client, recording `useQuery`,
  `useMutation`, `useAction` **and `signIn`** calls. The `signIn` recorder
  flattens `FormData` exactly as the real Convex Auth client does, which is
  what makes it possible to assert on the OTP send/verify contract.
- **`src/test/renderHarness.tsx`** — mounts a page in a router with the
  language provider, so `useParams` and `t()` resolve as in the app.

### Conventions

Tests that pin a bug should be checked against the bug: revert the fix and
confirm the test fails. A test that cannot fail is not evidence.

## Security posture

- **Rate limiting** is fixed-window and per-subject, never global. A shared
  counter would let one attacker exhaust a budget and lock out every real user
  at once, turning spam protection into a denial of service against your own
  members. Email and phone subjects are hashed.
- **Throttling sits outside the auth providers** because Convex Auth hands
  `sendVerificationRequest` the request params and no database context. This is
  a known, documented limitation: it stops the ordinary client and any script
  reusing the flow, but a caller invoking the auth endpoint directly bypasses
  it. A hard guarantee would need a custom provider or an edge function.
- **Phone numbers are normalised before hashing** so that `9876543210`,
  `09876543210` and `+91 98765 43210` spend the same budget rather than
  bypassing the limit by re-spelling.
- **Work-sample images are purged** once the board has ruled. The verdict is
  the record; the photograph is personal data that does not need to outlive it.
- **Privileged actions are audited** in an append-only log.
- **Secrets live in the deployment environment**, never in source — anything
  written in a file here ships with the deployment.

## Accessibility & localisation

- **Five languages**: English, हिन्दी, తెలుగు, தமிழ், বাংলা. The i18n test fails
  the build if a key used in the app is missing from the English dictionary,
  if a regional dictionary drops a key the app renders, or if English carries a
  key nothing renders.
- **Voice-first affordances** for low-literacy and field users, including a
  voice-skill quiz that issues the trade credential.
- **Non-ASCII dictionaries live in side modules** (`src/lib/i18n.*.ts`) merged
  by `initBnGateway()`; `src/lib/i18n.tsx` keeps the English base. Each side
  module is registered in `effectiveKeys` in the i18n test.
- **Coarse, honest availability.** Slots are bit flags over whole days, not a
  minute-resolution calendar — a household books "Thursday evening", and a
  fine-grained calendar is a lie about what a worker walking between three jobs
  can promise.

## Known limitations

Stated plainly, because a prototype that hides these is harder to trust:

- **SMS delivery is untested end-to-end.** Everything up to handing the code
  to Vonage is covered by tests; the live request is not, because
  `VONAGE_API_SECRET` is unset and a send stops at the credential check.
- **Email delivery is verified as far as the sender restriction, not past
  it.** A live send was issued against Resend and returned a 403 naming the
  testing-sender restriction — which proves the key is valid, the payload
  parses, and the request reaches Resend. What is *not* yet proven is a code
  landing in a real inbox, because the only address the testing sender will
  deliver to is the one on the Resend account. Verifying a sending domain, or
  one successful send to the account holder's own address, closes that gap.
  `describeResendFailure` names the restriction rather than leaving it as a
  bare Server Error.
- **Booking-location GPS is client-reported.** Adequate for dispatch, not a
  tamper-evident audit trail. It is tamper-*detectable* — see the plausibility
  work in `src/lib/geo.ts` — but a determined client can still lie.
- **Storage for work-sample images is local to the Convex deployment**; a
  production rollout would want retention and backup policy. The purge path
  itself is now complete (below); what is missing is an automatic schedule.
- **The OTP and forecast throttles are client-mediated.** They stop the
  ordinary client and any script that reuses the documented flow, but a caller
  invoking the auth or action endpoint directly bypasses them. A hard guarantee
  needs a custom provider or an edge function.

### Recently closed

Kept here rather than deleted, because the reasoning is worth more than the
result:

- **The forecasting test was nondeterministic.** `forecastAi.test.ts` made a
  live HTTPS request to `api.open-meteo.com` (nothing stubbed `fetch`) and read
  `new Date()` for the season and festival window, so a run crossing midnight on
  a month boundary could reason about a different month than the assertions
  expected. The clock is now a parameter and the network is a fixture. Verified
  over repeated full-suite runs rather than assumed fixed.
- **`runForecast` was unthrottled.** It bills a Gemini call, and an admin gate is
  not a budget. There is now a `forecast` scope (6/hour) keyed on the officer's
  **federation**, spent by `forecastThrottle.requestForecastRun` before the
  action runs — so a society cannot multiply its allowance by hiring officers.
- **Rejected work samples kept their image.** A rejection is at least as
  personal as an approval, so the purge now runs on *any* ruling, and
  `sweepUnpurgedImages` retries the files whose storage delete failed at review
  time. The written verdict is the audit trail; the photograph is not.

## License

Proprietary — built for SIH 2026 under the Ministry of Cooperation problem
statement 26089.
