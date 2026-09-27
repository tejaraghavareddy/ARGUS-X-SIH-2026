import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { consume } from "./rateLimit";
import { adminSocietyScope, requireAdmin } from "./identity";

/**
 * Outbound forecast throttle.
 *
 * `forecastAi:runForecast` is admin-gated, but a gate is not a budget. Each run
 * is a billable call to Gemini, so without a limit one officer — or a script
 * holding a single admin token — can drain the cooperative's model allowance
 * overnight, and the failure mode is a surprise invoice rather than a visible
 * error.
 *
 * Why this is a separate mutation the page calls first, rather than a check
 * inside the action: `forecastAi.ts` is a `"use node"` module, and Convex does
 * not allow queries or mutations in a `"use node"` file. The action also cannot
 * write, so it cannot spend budget itself. This is the same client-mediated
 * shape as `authThrottle.ts`, and it carries the same honest caveat: it stops
 * the ordinary console and any script reusing this flow, but a caller invoking
 * the action endpoint directly bypasses it. A hard server-side guarantee would
 * need the budget spent inside a mutation that the action is only reachable
 * from, which the current action signature cannot express.
 *
 * The budget is keyed on the officer's FEDERATION scope, not their user id. A
 * society that hired five officers would otherwise get five budgets; a
 * cooperative whose officers share one allowance is the point of the model.
 * Super admins and the platform-level accounts share the `"all"` bucket.
 */
export const requestForecastRun = mutation({
  args: { kind: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireAdmin(ctx);
    const scope = await adminSocietyScope(ctx, userId);

    // Validate the variant before spending anything, so a malformed call
    // cannot burn budget on something the action will reject anyway.
    if (args.kind !== undefined && args.kind !== "forecast" && args.kind !== "stabilization") {
      throw new Error("Unknown forecast kind");
    }

    // `null` means an officer with no society attached, which `inSocietyScope`
    // deliberately treats as in-scope everywhere. It shares the "all" bucket
    // rather than getting a private budget of its own.
    const scoped = scope !== null && scope !== "all";
    await consume(ctx, "forecast", `society:${scope ?? "all"}`);
    return { ok: true, scope: scoped ? "society" : "all" };
  },
});
