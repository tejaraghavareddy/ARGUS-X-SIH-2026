# Sahakar Seva — Project Architecture & Request Flow

> Architecture notes for the codebase, focused on the booking lifecycle and the
> trust boundary that replaced the removed payment gateway.

---

## Architecture in one picture

**Client (Vite + React 19).** `src/main.tsx` mounts one tree:
`ConvexAuthProvider` → `LanguageProvider` → `App`. A side effect runs *before*
`createRoot`: `initBnGateway()` (`src/main.tsx:72`), which merges the
Bengali/regional side modules into the dictionaries in `src/lib/i18n.tsx`. Pages
are thin — they hold `useQuery`/`useMutation` handles and render; every rule
lives server-side.

**Server (Convex).** Two runtimes, and the split is load-bearing:

| | V8 isolate (default) | Node runtime (`"use node"`) |
|---|---|---|
| can host | `query`, `mutation`, `httpAction` | `action` only |
| can import | anything in `src/convex/**` except node-only modules | `convex/server` + npm packages |
| used for | all business logic, auth routes, `http.ts` | outbound SMS/email/Gemini calls |

`src/convex/http.ts` is now the smallest it has ever been — an `httpRouter()`
plus `auth.addHttpRoutes(http)` and nothing else. Before the gateway removal it
also mounted the payment webhook route; that route is gone, so **the only
inbound HTTP surface is Convex Auth's own callbacks.**

**Storage.** `src/convex/schema.ts` — 14 app tables plus the auth tables.
`bookings` is the centre of gravity and carries its own money columns (`base`,
`workerShare`, `welfareAmt`, `opsAmt`, `total`) and its own lifecycle columns
(`status`, `utr`, `paidAt`, `settledAt`, `paymentMethod`), indexed
`by_customer / by_worker / by_status / by_created / by_group`. The
`by_rp_order` index went away with the gateway; `paymentMethod` survives as an
optional tag documented as *always* `"upi_manual"`, so the ledger still records
how a job was paid.

---

## The request flow the removal actually touched

The whole payment path is one booking's lifecycle. Each arrow is a single
`useMutation` call from `BookingDetail.tsx` landing on one function in
`bookings.ts`:

```
create ──► pending ──accept──► accepted ──advance──► enroute ──advance──► inprogress
                                                                        │
                                            advance (worker) ───────────┤
                                                                        ▼
                          customer pays by UPI ────────────────────► payment
                                                                        │
                     confirmUtr (customer, submits UTR) ───────────────┤
                                                                        ▼
                                                                  completed
                                                                        │
                                            advance (worker) ───────────┤
                                                                        ▼
                                                                   settled
```

Three things make this flow interesting, and all three live in the files that
were edited.

### 1. `NEXT_STATUS` is the state machine that replaced the gateway as the trust anchor

In `src/convex/bookings.ts:110`:

```ts
const NEXT_STATUS: Record<string, string> = {
  accepted: "enroute",
  enroute: "inprogress",
  inprogress: "payment",
  completed: "settled",
};
```

Note what is *missing*: `"payment"` has no entry. A worker can push a job to
`payment` and no further. The only exit is `confirmUtr`, a mutation the
**customer** owns, which requires a reference of at least 6 characters and
writes `paidAt` + `paymentMethod: "upi_manual"`. That omission was originally
what a webhook would have backed; with the gateway removed it is now the *only*
thing preventing a worker from self-approving a job and skipping the 7% welfare
accrual. The comment above the map says exactly this.

### 2. `settlePaidBooking` is called from `confirmUtr`, not from `advance`

`bookings.ts:468`. It credits `artisan.welfareBalance += b.welfareAmt` once. For
a group booking, every participant row carries the *same* `welfareAmt` (each row
displays the split of the whole visit), so crediting per row would pay the fund N
times; the guard queries `by_group` and no-ops if a sibling already has `paidAt`.
The de-dup is derived from data, not a flag, so it survives participants joining
or leaving.

### 3. Client side, the payment panel is now purely local

`BookingDetail.tsx` builds the UPI deep link itself:

```ts
const upiString = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=…&am=${booking.total}&tn=Booking_${booking._id.slice(-8)}&cu=INR`;
```

rendered as a `QRCodeSVG`, with `awaitingUtr` (`status === "payment" && !paid &&
utr === undefined`) gating the UTR input and the confirm button (disabled below 6
chars). The worker VPA comes from the booking row, so money goes artisan-direct
and the platform never touches it. This component previously also held gateway
state, a `window.<Gateway>` global, and a `gatewayStatus` query; all of that is
gone and the component is now purely `getBooking` + five mutations.

**Reactivity.** `useQuery(api.bookings.getBooking, …)` is a live subscription,
not a fetch. This matters for the flow above: the customer sees
`status: "payment"` appear the instant the worker's `advance` mutation commits,
with no polling and no refresh. It's also why `bookingForViewer` does Safety Mode
address redaction **in the query** — a masked string over a full address in the
payload would be security theatre.

---

## Cross-cutting pieces

**`src/convex/rateLimit.ts`** — a fixed-window limiter,
`consume(ctx, scope, subject)`, called at the top of a mutation before any real
work so a rejected call costs nothing. Keys are per `(scope, subject)`, never
global, and identities are hashed through `otpSubject` so the limiter table
isn't a second, less-protected copy of the member list. `LIMITS` is now 11
scopes; the `payment` scope is deleted, which is correct — a customer confirming
their own UTR is a single, non-repeatable, self-limiting act and never needed a
budget.

**`src/lib/i18n.tsx` + `src/test/i18n.test.ts`** — the pattern worth knowing:
five languages, `en` as the pure base (because `t()` reads `en[key]` even for
the English UI), with regional strings living in side modules and merged by
`initBnGateway()`. The test enforces three invariants — no missing English key,
no missing regional key, no orphan key — and `RETIRED_PREFIXES = ["gw_"]` exempts
keys that legitimately exist only in the Bengali module. Removing the gateway
meant dropping `bd_gw_pay` / `bd_gw_note` from both `en` and `hi`; had they been
left in `hi` only, the missing-regional-key check would have passed while the
orphan check failed. The module name `i18n.gateway.ts` was a historical artifact
of the landing page's "gateway" cards (a cooperative gateway = a service entry
point, nothing to do with payments) and was deleted along with its regional
imports.

**Docs are coupled to the test count.** `README.md` and `SIH_SUBMISSION.md` both
state **564 tests across 32 files**. That's a measured number, not a claim:
removing `payments.test.ts` (12) and `cryptoHex.test.ts` (8) from 478 is the whole
delta. If you add or drop a test, both docs go stale.

---

## File map for this flow

| File | Role |
|---|---|
| `src/main.tsx` | Provider tree, `initBnGateway()` before first render |
| `src/pages/BookingDetail.tsx` | Customer booking screen: reactive queries, UPI QR, UTR gate, radar map |
| `src/convex/bookings.ts` | Lifecycle core, 90/7/3 split, `NEXT_STATUS`, `settlePaidBooking` |
| `src/convex/schema.ts` | `bookings` table + indexes, money and lifecycle columns |
| `src/convex/rateLimit.ts` | Fixed-window per-subject limiter, 11 scopes |
| `src/convex/http.ts` | Auth HTTP routes only |
| `src/lib/i18n.tsx` | Five-language dictionaries + side-module merge |
| `src/test/i18n.test.ts` | Key-parity invariants across all five languages |
| `src/test/convexHarness.ts` | convex-test harness and seeders |

---

## What the gateway removal bought

The webhook was the only inbound HTTP endpoint an attacker could hit
unauthenticated. Now: no payments env vars, no webhook route, no `httpAction`,
no signature verification code, no crypto helper, no checkout.js in
`index.html`. The trust story got simpler to state — money moves by UPI directly
from customer to artisan, and the federation's only record of it is the
customer's own UTR plus the immutable 7% accrual.

The honest weakness, which the docs state plainly: a UTR is self-attested. The
removed gateway verified a bank signature; this one trusts the customer's word.
That's a deliberate trade for "the cooperative never holds customer funds," but
it's the line a reviewer will push on.

---

## Working on this repo

```bash
bunx convex dev --once    # required after editing anything in src/convex/
bunx tsc -b --noEmit      # frontend typecheck
bun run test              # 564 tests / 32 files
bun run lint
```

`convex dev` must **always** be run with `--once`; the bare form hangs in a
non-interactive terminal.
