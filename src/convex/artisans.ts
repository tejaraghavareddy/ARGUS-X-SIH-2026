import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { OWNER_EMAIL, ensureOwnerRole, requireUser } from "./identity";
import { SLOT_PARTS, type SlotPart } from "../lib/slots";
import { isValidPan, isValidGstin, isValidSac } from "./invoices";

/** Federation owner — granted admin role on first verification. */
export { OWNER_EMAIL };

const QUIZ_PASS_MARK = 60;

const requireUserId = requireUser;

async function getMyArtisanInternal(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("artisans")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

export const getMyArtisan = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await getMyArtisanInternal(ctx, userId);
  },
});

/**
 * Public federation directory used by the catalog to show real, live
 * availability ("3 verified electricians nearby · 1.2 km away").
 *
 * This query is reachable with no session at all, so it must never return
 * whole artisan documents: those carry `phone`, `idType`, `idLast4` (identity
 * document digits), `upiVpa` (the worker's payout address), cooperative
 * balances and live GPS. Only the four fields the availability maths actually
 * reads are projected out — anything a new caller needs must be added here
 * deliberately rather than inherited by accident.
 *
 * `ratingAvg`/`ratingCount` are aggregates over completed work, not identity
 * data, and the catalog needs them to sort by reputation.
 */
export const listArtisans = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("artisans").order("desc").take(200);
    // Safety Mode narrows the directory to fully verified workers for a
    // customer who asked for it. It is a filter on the same projection, not a
    // second, differently-shaped query that could drift out of sync.
    const viewerId = await getAuthUserId(ctx);
    const viewer = viewerId ? await ctx.db.get(viewerId) : null;
    const safetyMode = viewer?.safetyMode === true;

    return all
      .filter((a) => !a.removedAt)
      .filter(
        (a) =>
          !safetyMode ||
          (a.kycStatus === "verified" && a.skillStatus === "verified"),
      )
      .slice(0, 50)
      .map((a) => ({
        trade: a.trade,
        kycStatus: a.kycStatus,
        lat: a.lat,
        lng: a.lng,
        // Reputation, so the catalog can sort by it. Derived from completed
        // work only — see reviews.ts.
        ratingAvg: a.ratingAvg ?? null,
        ratingCount: a.ratingCount ?? 0,
      }));
  },
});

/* ── Public worker profiles ──
 * The statement's opening complaint is that a customer "may find it difficult to
 * choose a trustworthy worker". Verification badges alone do not answer that —
 * a household choosing between two plumbers wants to see who they are, how long
 * they have done this, and what the people who paid them said. These two queries
 * are that answer, and they are the reason reviews are worth anything.
 *
 * Both are reachable with no session, so both are deliberate projections rather
 * than whole artisan documents. Never widen them casually: `phone`, `idType`,
 * `idLast4`, `upiVpa`, the cooperative balances and live GPS must not cross this
 * boundary, and a customer's exact location is not a worker's to publish.
 */

/** Work counts per worker, tallied in a single pass over the booking table. */
async function completionCounts(ctx: QueryCtx) {
  const bookings = await ctx.db.query("bookings").collect();
  const counts = new Map<Id<"artisans">, number>();
  for (const b of bookings) {
    if (!b.workerId) continue;
    if (b.status !== "completed" && b.status !== "settled") continue;
    counts.set(b.workerId, (counts.get(b.workerId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Browsable worker directory: who is available, in what trade, and how they are
 * rated. Sorted best-rated-first among the workers who can actually be booked,
 * because an unrated listing is not yet evidence of anything.
 */
export const publicDirectory = query({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("artisans").order("desc").take(200);
    const completed = await completionCounts(ctx);
    const viewerId = await getAuthUserId(ctx);
    const viewer = viewerId ? await ctx.db.get(viewerId) : null;
    const safetyMode = viewer?.safetyMode === true;

    return all
      .filter((a) => !a.removedAt)
      .filter((a) => (args.trade ? a.trade === args.trade : true))
      .filter(
        (a) =>
          !safetyMode ||
          (a.kycStatus === "verified" && a.skillStatus === "verified"),
      )
      // Only workers who can legally take a job: a KYC-checked, quiz-passed
      // artisan. Listing anyone else would be offering a choice that will fail
      // at accept time.
      .filter((a) => a.kycStatus === "verified" && a.quizPassed)
      .map((a) => ({
        _id: a._id,
        fullName: a.fullName,
        trade: a.trade,
        district: a.district,
        state: a.state,
        experienceYears: a.experienceYears,
        kycStatus: a.kycStatus,
        skillStatus: a.skillStatus ?? "pending",
        // When this worker is actually around, so the catalog can say more than
        // "online". A bitmask over the coming week — see lib/slots.ts.
        slots: a.slots ?? 0,
        ratingAvg: a.ratingAvg ?? null,
        ratingCount: a.ratingCount ?? 0,
        completedJobs: completed.get(a._id) ?? 0,
        isOnline: a.isOnline,
      }))
      .sort(
        (x, y) =>
          y.ratingAvg! - x.ratingAvg! ||
          y.ratingCount - x.ratingCount ||
          Number(y.isOnline) - Number(x.isOnline),
      )
      .slice(0, 40);
  },
});

/** One worker's public profile, with the aggregates a customer weighs. */
export const profile = query({
  args: { id: v.id("artisans") },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.id);
    if (!a || a.removedAt) return null;
    const completed = await completionCounts(ctx);
    const listings = await ctx.db
      .query("customServices")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();

    return {
      _id: a._id,
      fullName: a.fullName,
      trade: a.trade,
      district: a.district,
      state: a.state,
      experienceYears: a.experienceYears,
      slots: a.slots ?? 0,
      credentialId: a.credentialId ?? null,
      kycStatus: a.kycStatus,
      kycVerifiedAt: a.kycVerifiedAt ?? null,
      skillStatus: a.skillStatus ?? "pending",
      skillVerifiedAt: a.skillVerifiedAt ?? null,
      ratingAvg: a.ratingAvg ?? null,
      ratingCount: a.ratingCount ?? 0,
      completedJobs: completed.get(a._id) ?? 0,
      isOnline: a.isOnline,
      // What this worker actually publishes — the public face of their craft.
      // Excludes anything still sitting in the board's review queue.
      listings: listings
        .filter((l) => l.artisanId === a._id)
        .map((l) => ({
          _id: l._id,
          name: l.name,
          description: l.description,
          category: l.category,
          base: l.base,
          hourly: l.hourly,
          urgent: l.urgent,
        })),
    };
  },
});

export const federationStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("artisans").collect();
    const artisans = all.filter((a) => !a.removedAt);
    const byTrade: Record<string, number> = {};
    let online = 0;
    let verified = 0;
    for (const a of artisans) {
      byTrade[a.trade] = (byTrade[a.trade] ?? 0) + 1;
      if (a.isOnline) online += 1;
      if (a.kycStatus === "verified") verified += 1;
    }
    return { total: artisans.length, online, verified, byTrade };
  },
});

export const saveProfile = mutation({
  args: {
    fullName: v.string(),
    phone: v.string(),
    trade: v.string(),
    district: v.string(),
    state: v.string(),
    societyId: v.string(),
    experienceYears: v.number(),
    dailyRate: v.number(),
    upiVpa: v.optional(v.string()),
    idType: v.string(),
    idNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await ensureOwnerRole(ctx, userId);

    if (args.idNumber.replace(/\D/g, "").length < 4) {
      throw new Error("Enter a valid ID number (min 4 digits).");
    }

    const existing = await getMyArtisanInternal(ctx, userId);
    const now = Date.now();

    const fields = {
      fullName: args.fullName.trim(),
      phone: args.phone.trim(),
      trade: args.trade,
      district: args.district,
      state: args.state,
      societyId: args.societyId,
      experienceYears: args.experienceYears,
      dailyRate: args.dailyRate,
      upiVpa: args.upiVpa?.trim() || undefined,
      idType: args.idType,
      idLast4: args.idNumber.replace(/\D/g, "").slice(-4),
      kycStatus: "pending" as const,
    };

    if (existing) {
      // Credential is immutable: preserve any issued credential fields.
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("artisans", {
      userId,
      ...fields,
      quizPassed: false,
      isOnline: false,
      welfareBalance: 0,
      dividendBalance: 0,
      createdAt: now,
    });
  },
});

export const submitQuiz = mutation({
  args: { score: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const artisan = await getMyArtisanInternal(ctx, userId);
    if (!artisan) throw new Error("Complete your trade profile first.");
    // Idempotent: a double-submit or stale retry after the credential was
    // already issued resolves to the existing credential — never an error.
    if (artisan.quizPassed && artisan.credentialId) {
      return { ok: true, alreadyIssued: true, credentialId: artisan.credentialId };
    }
    if (args.score < QUIZ_PASS_MARK) {
      await ctx.db.patch(artisan._id, {
        quizScore: args.score,
        quizTakenAt: Date.now(),
      });
      // Below-pass is a normal re-attempt outcome, not a server error:
      // return it as data so the client never logs CONVEX Server Error.
      return {
        ok: false as const,
        score: args.score,
        passMark: QUIZ_PASS_MARK,
        message: `Score ${args.score}% is below the ${QUIZ_PASS_MARK}% pass mark. Please re-attempt — you can retake the quiz.`,
      };
    }

    const now = Date.now();
    const year = new Date(now).getFullYear();
    const rand = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .toUpperCase()
      .padStart(4, "0");
    const credentialId = `SSC-${year}-${rand}`;

    await ctx.db.patch(artisan._id, {
      quizScore: args.score,
      quizTakenAt: now,
      quizPassed: true,
      credentialId,
      credentialIssuedAt: now,
    });
    return { ok: true as const, credentialId };
  },
});

/**
 * Set a worker's availability for the coming week.
 *
 * Whole-week replacement rather than a per-slot toggle, so the payload is
 * unambiguous and there is no way to accumulate orphaned bits. A day-index /
 * part-of-day pair is `(day * 3) + part`, so the whole week is 21 bits.
 */
export const setSlots = mutation({
  args: {
    day: v.number(),
    part: v.string(),
    on: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const artisan = await getMyArtisanInternal(ctx, userId);
    if (!artisan) throw new Error("Complete onboarding first.");
    if (!Number.isInteger(args.day) || args.day < 0 || args.day >= 7) {
      throw new Error("Invalid day");
    }
    const partIndex = SLOT_PARTS.indexOf(args.part as SlotPart);
    if (partIndex < 0) throw new Error("Invalid part of day");
    const bit = 1 << (args.day * SLOT_PARTS.length + partIndex);
    const next = args.on
      ? (artisan.slots ?? 0) | bit
      : (artisan.slots ?? 0) & ~bit;
    await ctx.db.patch(artisan._id, { slots: next });
  },
});

/**
 * Record the worker's tax identity for invoicing.
 *
 * Optional and self-declared: most members are unregistered and never set
 * these. The formats are checked because a malformed identifier printed on a
 * receipt is worse than none — it invites a rejection at the counter. Nothing
 * here is verified against a government registry, and the UI does not claim it
 * is: it stops typos, not fraud.
 *
 * Deliberately separate from onboarding. Tax identity is not an access gate,
 * so a worker without a PAN can still verify, take jobs and be paid.
 */
export const setTaxIdentity = mutation({
  args: {
    pan: v.optional(v.string()),
    gstin: v.optional(v.string()),
    sacCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const artisan = await getMyArtisanInternal(ctx, userId);
    if (!artisan) throw new Error("Complete onboarding first.");

    // Uppercase and strip spaces: PAN and GSTIN are case-insensitive in the
    // wild, and a member typing "abcde1234f" should not be told it is invalid.
    const pan = args.pan?.trim().toUpperCase().replace(/\s/g, "") || undefined;
    const gstin = args.gstin?.trim().toUpperCase().replace(/\s/g, "") || undefined;
    const sacCode = args.sacCode?.trim() || undefined;

    if (!isValidPan(pan)) throw new Error("Enter a valid PAN, e.g. ABCDE1234F");
    if (!isValidGstin(gstin)) throw new Error("Enter a valid 15-character GSTIN");
    if (!isValidSac(sacCode)) throw new Error("Enter a valid 6-digit SAC code");

    await ctx.db.patch(artisan._id, { pan, gstin, sacCode });
    return { pan, gstin, sacCode };
  },
});

export const setPresence = mutation({
  args: {
    isOnline: v.boolean(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const artisan = await getMyArtisanInternal(ctx, userId);
    if (!artisan) throw new Error("Complete onboarding first.");
    await ctx.db.patch(artisan._id, {
      isOnline: args.isOnline,
      ...(args.lat !== undefined && args.lng !== undefined
        ? { lat: args.lat, lng: args.lng }
        : {}),
      telemetryAt: Date.now(),
    });
  },
});
