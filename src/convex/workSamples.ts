import { query, mutation, MutationCtx } from "./_generated/server";
import {
  adminSocietyScope,
  inSocietyScope,
  isAdminUser,
  requireUser,
} from "./identity";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const MAX_SAMPLES = 6;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per image

async function notify(
  ctx: MutationCtx,
  userId: Id<"users">,
  kind: string,
  title: string,
  body: string,
) {
  await ctx.db.insert("notifications", {
    userId,
    kind,
    title,
    body,
    createdAt: Date.now(),
  });
}

/* ── worker: request an upload URL ── */

/** Generate a short-lived upload URL for a work-sample image. */
export const generateUploadUrl = mutation({
  args: { mimeType: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!allowed.includes(args.mimeType)) {
      throw new Error("Only JPG, PNG, WebP or HEIC images are allowed");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/** Register an uploaded image as a pending work sample for review. */
export const completeUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    mimeType: v.string(),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);

    const artisan = await ctx.db
      .query("artisans")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!artisan) throw new Error("Complete your trade profile first.");
    if (artisan.removedAt) throw new Error("This account was removed from the federation");

    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) throw new Error("Upload not found — please retry");
    if (meta.size > MAX_BYTES) throw new Error("Image is larger than 5 MB");

    const existing = await ctx.db
      .query("workSamples")
      .withIndex("by_artisan", (q) => q.eq("artisanId", artisan._id))
      .collect();
    // Only samples that still hold a picture count against the quota: a
    // verified sample keeps its row (the verdict) but its image is released,
    // so it must not permanently consume one of the worker's six slots.
    const holdingImages = existing.filter((r) => r.storageId !== undefined);
    if (holdingImages.length >= MAX_SAMPLES) {
      throw new Error(`You can upload up to ${MAX_SAMPLES} work photos`);
    }

    const id = await ctx.db.insert("workSamples", {
      artisanId: artisan._id,
      userId,
      storageId: args.storageId,
      mimeType: args.mimeType,
      caption: args.caption?.trim() || undefined,
      status: "pending",
      uploadedAt: Date.now(),
    });
    return id;
  },
});

/** Delete one of my own pending samples (not reviewed ones). */
export const deleteSample = mutation({
  args: { sampleId: v.id("workSamples") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const sample = await ctx.db.get(args.sampleId);
    if (!sample) throw new Error("Sample not found");
    if (sample.userId !== userId) throw new Error("Forbidden");
    if (sample.status !== "pending") throw new Error("Reviewed samples cannot be deleted");
    if (!sample.storageId) throw new Error("This sample no longer has a stored image");

    await ctx.storage.delete(sample.storageId);
    await ctx.db.delete(args.sampleId);
  },
});

/** My samples with playable URLs. */
export const mySamples = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const artisan = await ctx.db
      .query("artisans")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!artisan) return [];
    const rows = await ctx.db
      .query("workSamples")
      .withIndex("by_artisan", (q) => q.eq("artisanId", artisan._id))
      .collect();
    const withUrls = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        // A released sample has no picture left to serve; the verdict text
        // replaces it, so `url` is null rather than a broken image.
        url: r.storageId ? await ctx.storage.getUrl(r.storageId) : null,
        hasImage: r.storageId !== undefined,
      })),
    );
    return withUrls.sort((a, b) => b.uploadedAt - a.uploadedAt);
  },
});

/* ── admin: review queue + verdict ── */

/** All samples pending board review, with worker details and URLs. */
export const reviewQueue = query({
  args: {},
  handler: async (ctx) => {
    const adminId = await requireUser(ctx);
    if (!(await isAdminUser(ctx, adminId))) throw new Error("Forbidden");

    const rows = await ctx.db
      .query("workSamples")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const artisanCache = new Map<string, Doc<"artisans">>();
    const artisans = await ctx.db.query("artisans").collect();
    for (const a of artisans) artisanCache.set(a._id, a);

    // A federation admin verifies only their own federation's workers.
    const scope = await adminSocietyScope(ctx, adminId);
    const inScope = inSocietyScope(scope);

    const out = await Promise.all(
      rows
        .filter((r) => {
          const artisan = artisanCache.get(r.artisanId);
          return artisan ? inScope(artisan) : false;
        })
        .map(async (r) => {
        const artisan = artisanCache.get(r.artisanId);
        return {
          _id: r._id,
          // Only pending samples reach the queue, and a pending sample always
          // still has its picture (a released one is approved, never pending).
          url: r.storageId ? await ctx.storage.getUrl(r.storageId) : null,
          mimeType: r.mimeType,
          caption: r.caption,
          uploadedAt: r.uploadedAt,
          artisanId: r.artisanId,
          userId: r.userId,
          fullName: artisan?.fullName ?? "Unknown",
          trade: artisan?.trade ?? "—",
          district: artisan?.district ?? "—",
          phone: artisan?.phone ?? "—",
          kycStatus: artisan?.kycStatus ?? "pending",
        };
      }),
    );
    return out.sort((a, b) => a.uploadedAt - b.uploadedAt);
  },
});

/**
 * Board verdict on one sample. When the decision is an approval AND the
 * worker's KYC is verified, both skill verification and KYC are set to
 * "verified" and the cooperative trade credential is issued.
 * A rejection records the reason and notifies the worker to re-upload.
 *
 * APPROVED SAMPLES RELEASE THEIR IMAGE. The board has seen the evidence and
 * recorded the decision; a worker photo of their work, tools, premises or
 * face is personal data that has no reason to be retained afterwards. So the
 * file is deleted from storage and a written verdict takes its place. The row
 * is kept, because the verdict IS the audit trail.
 */
export const reviewSample = mutation({
  args: {
    sampleId: v.id("workSamples"),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const adminId = await requireUser(ctx);
    if (!(await isAdminUser(ctx, adminId))) throw new Error("Forbidden");

    const sample = await ctx.db.get(args.sampleId);
    if (!sample) throw new Error("Sample not found");
    if (sample.status !== "pending") throw new Error("Sample already reviewed");

    const artisan = await ctx.db.get(sample.artisanId);
    if (!artisan) throw new Error("Worker profile not found");
    // Verification is a federation-level act: a scoped admin cannot issue
    // another federation's trade credential.
    if (!inSocietyScope(await adminSocietyScope(ctx, adminId))(artisan)) {
      throw new Error("Not in your federation");
    }

    const now = Date.now();

    // Release the picture on ANY ruling, not just an approval. A rejection is
    // exactly as personal as an approval — arguably more so, since the worker
    // is being turned away and the photo of the work that failed them is the
    // last thing that should outlive the decision. The board's written verdict
    // is the record; the photograph is not.
    //
    // Never let a storage hiccup cost the worker their verdict: if the delete
    // fails the row keeps its storageId (so the file is still visible and
    // `sweepUnpurgedImages` can retry it) and the verdict stands either way.
    let release: { storageId: undefined; imagePurgedAt: number; verdictText: string } | null =
      null;
    if (sample.storageId) {
      try {
        await ctx.storage.delete(sample.storageId);
        const note = args.note?.trim();
        const date = new Date(now).toLocaleDateString("en-IN");
        const outcome = args.approve
          ? `Work evidence verified by the federation board on ${date}.`
          : `Work evidence was not verified by the federation board on ${date}.`;
        release = {
          storageId: undefined,
          imagePurgedAt: now,
          verdictText:
            outcome +
            (note ? ` Board note: ${note}` : "") +
            " The photo was released after review and is no longer stored.",
        };
      } catch {
        release = null; // image stays on file; the verdict is unaffected
      }
    }

    await ctx.db.patch(sample._id, {
      status: args.approve ? "approved" : "rejected",
      reviewedBy: adminId,
      reviewedAt: now,
      reviewNote: args.note?.trim() || undefined,
      ...(release ?? {}),
    });

    if (args.approve) {
      const skillRef = `SKC-${now.toString(36).toUpperCase().slice(-8)}`;
      const patch: Record<string, unknown> = {
        skillStatus: "verified",
        skillVerifiedAt: now,
        skillRef,
      };
      // Board approval of real work evidence satisfies both verifications.
      if (artisan.kycStatus === "verified") {
        if (!artisan.quizPassed) {
          const rand = Math.floor(Math.random() * 0xffff)
            .toString(16)
            .toUpperCase()
            .padStart(4, "0");
          patch.quizPassed = true;
          patch.credentialId = `SSC-${new Date(now).getFullYear()}-${rand}`;
          patch.credentialIssuedAt = now;
        }
      }
      await ctx.db.patch(artisan._id, patch);
      await notify(
        ctx,
        artisan.userId,
        "worker_added",
        "Skill verification approved",
        `The federation board verified your work evidence${artisan.kycStatus === "verified" ? " — your skill verification and KYC are both VERIFIED and your trade credential is issued. You can now accept jobs." : ". Your skill verification is complete — finish KYC approval to accept jobs."}`,
      );
      return { skillVerified: true };
    }

    await notify(
      ctx,
      artisan.userId,
      "worker_removed",
      "Work sample needs another attempt",
      `The board could not verify this work sample. Reason: ${args.note?.trim() || "unclear evidence"}. Please upload clearer photos of your work (tools in use, finished jobs, you at work) and resubmit. The photo you submitted has been released and is no longer stored.`,
    );
    return { skillVerified: false };
  },
});

/**
 * Retry the image purge for samples that were ruled on but whose storage delete
 * failed at the time.
 *
 * `reviewSample` treats a storage failure as non-fatal — the verdict is
 * recorded and the row keeps its `storageId` so the file is not orphaned
 * invisibly. That is the right trade-off at review time (a transient storage
 * error must not cost a worker their decision), but it does leave a gap: the
 * image outlives the ruling until something comes back for it. This is that
 * something.
 *
 * Rows this touches are exactly the ones where a decision exists and an image
 * does not need to: `status` is `approved` or `rejected`, `reviewedAt` is set,
 * and a `storageId` is still attached. A pending sample is never touched —
 * the worker still needs to see their own upload.
 *
 * Officers only. Each failure is counted and reported rather than thrown, so
 * one stubborn file does not abort the sweep and leave the rest unretried.
 */
export const sweepUnpurgedImages = mutation({
  args: {},
  handler: async (ctx): Promise<{ swept: number; failed: number }> => {
    const adminId = await requireUser(ctx);
    if (!(await isAdminUser(ctx, adminId))) throw new Error("Forbidden");

    const reviewed = await ctx.db
      .query("workSamples")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();
    const rejected = await ctx.db
      .query("workSamples")
      .withIndex("by_status", (q) => q.eq("status", "rejected"))
      .collect();

    let swept = 0;
    let failed = 0;
    for (const sample of [...reviewed, ...rejected]) {
      if (!sample.storageId || !sample.reviewedAt) continue;
      try {
        await ctx.storage.delete(sample.storageId);
        await ctx.db.patch(sample._id, {
          storageId: undefined,
          imagePurgedAt: Date.now(),
        });
        swept += 1;
      } catch {
        failed += 1;
      }
    }
    return { swept, failed };
  },
});

/** Admin: approve/reject a worker's KYC directly from the skill review tab. */
export const reviewKycFromSkillTab = mutation({
  args: {
    artisanId: v.id("artisans"),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const adminId = await requireUser(ctx);
    if (!(await isAdminUser(ctx, adminId))) throw new Error("Forbidden");

    const artisan = await ctx.db.get(args.artisanId);
    if (!artisan) throw new Error("Worker not found");
    if (!inSocietyScope(await adminSocietyScope(ctx, adminId))(artisan)) {
      throw new Error("Not in your federation");
    }
    if (artisan.kycStatus !== "pending") throw new Error("KYC is not pending");

    const now = Date.now();
    if (args.approve) {
      const kycRef = `BGC-${now.toString(36).toUpperCase().slice(-8)}`;
      await ctx.db.patch(artisan._id, {
        kycStatus: "verified",
        kycVerifiedAt: now,
        kycRef,
      });
      await notify(
        ctx,
        artisan.userId,
        "worker_added",
        "KYC verification approved",
        "Your identity verification is approved by the federation board. Complete skill verification (upload work photos) to receive your credential and accept jobs.",
      );
    } else {
      await ctx.db.patch(artisan._id, {
        kycStatus: "rejected",
      });
      await notify(
        ctx,
        artisan.userId,
        "worker_removed",
        "KYC verification declined",
        `Your identity verification was declined. Reason: ${args.note?.trim() || "documents unclear"}. Update your ID details and resubmit from onboarding.`,
      );
    }
  },
});
