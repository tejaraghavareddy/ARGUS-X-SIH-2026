import { internalQuery, internalMutation } from "./_generated/server";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
/**
 * Fixed-window rate limiting for the operations that cost money or send
 * messages.
 *
 * Convex has no built-in per-caller throttle, and several endpoints here are
 * abusable: booking creation writes a row and broadcasts onto the job radar,
 * chat inserts are unbounded, and every sign-in attempt triggers an outbound
 * email through a paid provider. Without a limit, one script can flood the
 * radar, the inbox of an arbitrary third party, or the cooperative's data.
 *
 * Design notes:
 *  - State is per (scope, subject), never global. A single shared counter would
 *    let anyone exhaust the budget and lock out every real user at once.
 *  - The window is fixed rather than sliding so one row per key is enough and
 *    the table stays small.
 *  - Callers that legitimately retry (a member re-sending a code after a typo)
 *    stay well under the limits below.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Limits applied across the app. Tuned to be generous for honest use. */
export const LIMITS = {
  /** Sign-in codes: a person may fumble their address a few times. */
  otp: { max: 5, windowMs: 15 * MINUTE },
  /** Job creation — each one is a real dispatch to a real worker. */
  booking: { max: 10, windowMs: HOUR },
  /** Chat messages within a single booking conversation. */
  message: { max: 40, windowMs: 10 * MINUTE },
  /** Publishing a work listing. */
  listing: { max: 10, windowMs: HOUR },
  /** Raising a dispute on the same booking. */
  dispute: { max: 5, windowMs: DAY },
  /** Joining or opening a shared ("group") booking. */
  group: { max: 5, windowMs: HOUR },
  /** Emergency Quick Help broadcasts. Deliberately tight: this is the endpoint
   *  that pages real workers, so a script here is a cost to the cooperative and
   *  a nuisance to every verified tradesperson in the district. */
  emergency: { max: 3, windowMs: HOUR },
  /** Writing a customer review. */
  review: { max: 10, windowMs: HOUR },
  /** Swap Service — asking for a different worker. */
  swap: { max: 5, windowMs: HOUR },
  /** Turning Safety Mode on or off. */
  safety: { max: 10, windowMs: DAY },
  /** Running a demand forecast. Admin-gated, but a gate is not a budget: each
   *  run is a billable Gemini call, so without a limit a single officer (or a
   *  script holding one admin token) can drain the cooperative's model
   *  allowance overnight. Keyed per FEDERATION rather than per user, so a
   *  society cannot multiply its budget by adding officers. */
  forecast: { max: 6, windowMs: HOUR },
} as const;

export type RateLimitScope = keyof typeof LIMITS;

/**
 * A stable, non-reversible subject for a rate-limit key. Emails are hashed so
 * the rate-limit table never becomes a second, less-protected copy of the
 * member list. `userId` values are already opaque document ids and are used
 * as-is by the callers that pass them.
 */
export function otpSubject(email: string): string {
  // FNV-1a, 32-bit, twice with different offsets to widen the output.
  const h = (s: string, seed: number) => {
    let x = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return x >>> 0;
  };
  const normalized = email.trim().toLowerCase();
  return `${h(normalized, 0x811c9dc5).toString(36)}${h(normalized, 0x1000193)
    .toString(36)}`;
}

function limitOf(scope: RateLimitScope) {
  return LIMITS[scope];
}

/** Compose the storage key for a scope + subject pair. */
export function rateLimitKey(scope: RateLimitScope, subject: string): string {
  return `${scope}:${subject}`;
}

/**
 * Read a key's current window without mutating it. Used by the OTP provider to
 * refuse an over-limit send, and by tests.
 */
export const peek = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row) return { count: 0, windowStart: 0 };
    return { count: row.count, windowStart: row.windowStart };
  },
});

/**
 * Consume one unit of `scope` for `subject`, throwing when the budget for the
 * current window is already spent. Call this at the top of a mutation, before
 * any real work, so a rejected call costs nothing.
 */
export async function consume(
  ctx: MutationCtx,
  scope: RateLimitScope,
  subject: string,
): Promise<void> {
  const { max, windowMs } = limitOf(scope);
  const key = rateLimitKey(scope, subject);
  const now = Date.now();

  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  // No row, or the previous window has expired: start a fresh window.
  if (!row || now - row.windowStart >= windowMs) {
    if (row) {
      await ctx.db.patch(row._id, { count: 1, windowStart: now, updatedAt: now });
    } else {
      await ctx.db.insert("rateLimits", {
        key,
        count: 1,
        windowStart: now,
        updatedAt: now,
      });
    }
    return;
  }

  if (row.count >= max) {
    const retryInMs = windowMs - (now - row.windowStart);
    const mins = Math.max(1, Math.ceil(retryInMs / MINUTE));
    throw new Error(`Too many attempts. Please try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }

  await ctx.db.patch(row._id, { count: row.count + 1, updatedAt: now });
}

/**
 * Read-only form of {@link consume} for callers outside a mutation (the OTP
 * provider runs in an action). Returns whether the send would be allowed.
 */
export async function isBlocked(
  ctx: QueryCtx,
  scope: RateLimitScope,
  subject: string,
): Promise<boolean> {
  const { max, windowMs } = limitOf(scope);
  const key = rateLimitKey(scope, subject);
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (!row) return false;
  if (now - row.windowStart >= windowMs) return false;
  return row.count >= max;
}

/**
 * Increment a key's counter from an action, which cannot write directly.
 * Only the internal (non-public) function above may call it, and the caller is
 * expected to have already consulted {@link isBlocked}.
 */
export const record = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row) {
      await ctx.db.insert("rateLimits", {
        key: args.key,
        count: 1,
        windowStart: now,
        updatedAt: now,
      });
      return;
    }
    await ctx.db.patch(row._id, { count: row.count + 1, updatedAt: now });
  },
});
