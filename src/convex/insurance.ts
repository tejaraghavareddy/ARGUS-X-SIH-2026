import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { requireUser, isAdminUser } from "./identity";
import { consume } from "./rateLimit";
import { isClaimCategory, isClaimRoute, isClaimStatus } from "../lib/insurance";
import { v } from "convex/values";

/**
 * Worker accident cover — the "insurance integration" half of the welfare
 * requirement.
 *
 * What this is NOT, deliberately: an insurance product. The cooperative is not
 * an underwriter, collects no premium, and cannot adjudicate a liability
 * question. A demo that shows a "policy number" and a green "covered" tick
 * invites the obvious question — who carries the risk? — and the honest answer
 * is nobody in this codebase.
 *
 * What it IS, and is genuinely only a cooperative's to build: the federation
 * witnessed the job. It knows which member turned up, at which address, on
 * which date, under whose booking, and what was being done. When something goes
 * wrong at a customer's home, that record is exactly what an insurer or a
 * government scheme needs in order to act, and it does not exist anywhere else.
 * So the module produces a *claim* against a named cover route, and returns a
 * *forwarding receipt* once a society officer submits it onward.
 *
 * The distinction is the whole design: a claim is an assertion by the member,
 * a forwarded claim is a receipt from the cooperative, and a payout is somebody
 * else's decision that this codebase never pretends to make.
 */

// Claim categories and cover routes live in src/lib/insurance.ts so the client
// can render the same pickers the server validates against. A generated `api.*`
// reference only exposes function endpoints, so a value export here would be
// unreachable from the browser.

/** File a claim. The member describes what happened; nothing is adjudicated. */
export const raise = mutation({
  args: {
    artisanId: v.id("artisans"),
    bookingId: v.optional(v.id("bookings")),
    scheme: v.string(),
    category: v.string(),
    description: v.string(),
    claimedAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const artisan = await ctx.db.get(args.artisanId);
    if (!artisan) throw new Error("Worker not found");
    if (artisan.userId !== userId && !(await isAdminUser(ctx, userId))) {
      throw new Error("You can only file a claim for your own work");
    }
    if (!isClaimRoute(args.scheme)) throw new Error("Unknown claim route");
    if (!isClaimCategory(args.category)) {
      throw new Error("Unknown claim category");
    }
    if (args.description.trim().length < 10) {
      throw new Error("Please describe what happened in a little more detail");
    }
    if (
      args.claimedAmount !== undefined &&
      (!Number.isFinite(args.claimedAmount) || args.claimedAmount < 0)
    ) {
      throw new Error("Enter a valid amount");
    }
    // Charged after the caller is confirmed to own the artisan record, so the
    // budget cannot be drained against arbitrary artisan ids.
    await consume(ctx, "claim", userId);

    // When the claim names a booking, it must be this worker's booking. A claim
    // is only credible if it is anchored to a job the federation witnessed.
    if (args.bookingId) {
      const booking = await ctx.db.get(args.bookingId);
      if (!booking) throw new Error("Booking not found");
      if (booking.workerId !== args.artisanId) {
        throw new Error("That booking is not this worker's");
      }
    }

    const now = Date.now();
    return await ctx.db.insert("insuranceClaims", {
      artisanId: args.artisanId,
      bookingId: args.bookingId,
      scheme: args.scheme,
      category: args.category,
      description: args.description.trim(),
      claimedAmount: args.claimedAmount,
      status: "open",
      raisedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Claims the current member has filed. */
export const myClaims = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const artisan = await ctx.db
      .query("artisans")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!artisan) return [];
    return await ctx.db
      .query("insuranceClaims")
      .withIndex("by_artisan", (q) => q.eq("artisanId", artisan._id))
      .order("desc")
      .take(50);
  },
});

/** The adjudication queue for society officers. */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    if (!(await isAdminUser(ctx, userId))) throw new Error("Forbidden");
    return await ctx.db
      .query("insuranceClaims")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(200);
  },
});

/**
 * Adjudicate a claim.
 *
 * `forwarded` records that the society submitted it onward and carries a
 * receipt reference. `settled` is reserved for a decision the society itself
 * made from the welfare pool. Neither path pays anyone — that is the point.
 */
export const resolve = mutation({
  args: {
    id: v.id("insuranceClaims"),
    status: v.string(),
    forwardedTo: v.optional(v.string()),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!(await isAdminUser(ctx, userId))) throw new Error("Forbidden");
    const claim = await ctx.db.get(args.id);
    if (!claim) throw new Error("Claim not found");
    if (!isClaimStatus(args.status)) throw new Error("Unknown status");
    if (claim.status !== "open") {
      throw new Error("This claim has already been decided");
    }
    // Forwarding without naming where it went would be a receipt for nothing.
    if (args.status === "forwarded" && !args.forwardedTo?.trim()) {
      throw new Error("Record where the claim was forwarded");
    }
    await ctx.db.patch(args.id, {
      status: args.status,
      forwardedTo: args.forwardedTo?.trim() || undefined,
      reference: args.reference?.trim() || undefined,
      updatedAt: Date.now(),
    });
    return args.status;
  },
});

/**
 * Cover status for a worker, derived from their record rather than stored.
 *
 * The useful number is `welfareBalance`: the 7% accrued on every completed job
 * is the society pool a claim would actually be paid from, so showing the
 * accrued figure is more honest than a headline "insured" badge would be.
 */
export const coverStatus = query({
  args: { artisanId: v.id("artisans") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const artisan = await ctx.db.get(args.artisanId);
    if (!artisan) return null;
    const isAdmin = await isAdminUser(ctx, userId);
    if (artisan.userId !== userId && !isAdmin) return null;

    const claims = await ctx.db
      .query("insuranceClaims")
      .withIndex("by_artisan", (q) => q.eq("artisanId", args.artisanId))
      .collect();
    return {
      welfareBalance: artisan.welfareBalance ?? 0,
      openClaims: claims.filter((c) => c.status === "open").length,
      totalClaims: claims.length,
      settledClaims: claims.filter((c) => c.status === "settled").length,
    };
  },
});
