import { describe, expect, it } from "vitest";
import {
  api,
  must,
  seedAdmin,
  seedArtisan,
  seedCustomer,
  seedWorker,
  setupTest,
} from "./convexHarness";

/** Insert a fake storage file the way `generateUploadUrl` + PUT would. */
async function seedStorageFile(t: ReturnType<typeof setupTest>, size = 1000) {
  return t.run(async (ctx) => ctx.storage.store(new Blob([new Uint8Array(size).fill(7)])));
}

describe("workSamples:generateUploadUrl", () => {
  it("refuses a signed-out caller", async () => {
    const t = setupTest();
    await expect(
      t.mutation(api.workSamples.generateUploadUrl, { mimeType: "image/png" }),
    ).rejects.toThrow("Not authenticated");
  });

  it("accepts the supported image types", async () => {
    const t = setupTest();
    const { as } = await seedWorker(t);
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
      await expect(as.mutation(api.workSamples.generateUploadUrl, { mimeType })).resolves.toBeTypeOf(
        "string",
      );
    }
  });

  it("rejects anything that is not an image", async () => {
    const t = setupTest();
    const { as } = await seedWorker(t);
    for (const mimeType of ["application/pdf", "text/html", "image/svg+xml", "video/mp4"]) {
      await expect(
        as.mutation(api.workSamples.generateUploadUrl, { mimeType }),
      ).rejects.toThrow("Only JPG, PNG, WebP or HEIC");
    }
  });
});

describe("workSamples:completeUpload", () => {
  it("refuses a signed-out caller", async () => {
    const t = setupTest();
    const storageId = await seedStorageFile(t);
    await expect(
      t.mutation(api.workSamples.completeUpload, { storageId, mimeType: "image/png" }),
    ).rejects.toThrow("Not authenticated");
  });

  it("asks the worker to finish the trade profile first", async () => {
    const t = setupTest();
    const { as } = await seedWorker(t);
    const storageId = await seedStorageFile(t);
    await expect(
      as.mutation(api.workSamples.completeUpload, { storageId, mimeType: "image/png" }),
    ).rejects.toThrow("Complete your trade profile first");
  });

  it("refuses uploads from a worker removed from the federation", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    await seedArtisan(t, w.id, { removedAt: Date.now() });
    const storageId = await seedStorageFile(t);
    await expect(
      w.as.mutation(api.workSamples.completeUpload, { storageId, mimeType: "image/png" }),
    ).rejects.toThrow("removed from the federation");
  });

  it("refuses a storage id that was never uploaded", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    const storageId = await seedStorageFile(t);
    await t.run((ctx) => ctx.storage.delete(storageId));
    await expect(
      w.as.mutation(api.workSamples.completeUpload, { storageId, mimeType: "image/png" }),
    ).rejects.toThrow("Upload not found");
  });

  it("refuses images over 5 MB", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    const storageId = await seedStorageFile(t, 5 * 1024 * 1024 + 1);
    await expect(
      w.as.mutation(api.workSamples.completeUpload, { storageId, mimeType: "image/png" }),
    ).rejects.toThrow("larger than 5 MB");
  });

  it("caps the gallery at 6 photos", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    for (let i = 0; i < 6; i++) {
      const storageId = await seedStorageFile(t);
      await w.as.mutation(api.workSamples.completeUpload, {
        storageId,
        mimeType: "image/png",
        caption: `sample ${i}`,
      });
    }
    const extra = await seedStorageFile(t);
    await expect(
      w.as.mutation(api.workSamples.completeUpload, { storageId: extra, mimeType: "image/png" }),
    ).rejects.toThrow("up to 6 work photos");
  });

  it("registers a pending sample and lists it newest first with a URL", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const artisan = await seedArtisan(t, w.id);
    const storageId = await seedStorageFile(t);

    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId,
      mimeType: "image/png",
      caption: "  rewiring a panel  ",
    });
    const row = must(await t.run((ctx) => ctx.db.get(sampleId)), "sample");
    expect(row.artisanId).toBe(artisan);
    expect(row.userId).toBe(w.id);
    expect(row.status).toBe("pending");
    expect(row.caption).toBe("rewiring a panel");

    const mine = await w.as.query(api.workSamples.mySamples);
    expect(mine).toHaveLength(1);
    expect(mine[0].url).toBeTypeOf("string");
  });

  it("mySamples is empty for a member who is not a worker", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    expect(await c.as.query(api.workSamples.mySamples)).toEqual([]);
  });
});

describe("workSamples:deleteSample", () => {
  it("refuses a signed-out caller and another worker's sample", async () => {
    const t = setupTest();
    const w1 = await seedWorker(t, { email: "w1@x.com" });
    const w2 = await seedWorker(t, { email: "w2@x.com" });
    await seedArtisan(t, w1.id);
    await seedArtisan(t, w2.id);
    const sampleId = await w1.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/png",
    });

    await expect(
      t.mutation(api.workSamples.deleteSample, { sampleId }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      w2.as.mutation(api.workSamples.deleteSample, { sampleId }),
    ).rejects.toThrow("Forbidden");
  });

  it("deletes a pending sample and its stored file", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    const storageId = await seedStorageFile(t);
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId,
      mimeType: "image/png",
    });

    await w.as.mutation(api.workSamples.deleteSample, { sampleId });
    expect(await t.run((ctx) => ctx.db.get(sampleId))).toBeNull();
    expect(await w.as.query(api.workSamples.mySamples)).toEqual([]);
  });

  it("refuses to delete a sample the board already reviewed", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id, { kycStatus: "pending" });
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/png",
    });
    await a.as.mutation(api.workSamples.reviewSample, { sampleId, approve: false });

    await expect(
      w.as.mutation(api.workSamples.deleteSample, { sampleId }),
    ).rejects.toThrow("cannot be deleted");
  });
});

describe("workSamples:reviewQueue", () => {
  it("is admin-only", async () => {
    const t = setupTest();
    await expect(t.query(api.workSamples.reviewQueue)).rejects.toThrow("Not authenticated");
    const c = await seedCustomer(t);
    await expect(c.as.query(api.workSamples.reviewQueue)).rejects.toThrow("Forbidden");
  });

  it("lists pending samples oldest first with worker details", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id, {
      fullName: "Ramesh",
      trade: "electrician",
      district: "Kurnool",
      phone: "9000000000",
      kycStatus: "pending",
    });
    const first = await w.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/png",
      caption: "old",
    });
    const second = await w.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/jpeg",
      caption: "new",
    });

    const queue = await a.as.query(api.workSamples.reviewQueue);
    expect(queue.map((q) => q._id)).toEqual([first, second]);
    expect(queue[0].fullName).toBe("Ramesh");
    expect(queue[0].trade).toBe("electrician");
    expect(queue[0].district).toBe("Kurnool");
    expect(queue[0].kycStatus).toBe("pending");
    expect(queue[0].url).toBeTypeOf("string");
  });

  it("drops a sample from the queue once reviewed", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/png",
    });
    await a.as.mutation(api.workSamples.reviewSample, { sampleId, approve: true });
    expect(await a.as.query(api.workSamples.reviewQueue)).toEqual([]);
  });
});

describe("workSamples:reviewSample", () => {
  it("is admin-only", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/png",
    });
    await expect(
      c.as.mutation(api.workSamples.reviewSample, { sampleId, approve: true }),
    ).rejects.toThrow("Forbidden");
  });

  it("refuses to review the same sample twice", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/png",
    });
    await a.as.mutation(api.workSamples.reviewSample, { sampleId, approve: true });
    await expect(
      a.as.mutation(api.workSamples.reviewSample, { sampleId, approve: true }),
    ).rejects.toThrow("already reviewed");
  });

  it("approving with KYC verified sets skill + KYC verified and issues the credential", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    const artisan = await seedArtisan(t, w.id, {
      kycStatus: "verified",
      quizPassed: false,
    });
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/png",
    });

    expect(await a.as.mutation(api.workSamples.reviewSample, { sampleId, approve: true })).toEqual({
      skillVerified: true,
    });

    const row = must(await t.run((ctx) => ctx.db.get(artisan)), "artisan");
    expect(row.skillStatus).toBe("verified");
    expect(row.skillVerifiedAt).toBeGreaterThan(0);
    expect(row.skillRef).toMatch(/^SKC-/);
    expect(row.kycStatus).toBe("verified");
    expect(row.quizPassed).toBe(true);
    expect(row.credentialId).toMatch(/^SSC-\d{4}-[0-9A-F]{4}$/);

    const notices = await w.as.query(api.workerAdmin.myNotifications);
    expect(notices[0].body).toContain("VERIFIED");
  });

  it("approving with KYC still pending verifies skill only", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    const artisan = await seedArtisan(t, w.id, { kycStatus: "pending", quizPassed: false });
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/png",
    });

    await a.as.mutation(api.workSamples.reviewSample, { sampleId, approve: true });
    const row = must(await t.run((ctx) => ctx.db.get(artisan)), "artisan");
    expect(row.skillStatus).toBe("verified");
    expect(row.quizPassed).toBe(false);
    expect(row.credentialId).toBeUndefined();

    const notices = await w.as.query(api.workerAdmin.myNotifications);
    expect(notices[0].body).toContain("finish KYC");
  });

  it("does not overwrite an existing credential on a second approval", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    const artisan = await seedArtisan(t, w.id, {
      kycStatus: "verified",
      quizPassed: true,
      credentialId: "SSC-2026-AAAA",
    });
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/png",
    });
    await a.as.mutation(api.workSamples.reviewSample, { sampleId, approve: true });
    expect(must(await t.run((ctx) => ctx.db.get(artisan)), "artisan").credentialId).toBe(
      "SSC-2026-AAAA",
    );
  });

  it("rejecting records the reason, tells the worker, and leaves skill unverified", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    const artisan = await seedArtisan(t, w.id, { kycStatus: "verified", quizPassed: false });
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/png",
    });

    expect(
      await a.as.mutation(api.workSamples.reviewSample, {
        sampleId,
        approve: false,
        note: "Photo is too blurry",
      }),
    ).toEqual({ skillVerified: false });

    const sample = must(await t.run((ctx) => ctx.db.get(sampleId)), "sample");
    expect(sample.status).toBe("rejected");
    expect(sample.reviewNote).toBe("Photo is too blurry");
    expect(sample.reviewedBy).toBe(a.id);

    const row = must(await t.run((ctx) => ctx.db.get(artisan)), "artisan");
    expect(row.skillStatus).not.toBe("verified");
    expect(row.credentialId).toBeUndefined();

    const notices = await w.as.query(api.workerAdmin.myNotifications);
    expect(notices[0].body).toContain("Photo is too blurry");
  });
});

describe("workSamples:reviewKycFromSkillTab", () => {
  it("is admin-only and only acts on pending KYC", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const c = await seedCustomer(t);
    const w = await seedWorker(t);
    const artisan = await seedArtisan(t, w.id, { kycStatus: "verified" });

    await expect(
      c.as.mutation(api.workSamples.reviewKycFromSkillTab, { artisanId: artisan, approve: true }),
    ).rejects.toThrow("Forbidden");
    await expect(
      a.as.mutation(api.workSamples.reviewKycFromSkillTab, { artisanId: artisan, approve: true }),
    ).rejects.toThrow("KYC is not pending");
  });

  it("approving issues a reference and notifies the worker", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    const artisan = await seedArtisan(t, w.id, { kycStatus: "pending" });

    await a.as.mutation(api.workSamples.reviewKycFromSkillTab, {
      artisanId: artisan,
      approve: true,
    });
    const row = must(await t.run((ctx) => ctx.db.get(artisan)), "artisan");
    expect(row.kycStatus).toBe("verified");
    expect(row.kycRef).toMatch(/^BGC-/);

    const notices = await w.as.query(api.workerAdmin.myNotifications);
    expect(notices[0].title).toContain("KYC verification approved");
  });

  it("rejecting tells the worker the reason", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    const artisan = await seedArtisan(t, w.id, { kycStatus: "pending" });

    await a.as.mutation(api.workSamples.reviewKycFromSkillTab, {
      artisanId: artisan,
      approve: false,
      note: "ID number did not match",
    });
    expect(must(await t.run((ctx) => ctx.db.get(artisan)), "artisan").kycStatus).toBe("rejected");
    const notices = await w.as.query(api.workerAdmin.myNotifications);
    expect(notices[0].body).toContain("ID number did not match");
  });
});

describe("workSamples: verified samples release their image", () => {
  /** One sample through the full upload -> board approval path. */
  async function approvedSample(
    t: ReturnType<typeof setupTest>,
    opts: { note?: string } = {},
  ) {
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    const artisan = await seedArtisan(t, w.id);
    const storageId = await seedStorageFile(t);
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId,
      mimeType: "image/png",
      caption: "finished staircase",
    });
    await a.as.mutation(api.workSamples.reviewSample, {
      sampleId,
      approve: true,
      note: opts.note,
    });
    return { a, w, artisan, storageId, sampleId };
  }

  it("deletes the file from storage once the board approves", async () => {
    const t = setupTest();
    const { storageId, sampleId } = await approvedSample(t);

    // The image itself is gone — not merely hidden.
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
    // The row survives, because the verdict is the audit trail.
    expect(await t.run((ctx) => ctx.db.get(sampleId))).not.toBeNull();
  });

  it("keeps a written verdict in place of the picture", async () => {
    const t = setupTest();
    const { sampleId } = await approvedSample(t, { note: "Clean finish, correct tools" });

    const row = must(await t.run((ctx) => ctx.db.get(sampleId)), "sample");
    expect(row.storageId).toBeUndefined();
    expect(row.imagePurgedAt).toBeGreaterThan(0);
    expect(row.verdictText).toContain("verified by the federation board");
    expect(row.verdictText).toContain("Clean finish, correct tools");
    expect(row.reviewedAt).toBeGreaterThan(0);
  });

  it("shows the worker the verdict text and no broken image", async () => {
    const t = setupTest();
    const { w } = await approvedSample(t);

    const mine = await w.as.query(api.workSamples.mySamples);
    expect(mine).toHaveLength(1);
    expect(mine[0].hasImage).toBe(false);
    expect(mine[0].url).toBeNull();
    expect(mine[0].verdictText).toContain("no longer stored");
  });

  it("does not consume an upload slot, so the worker can submit more work", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);

    // Fill all six slots and have the board verify all six.
    for (let i = 0; i < 6; i++) {
      const id = await w.as.mutation(api.workSamples.completeUpload, {
        storageId: await seedStorageFile(t),
        mimeType: "image/png",
      });
      await a.as.mutation(api.workSamples.reviewSample, { sampleId: id, approve: true });
    }
    // A seventh upload must still be possible: the six released images no
    // longer hold any of the worker's quota.
    const seventh = await w.as.mutation(api.workSamples.completeUpload, {
      storageId: await seedStorageFile(t),
      mimeType: "image/png",
    });
    expect(seventh).toBeTruthy();
    const mine = await w.as.query(api.workSamples.mySamples);
    expect(mine.filter((m) => m.hasImage)).toHaveLength(1);
  });

  it("releases the image for a REJECTED sample too, and leaves a verdict", async () => {
    // A rejection is at least as personal as an approval — the photo of the
    // work that failed the worker is the last thing that should outlive the
    // decision. The written verdict is the record; the picture is not.
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    const storageId = await seedStorageFile(t);
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId,
      mimeType: "image/png",
    });
    await a.as.mutation(api.workSamples.reviewSample, {
      sampleId,
      approve: false,
      note: "Too blurry",
    });

    const row = must(await t.run((ctx) => ctx.db.get(sampleId)), "sample");
    expect(row.storageId).toBeUndefined();
    expect(row.imagePurgedAt).toBeTypeOf("number");
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();

    // The row survives as the audit trail, and the worker sees a reason rather
    // than an empty tile.
    expect(row.status).toBe("rejected");
    expect(row.verdictText).toContain("not verified");
    expect(row.verdictText).toContain("Too blurry");
    const mine = await w.as.query(api.workSamples.mySamples);
    expect(mine[0].hasImage).toBe(false);
    expect(mine[0].verdictText).toContain("Too blurry");
  });

  it("does not release the image while the sample is still PENDING", async () => {
    // The worker must still be able to see their own upload, and a board must
    // still be able to judge it.
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    const storageId = await seedStorageFile(t);
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId,
      mimeType: "image/png",
    });

    const row = must(await t.run((ctx) => ctx.db.get(sampleId)), "sample");
    expect(row.storageId).toBe(storageId);
    expect(row.imagePurgedAt).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).not.toBeNull();
    const queue = await a.as.query(api.workSamples.reviewQueue);
    expect(queue[0].url).toBeTruthy();
  });

  it("sweeps a reviewed sample whose storage delete failed at review time", async () => {
    // `reviewSample` treats a storage failure as non-fatal so a transient error
    // cannot cost the worker their verdict — but that leaves the file on disk
    // until something comes back for it. The sweep is that something.
    //
    // The state is reproduced directly rather than by making `ctx.storage`
    // throw on demand: a decision is recorded, `storageId` is still attached,
    // and the file genuinely still exists — which is exactly what the catch
    // block leaves behind.
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    const storageId = await seedStorageFile(t);
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId,
      mimeType: "image/png",
    });

    const now = Date.now();
    await t.run(async (ctx) => {
      const row = await ctx.db.get(sampleId as never);
      await ctx.db.patch(row!._id, {
        status: "approved",
        reviewedAt: now,
        reviewedBy: a.id as never,
        reviewNote: "Clear evidence of finished work",
      });
    });
    const stranded = must(await t.run((ctx) => ctx.db.get(sampleId)), "sample");
    expect(stranded.storageId).toBe(storageId);
    expect(stranded.imagePurgedAt).toBeUndefined();

    const result = await a.as.mutation(api.workSamples.sweepUnpurgedImages, {});
    expect(result).toEqual({ swept: 1, failed: 0 });

    const swept = must(await t.run((ctx) => ctx.db.get(sampleId)), "sample");
    expect(swept.storageId).toBeUndefined();
    expect(swept.imagePurgedAt).toBeTypeOf("number");
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
    // The verdict is untouched by the sweep — it is the record, not the file.
    expect(swept.status).toBe("approved");
    expect(swept.reviewNote).toBe("Clear evidence of finished work");
  });

  it("sweeps a stranded REJECTED sample as well", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    const storageId = await seedStorageFile(t);
    const sampleId = await w.as.mutation(api.workSamples.completeUpload, {
      storageId,
      mimeType: "image/png",
    });
    await t.run(async (ctx) => {
      const row = await ctx.db.get(sampleId as never);
      await ctx.db.patch(row!._id, {
        status: "rejected",
        reviewedAt: Date.now(),
        reviewedBy: a.id as never,
      });
    });

    expect(await a.as.mutation(api.workSamples.sweepUnpurgedImages, {})).toEqual({
      swept: 1,
      failed: 0,
    });
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
  });

  it("never sweeps a PENDING sample, and refuses a non-officer", async () => {
    const t = setupTest();
    const a = await seedAdmin(t);
    const w = await seedWorker(t);
    await seedArtisan(t, w.id);
    const storageId = await seedStorageFile(t);
    await w.as.mutation(api.workSamples.completeUpload, {
      storageId,
      mimeType: "image/png",
    });

    const result = await a.as.mutation(api.workSamples.sweepUnpurgedImages, {});
    expect(result).toEqual({ swept: 0, failed: 0 });
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).not.toBeNull();

    await expect(
      w.as.mutation(api.workSamples.sweepUnpurgedImages, {}),
    ).rejects.toThrow("Forbidden");
    await expect(
      t.mutation(api.workSamples.sweepUnpurgedImages, {}),
    ).rejects.toThrow("Not authenticated");
  });

  it("a released sample cannot be deleted, and its empty row is inert", async () => {
    const t = setupTest();
    const { w, sampleId } = await approvedSample(t);
    await expect(
      w.as.mutation(api.workSamples.deleteSample, { sampleId }),
    ).rejects.toThrow("Reviewed samples cannot be deleted");
  });
});
