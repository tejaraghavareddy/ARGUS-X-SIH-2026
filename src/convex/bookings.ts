import { getAuthUserId } from "@convex-dev/auth/server";
import {
  query,
  mutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { isAdminUser, requireUser, adminSocietyScope, bookingInScope } from "./identity";
import { consume } from "./rateLimit";
import { parseCustomServiceId } from "./customServices";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

/* ── Server-side service pricing (kept free of client/UI imports) ── */

interface ServicePrice {
  trade: string;
  name: string;
  base: number;
  hourly: number;
  urgent: boolean;
}

const SERVICE_PRICES: Record<string, ServicePrice> = {
  "el-fan": { trade: "electrician", name: "Ceiling fan install or repair", base: 149, hourly: 250, urgent: false },
  "el-wire": { trade: "electrician", name: "Full house wiring check", base: 299, hourly: 350, urgent: false },
  "el-short": { trade: "electrician", name: "Short circuit / power failure", base: 249, hourly: 400, urgent: true },
  "el-light": { trade: "electrician", name: "Light & switch fittings", base: 129, hourly: 250, urgent: false },
  "pl-tap": { trade: "plumber", name: "Tap & mixer repair", base: 129, hourly: 250, urgent: false },
  "pl-block": { trade: "plumber", name: "Blocked drain clearing", base: 199, hourly: 300, urgent: true },
  "pl-tank": { trade: "plumber", name: "Tank & flush repair", base: 199, hourly: 300, urgent: false },
  "pl-pipe": { trade: "plumber", name: "Hidden pipe leak trace", base: 299, hourly: 350, urgent: false },
  "ca-door": { trade: "carpenter", name: "Door & lock alignment", base: 199, hourly: 300, urgent: false },
  "ca-furn": { trade: "carpenter", name: "Furniture repair", base: 249, hourly: 350, urgent: false },
  "ca-modular": { trade: "carpenter", name: "Modular fittings", base: 179, hourly: 300, urgent: false },
  "ca-measure": { trade: "carpenter", name: "Custom build consultation", base: 299, hourly: 0, urgent: false },
  "ma-crack": { trade: "mason", name: "Wall crack sealing", base: 299, hourly: 350, urgent: false },
  "ma-water": { trade: "mason", name: "Seepage & dampness fix", base: 499, hourly: 400, urgent: false },
  "ma-tile": { trade: "mason", name: "Tile replacement", base: 249, hourly: 350, urgent: false },
  "ma-plaster": { trade: "mason", name: "Plaster patch work", base: 249, hourly: 350, urgent: false },
  "pa-room": { trade: "painter", name: "Single room repaint", base: 999, hourly: 0, urgent: false },
  "pa-wall": { trade: "painter", name: "Patch & touch-up", base: 299, hourly: 300, urgent: false },
  "pa-texture": { trade: "painter", name: "Texture & accent wall", base: 699, hourly: 0, urgent: false },
  "pa-waterproof": { trade: "painter", name: "Waterproof coating", base: 899, hourly: 0, urgent: false },
  "ap-ac": { trade: "appliance", name: "AC service & gas top-up", base: 449, hourly: 350, urgent: false },
  "ap-fridge": { trade: "appliance", name: "Refrigerator repair", base: 299, hourly: 350, urgent: true },
  "ap-wm": { trade: "appliance", name: "Washing machine repair", base: 299, hourly: 350, urgent: false },
  "ap-mw": { trade: "appliance", name: "Microwave & oven fix", base: 299, hourly: 350, urgent: false },
};

/** Pricing for a service, from the standard catalog or a worker listing. */
export interface PricedService {
  trade: string;
  name: string;
  base: number;
  hourly: number;
  urgent: boolean;
  customServiceId?: Id<"customServices">;
}

/**
 * Resolve the price of the requested service. `cs_<id>` addresses a
 * worker-created listing, which is only bookable once the board approved it.
 */
export async function priceService(
  ctx: QueryCtx | MutationCtx,
  serviceId: string,
): Promise<PricedService | null> {
  const customId = parseCustomServiceId(serviceId);
  if (customId) {
    let row: Doc<"customServices"> | null = null;
    try {
      row = await ctx.db.get(customId as Id<"customServices">);
    } catch {
      return null;
    }
    if (!row || row.status !== "approved") return null;
    return {
      trade: row.trade,
      name: row.name,
      base: row.base,
      hourly: row.hourly,
      urgent: row.urgent,
      customServiceId: row._id,
    };
  }
  const svc = SERVICE_PRICES[serviceId];
  return svc ? { ...svc } : null;
}

/* ── Cooperative revenue distribution ──
 * Every booking amount splits three ways:
 *   90% → worker payout (direct UPI settlement to the artisan)
 *    7% → worker welfare fund (pension, insurance, family support)
 *    3% → operational costs (dispatch, telemetry, verification board)
 */
export const WORKER_SHARE_RATE = 0.9;
export const WELFARE_RATE = 0.07;
export const OPS_RATE = 0.03;
/**
 * The stage a worker may push a job to by hand.
 *
 * "payment" is deliberately absent. Leaving it is how a worker could mark a
 * job completed without the customer ever paying, which would skip the payment
 * step *and* the 7% welfare accrual in settlePaidBooking — the one thing this
 * federation cannot afford to get wrong. The only way out of "payment" is a
 * verified settlement: confirmUtr (the customer submits the UPI transaction
 * reference).
 */
const NEXT_STATUS: Record<string, string> = {
  accepted: "enroute",
  enroute: "inprogress",
  inprogress: "payment",
  completed: "settled",
};

/* ── helpers ── */

async function getMyArtisan(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("artisans")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

async function canSeeBooking(
  ctx: QueryCtx,
  userId: Id<"users">,
  b: Doc<"bookings"> | null,
) {
  if (!b) return false;
  if (b.customerId === userId) return true;
  if (b.workerUserId === userId) return true;
  return await isAdminUser(ctx, userId);
}

/** Statuses from which a worker is already on the way to the address. */
const ON_THE_WAY = new Set(["enroute", "inprogress", "payment", "completed", "settled"]);

/**
 * Safety Mode address redaction.
 *
 * A woman or an elderly customer booking a stranger into her home is the exact
 * situation the mode exists for, and the one thing that makes it real is
 * withholding the address until the worker has demonstrably set off. A worker who
 * has not left yet has no legitimate reason to know the door they are heading to,
 * and a booking id is all it takes to ask.
 *
 * Redaction happens in the query, not in the component, so the raw address never
 * reaches the client at all — a masked string in the UI over a full address in
 * the payload would be security theatre.
 */
const ADDRESS_WITHHELD = "Address shared when the worker sets off";
/** Exported so the UI can recognise the redaction marker without duplicating it. */
export const SAFETY_WITHHELD_ADDRESS = ADDRESS_WITHHELD;

async function bookingForViewer(
  ctx: QueryCtx,
  userId: Id<"users">,
  b: Doc<"bookings">,
) {
  const isCustomer = b.customerId === userId;
  if (isCustomer || !b.workerUserId) return b;
  if (ON_THE_WAY.has(b.status)) return b;
  const customer = await ctx.db.get(b.customerId);
  if (!customer?.safetyMode) return b;
  return { ...b, address: ADDRESS_WITHHELD };
}

/* ── customer: create ── */

export const create = mutation({
  args: {
    serviceId: v.string(),
    address: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    scheduledFor: v.number(),
    urgent: v.boolean(),
    notes: v.optional(v.string()),
    welfareOptIn: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    // Every booking becomes a live dispatch on the workers' radar, so creation
    // is rate limited per customer before any work is done.
    await consume(ctx, "booking", userId);
    const svc = await priceService(ctx, args.serviceId);
    if (!svc) throw new Error("Unknown service");
    if (!args.address.trim()) throw new Error("Address is required");
    // Cooperative split applied on the gross amount — always, not opt-in.
    const workerShare = Math.round(svc.base * WORKER_SHARE_RATE);
    const welfareAmt = Math.round(svc.base * WELFARE_RATE);
    const opsAmt = svc.base - workerShare - welfareAmt; // exactly 3%, no rounding drift
    const bookingId = await ctx.db.insert("bookings", {
      customerId: userId,
      serviceId: args.serviceId,
      customServiceId: svc.customServiceId,
      trade: svc.trade,
      serviceName: svc.name,
      address: args.address.trim(),
      lat: args.lat,
      lng: args.lng,
      scheduledFor: args.scheduledFor,
      urgent: args.urgent && svc.urgent,
      notes: args.notes?.trim() || undefined,
      welfareOptIn: args.welfareOptIn,
      base: svc.base,
      hourly: svc.hourly,
      welfareAmt,
      opsAmt,
      workerShare,
      total: svc.base,
      status: "pending",
      createdAt: Date.now(),
    });
    return bookingId;
  },
});

/* ── lists ── */

export const listForCustomer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("bookings")
      .withIndex("by_customer", (q) => q.eq("customerId", userId))
      .order("desc")
      .take(50);
  },
});

/** Jobs assigned to the signed-in worker + open radar pool for their trade. */
export const listForWorker = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const me = await getMyArtisan(ctx, userId);
    if (!me) return { mine: [], radar: [] };
    const mine = await ctx.db
      .query("bookings")
      .withIndex("by_worker", (q) => q.eq("workerUserId", userId))
      .order("desc")
      .take(50);
    const all = await ctx.db.query("bookings").order("desc").take(200);
    const pending = all.filter(
      (b) =>
        b.status === "pending" &&
        b.trade === me.trade &&
        b.workerUserId === undefined,
    );
    // Emergency Quick Help sits at the top of the radar for its trade: a burst
    // main or a dead lockout should not sit behind tomorrow's repainting.
    const radar = [...pending].sort((a, b) => {
      if (a.emergency !== b.emergency) return a.emergency ? -1 : 1;
      // Swapped jobs are also surfaced ahead — someone is waiting on a re-match.
      const aSwap = a.swapRequestedAt ? 1 : 0;
      const bSwap = b.swapRequestedAt ? 1 : 0;
      if (aSwap !== bSwap) return bSwap - aSwap;
      return b.createdAt - a.createdAt;
    });
    // Flag the entries that came from this worker's own published listing so
    // the hub can mark them as their own category of work.
    const myListingIds = new Set<string>();
    for (const b of radar) {
      if (!b.customServiceId) continue;
      const listing = await ctx.db.get(b.customServiceId);
      if (listing?.userId === userId) myListingIds.add(b._id);
    }
    const flagged = [];
    for (const b of radar) {
      flagged.push({
        ...(await bookingForViewer(ctx, userId, b)),
        myListing: myListingIds.has(b._id),
      });
    }

    /**
     * Collapse shared visits into one radar entry.
     *
     * Three households splitting one visit are ONE job — one trip, one rate, one
     * worker. Listing them as three separate pending rows would have the worker
     * accept one, drive out once, and leave two calls unclaimed while the two
     * other households still show as "pending" in their own apps. The entry the
     * worker sees is therefore the whole visit, and `accept` takes all of it.
     */
    const seenGroups = new Set<string>();
    const collapsed: (typeof flagged[number] & { sharedCount?: number })[] = [];
    for (const b of flagged) {
      if (!b.groupId) {
        collapsed.push(b);
        continue;
      }
      if (seenGroups.has(b.groupId)) continue;
      seenGroups.add(b.groupId);
      const rows = await ctx.db
        .query("bookings")
        .withIndex("by_group", (q) => q.eq("groupId", b.groupId!))
        .collect();
      collapsed.push({ ...b, sharedCount: rows.length });
    }

    return { mine, radar: collapsed.slice(0, 20) };
  },
});

export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    if (!(await isAdminUser(ctx, userId))) throw new Error("Forbidden");
    // A federation admin sees their own federation's jobs, plus the unassigned
    // dispatch pool that every federation's workers accept from.
    const scope = await adminSocietyScope(ctx, userId);
    const all = await ctx.db.query("bookings").order("desc").take(200);
    const out = [];
    for (const b of all) {
      if (await bookingInScope(ctx, b, scope)) out.push(b);
    }
    return out;
  },
});

/* ── detail + chat ── */

export const getBooking = query({
  args: { id: v.id("bookings") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const b = await ctx.db.get(args.id);
    if (!b || !(await canSeeBooking(ctx, userId, b))) return null;
    return await bookingForViewer(ctx, userId, b);
  },
});

export const listMessages = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const b = await ctx.db.get(args.bookingId);
    if (!b || !(await canSeeBooking(ctx, userId, b))) return [];
    return await ctx.db
      .query("messages")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .order("asc")
      .take(200);
  },
});

export const sendMessage = mutation({
  args: { bookingId: v.id("bookings"), body: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const b = await ctx.db.get(args.bookingId);
    if (!b || !(await canSeeBooking(ctx, userId, b))) {
      throw new Error("Not allowed");
    }
    const body = args.body.trim();
    if (!body) throw new Error("Empty message");
    // Charged only after the sender is known to belong to the conversation, so
    // the budget cannot be drained by poking ids they do not own.
    await consume(ctx, "message", userId);
    const user = await ctx.db.get(userId);
    const me = await getMyArtisan(ctx, userId);
    const role =
      b.customerId === userId ? "customer" : me ? "worker" : "admin";
    await ctx.db.insert("messages", {
      bookingId: args.bookingId,
      senderId: userId,
      senderName: user?.name ?? me?.fullName ?? "Member",
      senderRole: role,
      body: body.slice(0, 1000),
      at: Date.now(),
    });
  },
});

/* ── worker lifecycle ── */

export const accept = mutation({
  args: { id: v.id("bookings") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const me = await getMyArtisan(ctx, userId);
    if (!me || !me.quizPassed || me.kycStatus !== "verified") {
      throw new Error("Verified credential required to accept jobs.");
    }
    const b = await ctx.db.get(args.id);
    if (!b) throw new Error("Booking not found");
    if (b.status !== "pending") throw new Error("No longer available");
    // The job radar only ever *shows* a worker their own trade, but that is a
    // UI convenience, not a control: the mutation is publicly callable with any
    // booking id, so the trade match has to be enforced here too or a plumber
    // could claim an electrical job simply by knowing its id.
    if (b.trade !== me.trade) {
      throw new Error("This job is not in your trade.");
    }
    // A stood-down worker cannot re-take their own job through the front door
    // while a swap is in flight; claimSwap holds the same rule.
    if (b.originalWorkerId === me._id && b.swapRequestedAt) {
      throw new Error("This job is already your job");
    }

    const patch = {
      status: "accepted",
      workerId: me._id,
      workerUserId: userId,
      workerVpa: me.upiVpa,
      acceptedAt: Date.now(),
      // Accepting resolves any swap that was still open on this job.
      swapRequestedAt: undefined,
      originalWorkerId: undefined,
    };
    await ctx.db.patch(b._id, patch);

    // A shared visit is one trip. Accepting any household of it takes the whole
    // visit, so the worker drives out once instead of once per household and no
    // payer is left stranded on a "pending" job that nobody is coming to.
    let tookHouseholds = 1;
    if (b.groupId) {
      const siblings = await ctx.db
        .query("bookings")
        .withIndex("by_group", (q) => q.eq("groupId", b.groupId!))
        .collect();
      for (const row of siblings) {
        if (row._id === b._id) continue;
        // Anything already under way means this is not a clean single visit.
        if (row.status !== "pending") continue;
        await ctx.db.patch(row._id, patch);
        tookHouseholds += 1;
      }
    }
    return tookHouseholds;
  },
});

/** Worker advances the job along the lifecycle, one stage at a time. */
export const advance = mutation({
  args: { id: v.id("bookings") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const b = await ctx.db.get(args.id);
    if (!b) throw new Error("Booking not found");
    if (b.workerUserId !== userId) throw new Error("Not your job");
    const next = NEXT_STATUS[b.status];
    if (!next) throw new Error(`Cannot advance from ${b.status}`);
    const patch: Record<string, unknown> = { status: next };
    if (next === "settled") patch.settledAt = Date.now();
    await ctx.db.patch(b._id, patch);
    return next;
  },
});

/**
 * Credit the 7% welfare share for a settled booking.
 *
 * A shared visit is ONE job that several households pay a slice of, and the
 * federation's 90/7/3 split is applied to the visit price once (see the
 * bookingGroups comment in schema.ts). Every participant row therefore carries
 * the same `welfareAmt`, because each row displays the split of the whole
 * visit — so crediting per row would pay the welfare fund N times for N
 * households. The first household to settle is the one that credits it; the
 * rest are no-ops. Derived from the data rather than a flag, so it stays
 * correct if participants join or leave.
 */
async function settlePaidBooking(ctx: MutationCtx, bookingId: Id<"bookings">) {
  const b = await ctx.db.get(bookingId);
  if (!b || !b.workerId) return;
  const w = await ctx.db.get(b.workerId);
  if (!w) return;

  if (b.groupId) {
    const siblings = await ctx.db
      .query("bookings")
      .withIndex("by_group", (q) => q.eq("groupId", b.groupId!))
      .collect();
    const alreadyCredited = siblings.some(
      (r) => r._id !== b._id && r.paidAt !== undefined,
    );
    if (alreadyCredited) return;
  }

  await ctx.db.patch(w._id, {
    welfareBalance: (w.welfareBalance ?? 0) + b.welfareAmt,
  });
}

/** Customer confirms the UPI payment by submitting the UTR reference. */
export const confirmUtr = mutation({
  args: { id: v.id("bookings"), utr: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const b = await ctx.db.get(args.id);
    if (!b) throw new Error("Booking not found");
    if (b.customerId !== userId) throw new Error("Not your booking");
    if (b.status !== "payment") throw new Error("Not awaiting payment");
    const utr = args.utr.trim();
    if (utr.length < 6) throw new Error("Enter a valid UTR / reference");
    await ctx.db.patch(b._id, {
      utr,
      paidAt: Date.now(),
      status: "completed",
      paymentMethod: "upi_manual",
    });
    // 7% welfare share accrues to the artisan's cooperative welfare ledger
    await settlePaidBooking(ctx, b._id);
  },
});

/* ── Swap Service ──
 * "Your worker isn't available? We'll find another."
 *
 * The booking is never cancelled by a swap. The customer keeps the job, the
 * original artisan simply stops being the one who will do it, and the trade's
 * job radar picks the booking back up. Cancelling would throw away the customer
 * history and the queue position for what is usually a scheduling problem, not
 * a complaint.
 */

/** How long a swap sits unclaimed before the original worker is restored. */
const SWAP_WINDOW_MS = 2 * 60 * 60; // 2 hours

export const requestSwap = mutation({
  args: { id: v.id("bookings") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await consume(ctx, "swap", userId);
    const b = await ctx.db.get(args.id);
    if (!b) throw new Error("Booking not found");
    if (b.customerId !== userId) throw new Error("Not your booking");
    if (["completed", "settled", "cancelled"].includes(b.status)) {
      throw new Error("This booking can no longer be swapped");
    }
    if (b.swapRequestedAt) throw new Error("A swap is already in progress");
    await ctx.db.patch(b._id, {
      swapRequestedAt: Date.now(),
      swapCount: (b.swapCount ?? 0) + 1,
    });
  },
});

/** The original worker hands the job back to their trade's pool. */
export const releaseForSwap = mutation({
  args: { id: v.id("bookings") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const b = await ctx.db.get(args.id);
    if (!b) throw new Error("Booking not found");
    if (b.workerUserId !== userId) throw new Error("Not your job");
    if (["completed", "settled", "cancelled"].includes(b.status)) {
      throw new Error("This job is already finished");
    }
    // Re-offered to the trade, and the standing worker is stood down. Tracked
    // as a neutral signal for the board — never a penalty. Their id is kept so
    // the job can go back to them if nobody else picks it up.
    if (b.workerId) {
      const w = await ctx.db.get(b.workerId);
      if (w) {
        await ctx.db.patch(w._id, {
          declinedSwaps: (w.declinedSwaps ?? 0) + 1,
        });
      }
    }
    await ctx.db.patch(b._id, {
      status: "pending",
      workerId: undefined,
      workerUserId: undefined,
      workerVpa: undefined,
      acceptedAt: undefined,
      originalWorkerId: b.workerId,
      swapRequestedAt: Date.now(),
    });
  },
});

/**
 * Give a swapped job back to the worker who stood down, once the swap window has
 * passed unclaimed.
 *
 * There is no cron here on purpose: the customer (or any signed-in member
 * looking at the job) triggers the check when they next load it, and the
 * mutation is a no-op unless the deadline has genuinely passed. What matters is
 * that a job can never sit in limbo with no worker and no way back.
 */
export const expireSwap = mutation({
  args: { id: v.id("bookings") },
  handler: async (ctx, args) => {
    // Any signed-in member looking at the job can trigger the check; it is a
    // no-op until the deadline genuinely passes, so authorisation is not the
    // concern here — the window is.
    await requireUser(ctx);
    const b = await ctx.db.get(args.id);
    if (!b) throw new Error("Booking not found");
    if (b.status !== "pending" || !b.swapRequestedAt) return false;
    if (Date.now() - b.swapRequestedAt < SWAP_WINDOW_MS) return false;
    if (!b.originalWorkerId) {
      // Nobody to go back to — clear the swap so the radar offers it normally.
      await ctx.db.patch(b._id, { swapRequestedAt: undefined });
      return false;
    }
    const w = await ctx.db.get(b.originalWorkerId);
    if (!w || w.removedAt || w.kycStatus !== "verified") {
      await ctx.db.patch(b._id, {
        swapRequestedAt: undefined,
        originalWorkerId: undefined,
      });
      return false;
    }
    await ctx.db.patch(b._id, {
      status: "accepted",
      workerId: w._id,
      workerUserId: w.userId,
      workerVpa: w.upiVpa,
      acceptedAt: Date.now(),
      swapRequestedAt: undefined,
      originalWorkerId: undefined,
    });
    return true;
  },
});

/** Any other verified worker of the same trade can pick a swapped job up. */
export const claimSwap = mutation({
  args: { id: v.id("bookings") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const me = await getMyArtisan(ctx, userId);
    if (!me || !me.quizPassed || me.kycStatus !== "verified") {
      throw new Error("Verified credential required to take this job.");
    }
    const b = await ctx.db.get(args.id);
    if (!b) throw new Error("Booking not found");
    if (b.status !== "pending" || !b.swapRequestedAt) {
      throw new Error("This job is not open for swap");
    }
    // Same rule as the radar: the trade gate is enforced in the mutation, not
    // trusted from the UI.
    if (b.trade !== me.trade) throw new Error("This job is not in your trade.");
    // The worker who stood down has no `workerUserId` any more, so identity is
    // checked against the remembered original — they may take the job back
    // themselves, but not by going round the front door as a stranger.
    if (b.workerUserId === userId || b.originalWorkerId === me._id) {
      throw new Error("This is already your job");
    }
    await ctx.db.patch(b._id, {
      status: "accepted",
      workerId: me._id,
      workerUserId: userId,
      workerVpa: me.upiVpa,
      acceptedAt: Date.now(),
      swapRequestedAt: undefined,
      originalWorkerId: undefined,
    });
  },
});

/* ── Emergency Quick Help ──
 * A broadcast, not a filter. An urgent request pages every verified worker of
 * that trade inside the radius, and the first to accept takes it.
 */

export const createEmergency = mutation({
  args: {
    serviceId: v.string(),
    address: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    // Tightest budget in the app. This endpoint pages real people, so it is the
    // one a script would target first.
    await consume(ctx, "emergency", userId);
    const svc = await priceService(ctx, args.serviceId);
    if (!svc) throw new Error("Unknown service");
    if (!args.address.trim()) throw new Error("Address is required");

    const workerShare = Math.round(svc.base * WORKER_SHARE_RATE);
    const welfareAmt = Math.round(svc.base * WELFARE_RATE);
    const opsAmt = svc.base - workerShare - welfareAmt;

    const bookingId = await ctx.db.insert("bookings", {
      customerId: userId,
      serviceId: args.serviceId,
      customServiceId: svc.customServiceId,
      trade: svc.trade,
      serviceName: svc.name,
      address: args.address.trim(),
      lat: args.lat,
      lng: args.lng,
      // Pinned to the top of every matching worker's radar.
      scheduledFor: Date.now(),
      urgent: true,
      emergency: true,
      notes: args.notes?.trim() || undefined,
      welfareOptIn: true,
      base: svc.base,
      hourly: svc.hourly,
      welfareAmt,
      opsAmt,
      workerShare,
      total: svc.base,
      status: "pending",
      createdAt: Date.now(),
    });
    return bookingId;
  },
});

/* ── Safety Mode ──
 * A customer preference, not an identity claim. It changes two things: which
 * workers a customer is shown, and whether the worker can see the customer's
 * address before they set off.
 */

export const setSafetyMode = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await consume(ctx, "safety", userId);
    await ctx.db.patch(userId, { safetyMode: args.enabled });
  },
});

/** Whether the signed-in customer has Safety Mode on. Defaults to off. */
export const mySafetyMode = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const user = await ctx.db.get(userId);
    return user?.safetyMode === true;
  },
});

/* ── cancellation (customer / assigned worker / admin) ── */

export const cancel = mutation({
  args: { id: v.id("bookings"), by: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const b = await ctx.db.get(args.id);
    if (!b) throw new Error("Booking not found");
    const admin = await isAdminUser(ctx, userId);
    const allowed =
      b.customerId === userId ||
      b.workerUserId === userId ||
      admin;
    if (!allowed) throw new Error("Not allowed");
    if (["completed", "settled", "cancelled"].includes(b.status)) {
      throw new Error("Booking can no longer be cancelled");
    }
    await ctx.db.patch(b._id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelBy: admin && b.customerId !== userId && b.workerUserId !== userId ? "admin" : args.by,
    });
  },
});


