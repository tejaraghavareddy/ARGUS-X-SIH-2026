import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireUser, isAdminUser } from "./identity";
import { consume } from "./rateLimit";
import { v } from "convex/values";

/**
 * Invoicing for completed cooperative work.
 *
 * The PS asks for "digital payments and invoicing" as one feature. The payment
 * half exists and is deliberately custodial-free — UPI moves straight from the
 * customer to the artisan's own VPA. This module is the other half: the paper
 * record.
 *
 * Three rules make the invoice worth anything:
 *
 *  1. **One invoice per booking, ever.** A re-issued receipt must not become a
 *     second number in the society's books. `issue` returns the existing
 *     invoice when one is already there rather than minting a duplicate, so
 *     even a double-tap is safe.
 *  2. **Only a settled booking can be invoiced.** An invoice is an assertion
 *     that money moved. Allowing one on a `pending` booking would let anyone
 *     print a receipt for work nobody paid for.
 *  3. **The money columns are frozen at issue time.** They are copied from the
 *     booking, not read live, so a later price change cannot retroactively
 *     alter a receipt a customer already filed.
 *
 * The number is sequential and society-facing rather than a random id, because
 * the whole point of the document is that a customer can read it out over the
 * phone to a society office and have it match their register.
 */

/** Statuses that represent settled money. Anything earlier is not invoicable. */
const INVOICABLE = new Set(["completed", "settled"]);

/**
 * Indian tax identifiers, validated rather than stored blind.
 *
 * A GSTIN printed in the wrong shape on a receipt is worse than no GSTIN: it
 * invites a rejection at the counter and undermines the document's credibility.
 * These checks are structural only — they cannot tell you whether a number was
 * genuinely issued — so they stop typos, not fraud.
 */

/** PAN: 5 letters, 4 digits, 1 letter. e.g. ABCDE1234F */
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** GSTIN: 15 characters, the first 2 being the state code, last 1 a checksum. */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** SAC codes are 6 digits under the Services Accounting Code scheme. */
const SAC_RE = /^[0-9]{6}$/;

export function isValidPan(v: string | undefined): boolean {
  return v === undefined || v === "" || PAN_RE.test(v);
}

export function isValidGstin(v: string | undefined): boolean {
  return v === undefined || v === "" || GSTIN_RE.test(v);
}

export function isValidSac(v: string | undefined): boolean {
  return v === undefined || v === "" || SAC_RE.test(v);
}

/**
 * Mint the next sequential invoice number for a society.
 *
 * Counts the existing invoices rather than keeping a counter row, so the
 * sequence cannot drift out of step with the documents themselves after a
 * rollback, a failed insert, or a test fixture that inserted directly.
 */
async function nextInvoiceNumber(
  ctx: QueryCtx,
  societyId: Id<"societies"> | undefined,
  year: number,
): Promise<string> {
  const existing = societyId
    ? await ctx.db
        .query("invoices")
        .withIndex("by_society", (q) => q.eq("societyId", societyId))
        .collect()
    : await ctx.db.query("invoices").collect();

  const prefix = `SS-${year}-`;
  const used = new Set<number>();
  for (const inv of existing) {
    if (!inv.number.startsWith(prefix)) continue;
    const n = Number(inv.number.slice(prefix.length));
    if (Number.isFinite(n)) used.add(n);
  }
  let seq = 1;
  while (used.has(seq)) seq += 1;
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

/**
 * Issue (or re-fetch) the invoice for a booking.
 *
 * Idempotent by design: the unique index on `by_booking` plus the existence
 * check means the caller always ends up with exactly one document.
 */
export const issue = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");

    const isAdmin = await isAdminUser(ctx, userId);
    if (
      booking.customerId !== userId &&
      booking.workerUserId !== userId &&
      !isAdmin
    ) {
      throw new Error("Not your booking");
    }

    // Never two receipts for one job, whatever the caller does.
    const existing = await ctx.db
      .query("invoices")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .first();
    if (existing) return existing._id;

    if (!INVOICABLE.has(booking.status)) {
      throw new Error("An invoice is issued once the job is paid");
    }
    if (booking.utr === undefined) {
      throw new Error("No payment reference recorded for this booking");
    }

    // Charged only after the caller is confirmed to be a party to a paid
    // booking, so the budget cannot be burned against arbitrary ids.
    await consume(ctx, "invoice", userId);

    const customer = await ctx.db.get(booking.customerId);
    const societyId = customer?.societyId;
    const now = new Date();
    const number = await nextInvoiceNumber(ctx, societyId, now.getFullYear());

    // Tax identity comes off the worker — the person the receipt is issued
    // from. Validated here rather than trusted, so a malformed identifier can
    // never reach a printed document. Absent is fine: an unregistered worker
    // still gets an invoice, just an unregistered-seller one.
    const artisan = booking.workerId
      ? await ctx.db.get(booking.workerId)
      : null;
    if (artisan && !isValidPan(artisan.pan)) {
      throw new Error("The worker's PAN is not a valid format — correct it first");
    }
    if (artisan && !isValidGstin(artisan.gstin)) {
      throw new Error("The worker's GSTIN is not a valid format — correct it first");
    }
    if (artisan && !isValidSac(artisan.sacCode)) {
      throw new Error("The worker's SAC code is not a valid format — correct it first");
    }

    return await ctx.db.insert("invoices", {
      bookingId: booking._id,
      number,
      societyId,
      issuedToUserId: booking.customerId,
      issuedToName: customer?.name ?? undefined,
      artisanId: booking.workerId,
      artisanName: artisan?.fullName ?? undefined,
      pan: artisan?.pan || undefined,
      gstin: artisan?.gstin || undefined,
      sacCode: artisan?.sacCode || undefined,
      serviceName: booking.serviceName,
      address: booking.address,
      base: booking.base,
      workerShare: booking.workerShare,
      welfareAmt: booking.welfareAmt,
      opsAmt: booking.opsAmt,
      total: booking.total,
      utr: booking.utr,
      paymentMethod: booking.paymentMethod,
      paidAt: booking.paidAt,
      issuedAt: Date.now(),
    });
  },
});

/** The invoice for a booking, if one has been issued. Read-only. */
export const forBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return null;
    const isAdmin = await isAdminUser(ctx, userId);
    const allowed =
      booking.customerId === userId ||
      booking.workerUserId === userId ||
      isAdmin;
    if (!allowed) return null;
    return await ctx.db
      .query("invoices")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .first();
  },
});

/** Everything the customer has been invoiced, newest first. */
export const myInvoices = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("issuedToUserId", userId))
      .order("desc")
      .take(100);
  },
});

/** The society's invoice register — the document an auditor would ask for. */
export const forSociety = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    if (!(await isAdminUser(ctx, userId))) throw new Error("Forbidden");
    const all = await ctx.db.query("invoices").order("desc").take(500);
    return all;
  },
});

/**
 * Whether a booking can be invoiced yet, and if not, why.
 *
 * Returned instead of thrown so the UI can disable the button with an
 * explanation instead of letting the customer press it and eat an error.
 */
export const eligibility = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false as const, reason: "signed_out" };
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return { ok: false as const, reason: "missing" };
    const isAdmin = await isAdminUser(ctx, userId);
    if (
      booking.customerId !== userId &&
      booking.workerUserId !== userId &&
      !isAdmin
    ) {
      return { ok: false as const, reason: "forbidden" };
    }
    const existing = await ctx.db
      .query("invoices")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .first();
    if (existing) return { ok: true as const, invoiceId: existing._id, existing: true };
    if (!INVOICABLE.has(booking.status)) {
      return { ok: false as const, reason: "unpaid" };
    }
    if (booking.utr === undefined) {
      return { ok: false as const, reason: "no_reference" };
    }
    return { ok: true as const };
  },
});

/**
 * Revenue totals for the society, derived from invoices rather than bookings.
 *
 * The 7% welfare column is the number a cooperative board actually watches, so
 * it is summed straight off issued documents.
 */
export const ledgerTotals = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    if (!(await isAdminUser(ctx, userId))) throw new Error("Forbidden");
    const all = await ctx.db.query("invoices").collect();
    let total = 0;
    let welfare = 0;
    let ops = 0;
    let workerPayout = 0;
    for (const inv of all) {
      total += inv.total;
      welfare += inv.welfareAmt;
      ops += inv.opsAmt;
      workerPayout += inv.workerShare;
    }
    return {
      count: all.length,
      total,
      welfare,
      ops,
      workerPayout,
    };
  },
});
