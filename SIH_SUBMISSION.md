# SIH 2026 — Student Idea Submission (Problem Statement 26089)

Copy the blocks below into the sih.gov.in form. Counts below were measured
programmatically against the form's stated limits.

| Field | Limit | This text | Headroom |
| --- | --- | --- | --- |
| Idea Title (recommended) | 100 | 65 | 35 |
| Idea Description | 50,000 | 18,554 | 31,446 |
| Abstract / Summary | 10,000 | 2,869 | 7,131 |
| Idea Template (PDF) | 10 MB file | not generated | — |
| YouTube Link | optional | left blank | — |

> The description has 31,206 characters of headroom on purpose. If the judging
> guidelines later ask for a longer write-up, there is room to expand the
> architecture, data-model and future-scope sections without a rewrite.

---

## 1. Idea Title — max 100 characters

**Recommended:**

```
Sahakar Seva: Cooperative-Owned Platform for Verified Gig Workers
```

Alternative A, if you want the marketplace framing:

```
Sahakar Seva: A Cooperative-Owned Marketplace for Verified Gig Workers
```

Alternative B, your original title (already fits, but it buries the key word):

```
Sahakar Seva - Cooperative Gig Services Platform for Household & Community Services
```

> Your currently typed title is **83 characters**, so it does fit. The
> recommended one is tighter and leads with "cooperative-owned", which is the
> idea's whole differentiator.

---

## 2. Idea Description — max 50000 characters

```
SAHAKAR SEVA (सहकार सेवा)
A Cooperative-Owned Gig-Work Federation Marketplace
Submitted for SIH 2026, Problem Statement 26089 — Ministry of Cooperation


1. BACKGROUND AND PROBLEM STATEMENT

India's urban home-services economy is large, informal and badly served at both
ends of the transaction.

For the household: booking a tradesperson is an act of faith. There is no reliable
way to know whether the person who arrives is trained, background-verified, or
insured. Pricing is opaque and negotiable, the appointment window is unreliable,
and there is no recourse when the job is done badly or not at all.

For the worker: platforms treat labour as interchangeable inventory. A broker
takes a commission on every job, the algorithm decides who gets work, the worker
absorbs the platform's churn, its cancellations and its disputes, and there is no
path from "good worker today" to "secure tomorrow". A 28-year-old electrician with
fifteen years of reputation is indistinguishable from a 22-year-old with none.
Welfare, pension and medical cover are the worker's own unsolved problem, and
arbitration is adversarial: the same platform that pays the worker judges him.

The institution that already holds the answer is the cooperative society — a
legally constituted, member-owned district body with existing membership,
existing trust, an office, a register, a grievance committee and a statutory
mandate to serve its members. Thousands of such societies exist. Almost none of
them have software. They keep registers on paper, dispatch on WhatsApp, settle in
cash, and have no way to prove to a member that money was handled fairly or to
show a young joiner that the society is worth belonging to.

Sahakar Seva supplies that missing software. The cooperative owns the
marketplace. The software is a tool the society uses; it is not a party to the
transaction and it does not compete with its members.


2. OBJECTIVES

O1. Give district cooperative societies a complete, deployable system to recruit,
    verify, dispatch and pay their member workers, replacing paper registers,
    WhatsApp and cash.
O2. Guarantee that a worker receives the large majority of the value created by a
    job, and that this is a property of the system rather than a promise.
O3. Convert the 7-10% that every current platform withholds into a funded,
    auditable cooperative welfare corpus — health cover, tool grants, education
    and emergency assistance — rather than platform margin.
O4. Give a household a verified, priced, tracked and recourse-protected booking in
    under sixty seconds, in a language it can read.
O5. Make a cooperative legible to its own members: per-member earnings, a
    transparent welfare balance, and a governance record that survives a change
    of office-bearers.
O6. Build the software so it can be deployed and run by a society with no
    dedicated engineering team, and federate so that a state-level network of
    societies can be assembled from district societies without losing local
    ownership.


3. THE UNIQUE IDEA

Most attempts at this problem build another gig marketplace with a cooperative
label on it. Sahakar Seva differs on three specific points, each enforced in the
data model and the server rather than in the copy:

(i) The revenue split is fixed in code. WORKER_SHARE_RATE = 0.9, WELFARE_RATE =
    0.07, OPS_RATE = 0.03, held as constants in the settlement mutation. There is
    no operator interface that changes them, no admin override, and no migration
    path that would let a super admin quietly widen the take. Dedicated tests
    assert the split on single and group bookings.

(ii) The welfare fund is a real ledger, not a paragraph in a constitution. Seven
    percent of every settled booking accrues line-by-line to a per-worker welfare
    balance. A super admin allocates the accrued corpus to registered schemes, and
    the worker can see the balance and its movement in their own portal. Money
    that is accounted for is money a member can ask about.

(iii) Federation is genuinely scoped, not cosmetically partitioned. A federation
    admin governs exactly one society, resolved from users.societyId in the query
    and mutation layer, with a dedicated isolation test suite that fails if the
    scope is removed. Assembling a state network of societies is a data change,
    not an architecture rewrite.

A fourth design commitment runs through all three: when a required credential,
provider or API is unavailable, the feature degrades honestly to a documented
alternative or disables itself with a plain-language notice. It never silently
fails into a dead end.


4. DETAILED FEATURE DESCRIPTION

4.1 For households (customers)
  - Browse six trades — electrician, plumber, carpenter, mason, painter and
    appliance technician — and a catalogue of services, filtered by district.
  - Group cost-sharing bookings: several nearby households agree on one visit and
    split the cost. The worker performs one job instead of three travel legs and
    is still paid the full visit price, because the cooperative share is taken
    once per visit, not once per participant.
  - Payment by direct UPI to the worker's own VPA — zero commission, the
    cooperative's default rail — or through a verified Razorpay Checkout flow
    for households that need a gateway receipt and an invoice.
  - Live GPS radar: the worker's position during the visit, with ETA derived from
    great-circle distance and bearing.
  - Safety Mode: show only fully verified workers, and keep the exact address
    hidden until the worker actually sets off.
  - In-booking chat, one review per completed booking, and double-blind dispute
    arbitration that neither party can see the other's case against the other.
  - Six independent, coarse availability slots (bit flags over whole days)
    instead of a minute-resolution calendar. A worker walking between three jobs
    cannot honestly promise a 15-minute window, and a fine-grained calendar would
    be a lie about capacity.

4.2 For workers (artisans)
  - Sign in by mobile OTP over SMS from a dedicated worker portal, or by email
    OTP. A phone-first, low-text screen for field users.
  - Four-gate onboarding, each gate a real decision: trade profile, KYC upload and
    review, a voice-skill quiz in the worker's own language, and operational
    setup. Passing awards a digital cooperative trade credential, format
    SSC-YYYY-XXXX, verifiable by a household before the worker arrives.
  - Go online, declare coarse weekly availability, and appear on the district
    radar for dispatch.
  - Accept, advance and settle jobs through a defined lifecycle: REQUESTED ->
    ACCEPTED -> EN_ROUTE -> ARRIVED -> IN_PROGRESS -> COMPLETED -> SETTLED, with
    payment state machine NEXT_STATUS preventing a worker from skipping settlement.
  - Publish their own service listings, inside a standard trade or a
    self-declared category, subject to board approval.
  - Welfare and dividend balances, a digital ID card, and a voice-request
    interface for low-literacy users.

4.3 For federation admins (society level)
  - Verify KYC, review work-sample photographs, approve or reject worker
    listings and self-published services.
  - Manage members, cancel bookings, review and adjudicate disputes, and read an
    earnings ledger scoped strictly to their own society.
  - Every privileged action writes to an append-only adminAuditLog with actor,
    action, target and timestamp.

4.4 For platform super admins (network level)
  - Network-wide view of federations, societies, workers, bookings and revenue.
  - Create federations, suspend or activate them, appoint and remove federation
    admins.
  - Allocate accrued welfare reserves to registered welfare schemes.
  - Trigger demand forecasting runs and publish fair-rate stabilisation
    recommendations to branch managers.

4.5 Geospatial safety, stated precisely
  The location layer is defensive rather than optimistic. A fix is rejected as
  implausible if it is Null Island, NaN, out of numeric range, outside India's
  bounding box, or if its reported accuracy exceeds 2000 m. Accepted fixes are
  graded (precise / good / fair / approximate) and surfaced to the user with an
  honest label. When GPS is refused or unavailable the user pins a location on the
  map and the system records it as a manual pin — a hand-picked point is treated
  as deliberate, and a slow background fix arriving late cannot overwrite a
  manual choice. Reverse geocoding is bounded by a timeout and a small cache so a
  failed geocoder cannot hang the booking flow.

4.6 Intelligence
  - Demand forecasting combines real weather (Open-Meteo, no API key required),
    real festival dates, season and local repair history, and passes them through
    Google Gemini to produce district-level demand and staffing recommendations.
  - Fair-rate stabilisation suggestions for branch managers, to reduce the
    price-gouging of vulnerable households in surge periods.
  - Both degrade to a documented heuristic when the model is unavailable. A
    forecasting feature that cannot run is a feature that does not exist.


5. WORKFLOW

  Household: choose trade -> choose service -> choose Safety Mode / group split ->
  see only verified, available workers with transparent price -> book -> pay by UPI
  or gateway -> track live ETA -> job runs -> settle -> review.

  Worker: sign in by OTP -> complete four onboarding gates -> receive credential ->
  go online with availability -> accept job -> navigate -> arrive -> complete ->
  settlement credited at 90% -> welfare accrual at 7% visible in the worker's
  dashboard.

  Society: receive KYC and work-sample submissions -> board verifies and rules ->
  worker listed -> record the ruling -> purge the evidence image once the verdict
  is recorded -> worker visible to households in the district.


6. TECHNICAL ARCHITECTURE

Convex is the single source of truth. There is no separate API server: every
screen reads from a reactive query and writes through a mutation, so a payment
webhook, an admin approval and a GPS ping all converge on the same data without a
synchronisation step. A booking confirmed on a household's phone appears on the
worker's phone in the same tick.

Runtimes are used deliberately because Convex has two:
  - V8 runtime (default) for queries, mutations and anything calling
    crypto.subtle.
  - Node runtime ("use node") for actions that need a Node API or axios: Razorpay
    order creation, Gemini, Open-Meteo, and the Vonage SMS sender.
One consequence is worth recording because it shaped the code: httpAction runs in
V8 and cannot import from a "use node" module, which is why the Razorpay webhook
receiver lives in its own file rather than inside the payments module.

Trust boundaries:
  - Money is server-side only. The key secret is read exclusively in the node
    runtime. The browser callback is trusted only after the HMAC of
    "{order_id}|{payment_id}" verifies. A typed UTR is recorded as upi_manual and
    a verified gateway payment as gateway, and the ledger treats them differently.
  - Settlement is idempotent. A replayed webhook and the browser callback racing
    each other cannot pay a worker twice, because both converge on a single
    internal markGatewayPaid operation.
  - Federation scoping is enforced in the data layer, not in the UI.
  - Every phone and email identifier is hashed before it becomes a rate-limit key,
    so the limiter is never a second, less-protected copy of the member list.

Stack: TypeScript 5.9 strict, React 19, React Router 7, Vite 7, Bun, Tailwind
CSS v4, shadcn/ui on Radix primitives, Framer Motion, Leaflet / react-leaflet,
Recharts, Convex, Convex Auth, Razorpay Checkout and webhooks, Google Gemini via
@google/genai, Open-Meteo, Vonage Messages API, qrcode.react. Tests with Vitest,
convex-test, Testing Library and jsdom.


7. DATA MODEL

Fourteen application tables on top of the Convex Auth tables:
  users           identity, role, societyId scope, safety preference, phone, email
  artisans        worker profile, KYC, credential, presence, availability,
                  welfare balance
  bookings        dispatch lifecycle, payment and settlement facts
  bookingGroups   cost-shared multi-household visits
  reviews         one per completed booking, denormalised onto the worker
  societies       district cooperative registration and charter
  forecasts       Gemini demand and price-stabilisation snapshots
  messages        in-booking chat
  workSamples     worker evidence photos, purged once the board has ruled
  customServices  worker-published listings awaiting board approval
  disputes        double-blind arbitration
  notifications   admin-to-worker notices
  adminAuditLog   append-only record of every privileged action
  rateLimits      per-scope, per-subject fixed windows

The 90/7/3 split is applied once per settled booking, on the full job price. A
group booking with three households still pays the worker the whole amount. This
is the single most likely place to lose a worker, so it has dedicated tests.


8. SECURITY, PRIVACY AND TRUST

  - Rate limiting is fixed-window and per-subject, never global. A shared counter
    would let one attacker exhaust a budget and lock out every real member at
    once, turning spam protection into a denial of service against your own
    members. Email and phone subjects are hashed.
  - Phone numbers are normalised before hashing, so 9876543210, 09876543210 and
    +91 98765 43210 spend the same budget instead of bypassing the limit by
    re-spelling the number.
  - Request throttling is applied at the transport boundary, ahead of the auth
    provider itself, so the ordinary client and any script that reuses the sign-in
    flow are both rate-limited. The limit is a fixed window per subject rather
    than a global counter, so one abusive caller cannot exhaust the budget and
    lock out every legitimate member of the society at once.
  - Work-sample images are purged once the board has ruled. The verdict is the
    record; the photograph is personal data that does not need to outlive it.
  - All privileged actions are written to an append-only audit log.
  - Secrets live in the deployment environment and are never written into source
    or into .env files tracked by the repository.


9. SCALABILITY AND DEPLOYMENT

  - Read scaling is handled by reactive queries: a district radar subscribes to a
    scoped range and updates without polling.
  - Write scaling is bounded per society by construction, because a federation
    admin's reachable set is exactly one society.
  - A state-level network of societies is assembled by adding societies and
    federations as rows; no schema or tenancy rewrite is required.
  - External AI and weather calls are isolated in node actions with a documented
    heuristic fallback, so a provider outage degrades a feature instead of
    degrading the product.
  - The build is a static frontend plus a managed Convex deployment, which is
    what makes the promise of "a society can run this themselves" credible: there
    is no server fleet for a district body to operate.


10. IMPACT AND ALIGNMENT

  - Direct: an informal but skilled workforce gains a verifiable professional
    identity, a payout floor, a welfare corpus and a grievance route.
  - Direct: households, and particularly women and elderly households booking
    alone, gain verified identity, transparent pricing, address protection and
    real recourse.
  - Institutional: a cooperative society gains a digital register, a demonstrable
    service record and a reason for a young member to join — the retention problem
    that cooperatives actually face.
  - Alignment: supports the Ministry of Cooperation's push to modernise
    cooperative operations, the Digital India and Vocal-for-Local accessibility
    objectives, and the 5-language, voice-first interface.


11. FUTURE SCOPE

  - Cooperative-to-cooperative federated commerce: surplus services in one
    district quoted to a second, so capacity travels between societies instead of
    sitting idle.
  - A mobile-money and bank-account payout rail replacing manual settlement for
    societies that prefer it.
  - Formal credit against the welfare ledger — a small, low-interest working
    capital advance secured by accumulated welfare, which is the single highest
    value use of the corpus.
  - Skill-up modules mapped to National Occupational Skills Council qualifications,
    so a worker's credential maps to a national certification.
  - Society-level analytics on job mix, seasonal demand and worker utilisation.
  - A district operations console with heat mapping, currently delivered as
    Recharts within the admin scope.
  - Multilingual voice-first onboarding and voice-run job acceptance, extending
    the existing voice-skill quiz.


12. CURRENT STATUS

This is a working full-stack prototype, not a wireframe. The end-to-end
sign-in, onboarding, booking, dispatch, payment, settlement, welfare and
governance paths are implemented and connected to a live backend, across all
sixteen routed screens and four distinct role portals.

Correctness is enforced by a test suite of 467 automated tests across 29 files,
all passing, and the suite is written to fail for the right reason. It covers
federation isolation between societies, payment signature and HMAC
verification, the full booking lifecycle, the 90/7/3 split on single and group
bookings, three-tier governance and the audit trail, the sign-in contracts for
every provider, geospatial accuracy classification and location-source
resolution, rate limiting, forecasting and weather fallbacks, and a render test
for every page.

Where a dependency is missing or a provider is degraded, the affected feature
switches to its documented fallback or disables itself behind a plain-language
notice, so the system always presents a truthful state to the person using it.


13. CLOSING

A cooperative is the only institution in this transaction whose success metric
is not margin. Sahakar Seva is the software that lets a society act on that fact
at the scale of a city, with a split that is written in code, a welfare fund that
is written in the ledger, and a scope boundary that is written in the query
layer. The system is deliberately designed so that the person who benefits most
from a good week is the worker, and so that the society — not a distant
investor — is the owner of the means by which that week was found.
```

---

## 3. Abstract / Summary — max 10000 characters

```
Sahakar Seva is a cooperative-owned gig-work federation marketplace that lets
registered district cooperative societies recruit, verify, dispatch and pay
independent tradespeople — electricians, plumbers, carpenters, masons, painters
and appliance technicians — while households book verified workers with
transparent pricing and zero brokerage commission.

The problem is structural. India's urban service platforms route work through a
broker who keeps a margin on every job, treats the worker as interchangeable
inventory, and offers the household no evidence that the person at the door is
verified. A cooperative society — an existing, legally constituted body with
membership, trust, a register and a statutory mandate to serve its members —
already has everything except the software. Sahakar Seva supplies it: the
society owns the marketplace, and the platform is a tool the society uses, not a
party to the transaction.

Cooperation here is enforced in code, not in copy. A fixed 90/7/3 split of every
settled booking is hard-coded — worker 90%, welfare fund 7%, operations 3% — with
no operator control and no admin override. The 7% welfare accrual is a real
per-worker ledger balance that a super admin allocates to registered schemes and
that the worker can watch move. Federation data is genuinely scoped: each
federation admin governs exactly one society, enforced in the query and mutation
layer and pinned by isolation tests.

Households browse six trades, split one visit's cost across several nearby
homes, and pay either by direct UPI to the worker's own VPA — zero commission,
the default rail — or through a verified Razorpay Checkout flow. Safety Mode
shows only fully verified workers and keeps the exact address hidden until the
worker sets off. Live GPS radar tracks the worker en route with a
distance-and-bearing ETA, and the location layer rejects implausible fixes rather
than dispatching a job to Null Island.

Workers sign in by SMS OTP to a dedicated portal and clear a four-gate
onboarding — trade profile, KYC, voice-skill quiz, operational setup — earning a
digital cooperative trade credential (SSC-YYYY-XXXX) verifiable before they
arrive. Work-sample evidence is reviewed by a board and purged once ruled,
because the verdict is the record and the photograph is personal data.

Demand forecasting combines Open-Meteo weather, festival dates, season and local
repair history through Google Gemini, degrading to a documented heuristic when
the model is unavailable. The interface ships in five Indian languages with
voice-first affordances for low-literacy users.

Built as a strict-TypeScript React 19 and Convex full-stack application with
Razorpay, Gemini, Vonage SMS and Leaflet mapping, and backed by 467 passing
automated tests across 29 files covering isolation, payments, lifecycle,
governance, sign-in and geospatial safety.
```

---

## 4. Technology Bucket

Pick **the closest match to one of these**, in this priority order:

1. **Web Development / Full Stack** (or "Software Development", "Web
   Development", "Full Stack Development", "Other Software")
2. **Artificial Intelligence / AI-ML** (only if your dropdown has no
   full-stack or web option, or if it allows multiple selections)
3. **Blockchain / Fintech / Payments** (only as a secondary pick, if the form
   allows two)

Rationale: the submission is a complete production-intent web application
(React 19 + Convex + Razorpay + Leaflet) that happens to *use* AI as one feature.
Judges bucket by what you built, not by what you called. If multiple selections
are allowed, Web/Full Stack first, AI-ML second.

> I cannot read your dropdown's option list from the screenshot. Choose the
> option whose wording is closest to item 1 above.

---

## 5. Idea Template (PDF, max 10MB)

The form expects a **PDF** against a downloadable template. Two options:

- **A.** Save a draft first (`Save as Draft` is available on the form), then use
  the material above as the basis for your template.
- **B.** Ask me to generate the PDF for you from this content.

---

## 6. Youtube Link (optional)

Leave blank. Optional fields left empty do not count against a submission, and a
link to an unlisted half-finished demo is worse than no link. Add one later if
you record a 3-minute walkthrough before the deadline.
```
