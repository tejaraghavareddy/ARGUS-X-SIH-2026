# Commit messages

Git is disabled in this sandbox ("Git and GitHub commands are blocked; Vly
manages version control"), so I could not rewrite the existing history
myself. Below is a ready-to-apply set instead.

Two things to decide first:

1. **Do you want one commit per logical change, or one squashed commit?**
   Rewording existing commits is a history rewrite; squashing is irreversible
   too. Both are safe *only* if the history is not shared yet.
2. **Is the history already pushed?** If yes, do not rewrite — add a new commit
   instead. If it is local-only, the script below is fine.

---

## Option A — squash everything into one well-described commit

Easiest, safest, and a single clean entry for a judging panel.

```bash
git reset --soft <root-commit-sha>
git commit -m "$(cat <<'EOF'
feat(coop): build Sahakar Seva gig-work federation platform

Implements SIH 2026 problem statement 26089: a cooperative-owned
marketplace connecting district societies to verified tradespeople.

Backend (Convex):
- 14 application tables over the Convex Auth schema; artisan profiles,
  booking lifecycle, group cost-sharing, societies, disputes, reviews,
  work samples and worker-published listings
- three-tier governance (super admin / federation admin / member) with
  federation scoping enforced in the query layer and covered by
  isolation tests
- Razorpay gateway checkout with server-side HMAC verification and
  idempotent settlement, alongside the default direct-UPI rail
- fixed 90/7/3 settlement split enforced in code with no operator
  override; welfare accrues once per visit, not per participant
- per-subject fixed-window rate limiting with hashed identifiers
- Gemini demand forecasting with a documented heuristic fallback and
  keyless Open-Meteo weather input

Frontend (React 19 + Vite + Tailwind v4):
- customer, worker, federation-admin and platform consoles
- four-gate worker onboarding issuing a digital trade credential
- live GPS radar, group bookings, Safety Mode, dispute arbitration
- dedicated worker sign-in with SMS and email OTP
- five-language i18n with dictionary-integrity tests

Reliability:
- 467 tests across 29 files, including end-to-end journey coverage
- geospatial accuracy grading, fix plausibility rejection and
  reverse-geocoding cache
- worker sign-in hardened against the two Convex Auth OTP pitfalls:
  empty-code send/verify branching and Phone() ignoring the supplied
  provider id

🤖 Generated with Codebuff
Co-Authored-By: Codebuff <noreply@codebuff.com>
EOF
)"
```

## Option B — one commit per logical change

Use `git reset --soft <root-commit-sha>`, then stage and commit in slices:

```bash
git add src/convex/schema.ts src/convex/_generated
git commit -m "feat(schema): add cooperative domain model and restore auth phone columns

Introduces 14 application tables (artisans, bookings, bookingGroups,
societies, disputes, workSamples, customServices, forecasts,
notifications, adminAuditLog, rateLimits, reviews, messages) and the
superadmin role with users.societyId federation scoping.

Also restores phone, phoneVerificationTime and the by_phone index on
users: the local override of the authTables table had silently dropped
them, which breaks phone-based sign-in at account creation."

git add src/convex/identity.ts src/convex/superAdmin.ts src/components/RequireSuperAdmin.tsx src/pages/SuperAdmin.tsx
git commit -m "feat(authz): add super-admin tier with federation appointment

Introduces a platform governance tier above federation admin: federations
can be created, suspended and activated, and their admins appointed or
removed. Applies the requirePlatformTier guard to society management
and adds isolation tests asserting cross-federation access is refused."

git add src/convex/payments.ts src/convex/paymentsWebhook.ts src/convex/cryptoHex.ts src/convex/bookings.ts src/convex/http.ts
git commit -m "feat(payments): add Razorpay gateway checkout with idempotent settlement

Keeps direct UPI to the worker's VPA as the default rail and adds a
verified gateway path for households needing a receipt. Key secrets are
read only in the node runtime; the browser callback is trusted solely
after the order_id|payment_id HMAC verifies. Settlement is an
internalMutation so a replayed webhook and the client callback cannot
pay a worker twice. Records paymentMethod so a typed UTR and a verified
gateway payment remain distinguishable in the ledger."

git add src/lib/geo.ts src/lib/useLocation.ts src/components/AppHeader.tsx
git commit -m "fix(geo): reject implausible fixes and stop leaking the GPS watcher

Classifies accuracy, rejects Null Island, out-of-range coordinates and
fixes outside the serviceable bounding box, and starts watchPosition
before getCurrentPosition while releasing the watcher and timer on every
exit path — previously a permission denial left the GPS running for the
rest of the session.

Adds a timeout and a bounded cache to reverse geocoding, and prevents a
slow background fix from overwriting a worker's manual map pin."

git add src/convex/auth/phoneOtp.ts src/convex/authThrottle.ts src/pages/WorkerAuth.tsx src/lib/portal.ts src/lib/authProviders.ts
git commit -m "feat(auth): add dedicated worker portal sign-in with SMS OTP

Adds /login/worker, phone-first, routed independently of the customer
portal. Restores the phone columns the users override had dropped, and
routes RequireAuth and header sign-out to the portal that owns the
current path.

Hardens the OTP flow against two Convex Auth behaviours: signIn branches
on whether code is present rather than non-empty, and Phone() ignores the
provider id and maxAge passed to it, registering under 'phone' with a
20-minute lifetime. Both are pinned by tests."

git add src/convex/authConfig.ts
git commit -m "feat(auth): degrade sign-in when a delivery credential is unset

A missing SMS or email key makes the provider throw inside
sendVerificationRequest, surfacing to the user as an opaque
[CONVEX A(auth:signIn)] Server Error. Exposes which delivery methods are
configured so the sign-in screen disables an unworkable method and
explains why, rather than letting the user submit a valid phone number
into a guaranteed server error."

git add src/lib/i18n.tsx src/lib/i18n.wauth.ts src/test/i18n.test.ts
git commit -m "feat(i18n): add worker sign-in copy across five languages

Extends the dictionary-integrity tests to cover the new keys, so a key
rendered by the app but missing from a regional dictionary fails the
build, as does an English key nothing renders."

git add src/test src/lib/geo.test.ts src/lib/useLocation.test.ts
git commit -m "test: add end-to-end journey, geospatial and worker sign-in coverage

Brings the suite to 467 tests across 29 files. The sign-in harness now
records signIn calls with FormData flattened the way the real client
does, which is what makes the OTP send/verify contract assertable.
Each regression test is verified to fail when its fix is reverted."
```

## Verifying

```bash
git log --oneline
git show --stat HEAD
```

## Reverting a rewrite

```bash
git reflog          # find the pre-rewrite commit
git reset --hard <sha>
```

Do this **before** pushing. Once rewritten history is pushed, recovery means
`git push --force-with-lease`, which rewrites the shared branch for everyone.
