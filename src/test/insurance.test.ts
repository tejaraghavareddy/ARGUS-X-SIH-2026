import { describe, expect, it } from "vitest";
import {
  api,
  must,
  seedAdmin,
  seedArtisan,
  seedBooking,
  seedCustomer,
  seedWorker,
  setupTest,
} from "./convexHarness";

/**
 * Worker accident cover.
 *
 * The design claim these tests defend: this is a *claim* system, not an
 * insurance product. A claim is an assertion by the member, forwarding is a
 * receipt from the cooperative, and neither path pays anyone. So the tests are
 * mostly about who is allowed to assert what, and about making sure nothing in
 * here quietly behaves like a payout authority.
 */

const validClaim = {
  scheme: "pmjjby",
  category: "accident",
  description: "Fell from the ladder while fitting a fan.",
};

describe("insurance:raise", () => {
  it("refuses a signed-out caller", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id);
    await expect(
      t.mutation(api.insurance.raise, { artisanId: art, ...validClaim }),
    ).rejects.toThrow("Not authenticated");
  });

  it("refuses a member claiming on someone else's work", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const stranger = await seedWorker(t, { email: "s@x.com" });
    const art = await seedArtisan(t, w.id);
    await expect(
      stranger.as.mutation(api.insurance.raise, { artisanId: art, ...validClaim }),
    ).rejects.toThrow("only file a claim for your own work");
  });

  it("rejects an unknown cover route", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id);
    await expect(
      w.as.mutation(api.insurance.raise, {
        artisanId: art,
        ...validClaim,
        scheme: "free_money",
      }),
    ).rejects.toThrow("Unknown claim route");
  });

  it("rejects an unknown category", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id);
    await expect(
      w.as.mutation(api.insurance.raise, {
        artisanId: art,
        ...validClaim,
        category: "weather",
      }),
    ).rejects.toThrow("Unknown claim category");
  });

  // A one-word claim is not a record an insurer can act on.
  it("rejects a description too short to be a record", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id);
    await expect(
      w.as.mutation(api.insurance.raise, {
        artisanId: art,
        ...validClaim,
        description: "oops",
      }),
    ).rejects.toThrow("in a little more detail");
  });

  it("rejects a negative claimed amount", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id);
    await expect(
      w.as.mutation(api.insurance.raise, {
        artisanId: art,
        ...validClaim,
        claimedAmount: -500,
      }),
    ).rejects.toThrow("valid amount");
  });

  // Anchoring: a claim the federation cannot tie to a witnessed job is just an
  // assertion, and the module's whole value is that it witnessed the job.
  it("refuses a booking that belongs to a different worker", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const w = await seedWorker(t);
    const other = await seedWorker(t, { email: "o@x.com" });
    const art = await seedArtisan(t, w.id);
    const otherArt = await seedArtisan(t, other.id);
    const b = await seedBooking(t, c.id, { workerId: otherArt });
    await expect(
      w.as.mutation(api.insurance.raise, {
        artisanId: art,
        bookingId: b,
        ...validClaim,
      }),
    ).rejects.toThrow("not this worker's");
  });

  it("records an open claim against the worker", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id);
    const id = await w.as.mutation(api.insurance.raise, {
      artisanId: art,
      ...validClaim,
    });
    const claim = must(await t.run((ctx) => ctx.db.get(id)), "claim");
    expect(claim.artisanId).toBe(art);
    expect(claim.status).toBe("open");
    expect(claim.scheme).toBe("pmjjby");
    expect(claim.raisedBy).toBe(w.id);
  });

  it("trims the description", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id);
    const id = await w.as.mutation(api.insurance.raise, {
      artisanId: art,
      ...validClaim,
      description: "  Fell from the ladder.  ",
    });
    const claim = must(await t.run((ctx) => ctx.db.get(id)), "claim");
    expect(claim.description).toBe("Fell from the ladder.");
  });

  it("accepts a claim anchored to this worker's own booking", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id);
    const b = await seedBooking(t, c.id, { workerId: art, status: "inprogress" });
    const id = await w.as.mutation(api.insurance.raise, {
      artisanId: art,
      bookingId: b,
      ...validClaim,
    });
    const claim = must(await t.run((ctx) => ctx.db.get(id)), "claim");
    expect(claim.bookingId).toBe(b);
  });
});

describe("insurance:myClaims", () => {
  it("returns nothing for a member with no artisan record", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    expect(await c.as.query(api.insurance.myClaims, {})).toEqual([]);
  });

  it("returns the worker's own claims, newest first", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id);
    await w.as.mutation(api.insurance.raise, { artisanId: art, ...validClaim });
    await w.as.mutation(api.insurance.raise, {
      artisanId: art,
      ...validClaim,
      category: "property",
    });
    const claims = await w.as.query(api.insurance.myClaims, {});
    expect(claims.length).toBe(2);
    expect(claims[0].category).toBe("property");
  });
});

describe("insurance:listForAdmin", () => {
  it("forbids a non-admin", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    await expect(c.as.query(api.insurance.listForAdmin, {})).rejects.toThrow(
      "Forbidden",
    );
  });

  it("shows an officer the open queue", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const admin = await seedAdmin(t);
    const art = await seedArtisan(t, w.id);
    await w.as.mutation(api.insurance.raise, { artisanId: art, ...validClaim });
    const queue = await admin.as.query(api.insurance.listForAdmin, {});
    expect(queue.length).toBe(1);
  });
});

describe("insurance:resolve", () => {
  it("forbids a non-admin from deciding a claim", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id);
    const id = await w.as.mutation(api.insurance.raise, { artisanId: art, ...validClaim });
    await expect(
      w.as.mutation(api.insurance.resolve, { id, status: "settled" }),
    ).rejects.toThrow("Forbidden");
  });

  // A forwarding receipt with no destination is a receipt for nothing.
  it("refuses to forward without recording where it went", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const admin = await seedAdmin(t);
    const art = await seedArtisan(t, w.id);
    const id = await w.as.mutation(api.insurance.raise, { artisanId: art, ...validClaim });
    await expect(
      admin.as.mutation(api.insurance.resolve, { id, status: "forwarded" }),
    ).rejects.toThrow("Record where the claim was forwarded");
  });

  it("records a forwarding receipt", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const admin = await seedAdmin(t);
    const art = await seedArtisan(t, w.id);
    const id = await w.as.mutation(api.insurance.raise, { artisanId: art, ...validClaim });
    await admin.as.mutation(api.insurance.resolve, {
      id,
      status: "forwarded",
      forwardedTo: "PMJJBY portal",
      reference: "GIB-REF-8891",
    });
    const claim = must(await t.run((ctx) => ctx.db.get(id)), "claim");
    expect(claim.status).toBe("forwarded");
    expect(claim.forwardedTo).toBe("PMJJBY portal");
    expect(claim.reference).toBe("GIB-REF-8891");
  });

  it("refuses to decide the same claim twice", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const admin = await seedAdmin(t);
    const art = await seedArtisan(t, w.id);
    const id = await w.as.mutation(api.insurance.raise, { artisanId: art, ...validClaim });
    await admin.as.mutation(api.insurance.resolve, { id, status: "settled" });
    await expect(
      admin.as.mutation(api.insurance.resolve, { id, status: "rejected" }),
    ).rejects.toThrow("already been decided");
  });

  it("rejects an unknown status", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const admin = await seedAdmin(t);
    const art = await seedArtisan(t, w.id);
    const id = await w.as.mutation(api.insurance.raise, { artisanId: art, ...validClaim });
    await expect(
      admin.as.mutation(api.insurance.resolve, { id, status: "paid" }),
    ).rejects.toThrow("Unknown status");
  });
});

describe("insurance:coverStatus", () => {
  it("hides cover status from an unrelated member", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const stranger = await seedWorker(t, { email: "s@x.com" });
    const art = await seedArtisan(t, w.id);
    expect(
      await stranger.as.query(api.insurance.coverStatus, { artisanId: art }),
    ).toBeNull();
  });

  it("returns nothing to a signed-out viewer", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id);
    expect(await t.query(api.insurance.coverStatus, { artisanId: art })).toBeNull();
  });

  it("reports the accrued welfare balance with no claims", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const art = await seedArtisan(t, w.id, { welfareBalance: 1400 });
    const cover = await w.as.query(api.insurance.coverStatus, { artisanId: art });
    expect(cover).toEqual({
      welfareBalance: 1400,
      openClaims: 0,
      totalClaims: 0,
      settledClaims: 0,
    });
  });

  it("counts open and settled claims separately", async () => {
    const t = setupTest();
    const w = await seedWorker(t);
    const admin = await seedAdmin(t);
    const art = await seedArtisan(t, w.id, { welfareBalance: 700 });
    const open = await w.as.mutation(api.insurance.raise, { artisanId: art, ...validClaim });
    const done = await w.as.mutation(api.insurance.raise, {
      artisanId: art,
      ...validClaim,
      category: "property",
    });
    await admin.as.mutation(api.insurance.resolve, { id: done, status: "settled" });
    const cover = must(
      await w.as.query(api.insurance.coverStatus, { artisanId: art }),
      "cover status",
    );
    expect(cover.openClaims).toBe(1);
    expect(cover.settledClaims).toBe(1);
    expect(cover.totalClaims).toBe(2);
    // The balance is the accrued 7% and is untouched by claiming — this is not
    // a payout balance.
    expect(cover.welfareBalance).toBe(700);
    expect(open).toBeTruthy();
  });
});
