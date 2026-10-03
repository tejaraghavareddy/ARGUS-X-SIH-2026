/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderPage, freshMocks } from "./renderHarness";
import {
  queryResults,
  mutationErrors,
  mutationCalls,
} from "./setup";
import InvoicePanel from "@/components/InvoicePanel";
import InsuranceClaimPanel from "@/components/InsuranceClaimPanel";
import TaxIdentityPanel from "@/components/TaxIdentityPanel";

/**
 * Render tests for the panels added late in the project.
 *
 * The backend for these was covered by convex-test suites (invoices,
 * insurance), but the components themselves were never mounted — so a bad
 * prop name, a missing i18n key or a broken import would only have surfaced
 * when a judge opened the screen. These mount them for real against mocked
 * Convex data.
 *
 * What this deliberately does NOT assert: jsdom has no layout engine, so
 * nothing here proves the print stylesheet, the QR code or the map render
 * correctly. It proves the component mounts, resolves its strings, and wires
 * the right mutation arguments.
 */

const BOOKING = "b1" as never;
const ARTISAN = "a1" as never;

beforeEach(() => {
  freshMocks();
  mutationErrors.clear();
  mutationCalls.length = 0;
});

/** A settled booking with an issued invoice. */
function seedIssuedInvoice(over: Record<string, unknown> = {}) {
  queryResults.set("invoices:eligibility", {
    ok: true,
    invoiceId: "i1",
    existing: true,
  });
  queryResults.set("invoices:forBooking", {
    _id: "i1",
    bookingId: "b1",
    number: "SS-2026-000007",
    serviceName: "AC Repair",
    address: "1 Test Street",
    artisanName: "Asha Rao",
    pan: "ABCDE1234F",
    sacCode: "998311",
    base: 1000,
    workerShare: 900,
    welfareAmt: 70,
    opsAmt: 30,
    total: 1000,
    utr: "UTR987654321",
    paymentMethod: "upi_manual",
    paidAt: Date.now(),
    issuedAt: Date.now(),
    ...over,
  });
}

describe("InvoicePanel", () => {
  it("shows nothing while the booking is not yet paid", () => {
    queryResults.set("invoices:eligibility", { ok: false, reason: "unpaid" });
    queryResults.set("invoices:forBooking", null);
    const { container } = renderPage(<InvoicePanel bookingId={BOOKING} />);
    // It does explain why, rather than vanishing silently.
    expect(container.textContent).toMatch(/once the work is done/i);
  });

  it("offers to generate one for a paid booking", () => {
    queryResults.set("invoices:eligibility", { ok: true });
    queryResults.set("invoices:forBooking", null);
    renderPage(<InvoicePanel bookingId={BOOKING} />);
    expect(screen.getByRole("button", { name: /generate invoice/i })).toBeTruthy();
  });

  it("renders the issued receipt with its number and the 90/7/3 split", () => {
    seedIssuedInvoice();
    renderPage(<InvoicePanel bookingId={BOOKING} />);
    expect(screen.getByText("SS-2026-000007")).toBeTruthy();
    // The split is the cooperative's whole argument, printed on the document.
    expect(screen.getByText(/90%/)).toBeTruthy();
    expect(screen.getByText(/7%/)).toBeTruthy();
    expect(screen.getByText(/3%/)).toBeTruthy();
    expect(screen.getByText("₹1,000")).toBeTruthy();
  });

  it("prints the seller's PAN and SAC code when the worker supplied them", () => {
    seedIssuedInvoice();
    renderPage(<InvoicePanel bookingId={BOOKING} />);
    expect(screen.getByText("ABCDE1234F")).toBeTruthy();
    expect(screen.getByText("998311")).toBeTruthy();
    expect(screen.getByText("Asha Rao")).toBeTruthy();
  });

  // An unregistered member still gets a valid receipt. Printing an empty GSTIN
  // row would invite a rejection at the counter.
  it("omits the seller tax block entirely when the worker has none", () => {
    seedIssuedInvoice({ pan: undefined, sacCode: undefined, artisanName: undefined });
    renderPage(<InvoicePanel bookingId={BOOKING} />);
    expect(screen.getByText("SS-2026-000007")).toBeTruthy();
    expect(document.body.textContent).not.toContain("PAN");
  });

  it("shows the payment reference it attests", () => {
    seedIssuedInvoice();
    renderPage(<InvoicePanel bookingId={BOOKING} />);
    expect(screen.getByText(/UTR987654321/)).toBeTruthy();
  });
});

describe("InsuranceClaimPanel", () => {
  it("leads with the accrued welfare balance, not an 'insured' badge", () => {
    queryResults.set("insurance:coverStatus", {
      welfareBalance: 1400,
      openClaims: 0,
      totalClaims: 0,
      settledClaims: 0,
    });
    queryResults.set("insurance:myClaims", []);
    renderPage(<InsuranceClaimPanel artisanId={ARTISAN} />);
    expect(screen.getByText("₹1,400")).toBeTruthy();
    // The honest disclaimer: a claim is forwarded, not paid by us.
    expect(screen.getByText(/not a payout from this app/i)).toBeTruthy();
  });

  it("renders nothing for a viewer who is neither the worker nor an admin", () => {
    queryResults.set("insurance:coverStatus", null);
    queryResults.set("insurance:myClaims", []);
    const { container } = renderPage(<InsuranceClaimPanel artisanId={ARTISAN} />);
    expect(container.textContent).toBe("");
  });

  it("collects a claim and submits it with the chosen route", async () => {
    queryResults.set("insurance:coverStatus", {
      welfareBalance: 0,
      openClaims: 0,
      totalClaims: 0,
      settledClaims: 0,
    });
    queryResults.set("insurance:myClaims", []);
    renderPage(<InsuranceClaimPanel artisanId={ARTISAN} />);
    fireEvent.click(screen.getByRole("button", { name: /file a claim/i }));
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Fell from the ladder." } });
    fireEvent.click(screen.getByRole("button", { name: /submit claim/i }));
    await waitFor(() =>
      expect(mutationCalls.some((c) => c.path.includes("insurance:raise"))).toBe(true),
    );
    const call = mutationCalls.find((c) => c.path.includes("insurance:raise"));
    expect((call?.args as { artisanId: string }).artisanId).toBe("a1");
    expect((call?.args as { scheme: string }).scheme).toBe("pmjjby");
  });

  it("keeps submit inert until the description is a usable record", () => {
    queryResults.set("insurance:coverStatus", {
      welfareBalance: 0,
      openClaims: 0,
      totalClaims: 0,
      settledClaims: 0,
    });
    queryResults.set("insurance:myClaims", []);
    renderPage(<InsuranceClaimPanel artisanId={ARTISAN} />);
    fireEvent.click(screen.getByRole("button", { name: /file a claim/i }));
    const submit = screen.getByRole("button", { name: /submit claim/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("TaxIdentityPanel", () => {
  it("prefills whatever the worker has already saved", () => {
    renderPage(
      <TaxIdentityPanel pan="ABCDE1234F" gstin="29ABCDE1234F1Z5" sacCode="998311" />,
    );
    expect((document.querySelector('input[placeholder="ABCDE1234F"]') as HTMLInputElement).value)
      .toBe("ABCDE1234F");
    expect((document.querySelector('input[placeholder="998311"]') as HTMLInputElement).value)
      .toBe("998311");
  });

  it("submits the three fields to the tax mutation", async () => {
    renderPage(<TaxIdentityPanel />);
    fireEvent.change(document.querySelector('input[placeholder="ABCDE1234F"]')!, {
      target: { value: "ABCDE1234F" },
    });
    fireEvent.change(document.querySelector('input[placeholder="29ABCDE1234F1Z5"]')!, {
      target: { value: "29ABCDE1234F1Z5" },
    });
    fireEvent.change(document.querySelector('input[placeholder="998311"]')!, {
      target: { value: "998311" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save tax details/i }));
    await waitFor(() =>
      expect(mutationCalls.some((c) => c.path.includes("artisans:setTaxIdentity"))).toBe(true),
    );
    const call = mutationCalls.find((c) => c.path.includes("artisans:setTaxIdentity"));
    expect(call?.args).toEqual({
      pan: "ABCDE1234F",
      gstin: "29ABCDE1234F1Z5",
      sacCode: "998311",
    });
  });

  // Optional means optional: an empty submit must reach the server as all
  // undefined, not empty strings that would fail the format check.
  it("submits blank fields as undefined rather than empty strings", async () => {
    renderPage(<TaxIdentityPanel />);
    fireEvent.click(screen.getByRole("button", { name: /save tax details/i }));
    await waitFor(() =>
      expect(mutationCalls.some((c) => c.path.includes("artisans:setTaxIdentity"))).toBe(true),
    );
    const call = mutationCalls.find((c) => c.path.includes("artisans:setTaxIdentity"));
    expect(call?.args).toEqual({
      pan: undefined,
      gstin: undefined,
      sacCode: undefined,
    });
  });

  it("says plainly that nothing is registry-verified", () => {
    renderPage(<TaxIdentityPanel />);
    expect(screen.getByText(/verified against a government registry/i)).toBeTruthy();
  });
});
