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
 * Invoicing.
 *
 * The properties worth locking down are the ones a customer would notice going
 * wrong: that you cannot print a receipt for a job nobody paid for, that the
 * same job never gets two numbers, and that a receipt does not quietly change
 * its amounts after the fact.
 */

/** A booking in a paid state, ready to invoice. */
function paidBooking(
  t: ReturnType<typeof setupTest>,
  customerId: Parameters<typeof seedBooking>[1],
  extra: Parameters<typeof seedBooking>[2] = {},
) {
  return seedBooking(t, customerId, {
    status: "completed",
    utr: "UTR123456789",
    paidAt: Date.now(),
    paymentMethod: "upi_manual",
    ...extra,
  });
}

describe("invoices:issue", () => {
  it("refuses a signed-out caller", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b = await paidBooking(t, c.id);
    await expect(
      t.mutation(api.invoices.issue, { bookingId: b }),
    ).rejects.toThrow("Not authenticated");
  });

  it("refuses a member with no relationship to the booking", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const stranger = await seedCustomer(t, { email: "s@x.com" });
    const b = await paidBooking(t, c.id);
    await expect(
      stranger.as.mutation(api.invoices.issue, { bookingId: b }),
    ).rejects.toThrow("Not your booking");
  });

  // The core safety property: an invoice asserts money moved.
  it("refuses to invoice a booking that is not paid", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b = await seedBooking(t, c.id, { status: "inprogress" });
    await expect(
      c.as.mutation(api.invoices.issue, { bookingId: b }),
    ).rejects.toThrow("once the job is paid");
  });

  it("refuses a paid-status booking with no payment reference", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b = await seedBooking(t, c.id, { status: "completed" });
    await expect(
      c.as.mutation(api.invoices.issue, { bookingId: b }),
    ).rejects.toThrow("No payment reference");
  });

  it("issues a numbered invoice carrying the payment reference", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b = await paidBooking(t, c.id);
    const id = await c.as.mutation(api.invoices.issue, { bookingId: b });
    const inv = must(await t.run((ctx) => ctx.db.get(id)), "invoice");
    expect(inv.bookingId).toBe(b);
    expect(inv.number).toMatch(/^SS-\d{4}-000001$/);
    expect(inv.utr).toBe("UTR123456789");
    expect(inv.paymentMethod).toBe("upi_manual");
    expect(inv.total).toBe(1000);
  });

  // One job, one receipt. A re-issued document would put a second number in
  // the society's register for money that only moved once.
  it("is idempotent — a second call returns the same invoice", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b = await paidBooking(t, c.id);
    const first = await c.as.mutation(api.invoices.issue, { bookingId: b });
    const second = await c.as.mutation(api.invoices.issue, { bookingId: b });
    expect(second).toBe(first);
    const all = await t.run((ctx) =>
      ctx.db.query("invoices").withIndex("by_booking", (q) => q.eq("bookingId", b)).collect(),
    );
    expect(all.length).toBe(1);
  });

  it("numbers invoices sequentially per society", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b1 = await paidBooking(t, c.id);
    const b2 = await paidBooking(t, c.id);
    await c.as.mutation(api.invoices.issue, { bookingId: b1 });
    await c.as.mutation(api.invoices.issue, { bookingId: b2 });
    const numbers = (
      await t.run((ctx) => ctx.db.query("invoices").collect())
    )
      .map((i) => i.number)
      .sort();
    expect(numbers).toEqual(["SS-2026-000001", "SS-2026-000002"]);
  });

  it("skips a number already taken rather than colliding", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    // Plant a gap-filler directly, as an earlier rolled-back issue would leave.
    const b0 = await paidBooking(t, c.id);
    await t.run((ctx) =>
      ctx.db.insert("invoices", {
        bookingId: b0,
        number: `SS-${new Date().getFullYear()}-000001`,
        issuedToUserId: c.id,
        serviceName: "x",
        address: "x",
        base: 1,
        workerShare: 1,
        welfareAmt: 0,
        opsAmt: 0,
        total: 1,
        issuedAt: Date.now(),
      }),
    );
    const b1 = await paidBooking(t, c.id);
    const id = await c.as.mutation(api.invoices.issue, { bookingId: b1 });
    const inv = must(await t.run((ctx) => ctx.db.get(id)), "invoice");
    expect(inv.number).toBe(`SS-${new Date().getFullYear()}-000002`);
  });

  // A receipt is a statement about a moment. A later repricing must not reach
  // back and alter a document the customer already filed.
  it("freezes the money columns at issue time", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b = await paidBooking(t, c.id);
    const id = await c.as.mutation(api.invoices.issue, { bookingId: b });
    // Reprice the booking after the invoice exists.
    await t.run((ctx) => ctx.db.patch(b, { total: 9999, workerShare: 8999 }));
    const inv = must(await t.run((ctx) => ctx.db.get(id)), "invoice");
    expect(inv.total).toBe(1000);
    expect(inv.workerShare).toBe(900);
    expect(inv.welfareAmt).toBe(70);
    expect(inv.opsAmt).toBe(30);
  });

  it("lets the assigned worker invoice the job too", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const w = await seedWorker(t, { email: "w@x.com" });
    const art = await seedArtisan(t, w.id);
    const b = await paidBooking(t, c.id, { workerUserId: w.id, workerId: art });
    const id = await w.as.mutation(api.invoices.issue, { bookingId: b });
    const inv = must(await t.run((ctx) => ctx.db.get(id)), "invoice");
    expect(inv.artisanId).toBe(art);
  });

  it("refuses a signed-out viewer reading an invoice", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b = await paidBooking(t, c.id);
    await c.as.mutation(api.invoices.issue, { bookingId: b });
    expect(await t.query(api.invoices.forBooking, { bookingId: b })).toBeNull();
  });

  it("hides an invoice from an unrelated member", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const stranger = await seedCustomer(t, { email: "s@x.com" });
    const b = await paidBooking(t, c.id);
    await c.as.mutation(api.invoices.issue, { bookingId: b });
    expect(
      await stranger.as.query(api.invoices.forBooking, { bookingId: b }),
    ).toBeNull();
  });
});

describe("invoices:eligibility", () => {
  it("reports unpaid before the job is settled", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b = await seedBooking(t, c.id, { status: "inprogress" });
    const e = await c.as.query(api.invoices.eligibility, { bookingId: b });
    expect(e).toEqual({ ok: false, reason: "unpaid" });
  });

  it("reports forbidden to a stranger rather than leaking state", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const stranger = await seedCustomer(t, { email: "s@x.com" });
    const b = await paidBooking(t, c.id);
    const e = await stranger.as.query(api.invoices.eligibility, { bookingId: b });
    expect(e).toEqual({ ok: false, reason: "forbidden" });
  });

  it("reports ok for a paid booking with no invoice yet", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b = await paidBooking(t, c.id);
    const e = await c.as.query(api.invoices.eligibility, { bookingId: b });
    expect(e).toEqual({ ok: true });
  });

  it("points at the existing invoice once issued", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b = await paidBooking(t, c.id);
    const id = await c.as.mutation(api.invoices.issue, { bookingId: b });
    const e = await c.as.query(api.invoices.eligibility, { bookingId: b });
    expect(e).toEqual({ ok: true, invoiceId: id, existing: true });
  });
});

describe("invoices:ledgerTotals", () => {
  it("sums the 7% welfare column across issued invoices", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const admin = await seedAdmin(t);
    const b = await paidBooking(t, c.id);
    await c.as.mutation(api.invoices.issue, { bookingId: b });
    const totals = await admin.as.query(api.invoices.ledgerTotals, {});
    expect(totals.count).toBe(1);
    expect(totals.total).toBe(1000);
    expect(totals.welfare).toBe(70);
    expect(totals.ops).toBe(30);
    expect(totals.workerPayout).toBe(900);
  });

  it("forbids a non-admin from reading the society register", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    await expect(c.as.query(api.invoices.ledgerTotals, {})).rejects.toThrow(
      "Forbidden",
    );
  });

  it("keeps the 90/7/3 split summing to the total", async () => {
    const t = setupTest();
    const c = await seedCustomer(t);
    const b = await paidBooking(t, c.id);
    await c.as.mutation(api.invoices.issue, { bookingId: b });
    const inv = must(
      await t.run(async (ctx) => {
        const row = await ctx.db
          .query("invoices")
          .withIndex("by_booking", (q) => q.eq("bookingId", b))
          .first();
        return row ?? null;
      }),
      "invoice",
    );
    expect(inv.workerShare + inv.welfareAmt + inv.opsAmt).toBe(inv.total);
  });
});
