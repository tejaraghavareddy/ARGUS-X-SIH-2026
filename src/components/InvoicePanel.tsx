import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLang } from "@/lib/i18n";
import { Panel, TlButton } from "@/components/terminal";
import { FileText, Loader2, Printer } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * The receipt.
 *
 * "Digital payments and invoicing" is one half of a stated requirement, and
 * this is the half that was missing. Payment moved by UPI already; what a
 * customer actually keeps is paper.
 *
 * The document is rendered from the stored invoice row rather than recomputed
 * from the booking, so a receipt cannot change under the customer's hands after
 * a later price edit. The 90/7/3 split is printed on the face of it because
 * the split *is* the cooperative's proposition — a customer reading an invoice
 * from a private platform sees a total; a customer reading this one sees where
 * their money went.
 *
 * Print styling is inline via Tailwind's print: variants rather than a
 * separate stylesheet, so the receipt and the screen version cannot drift.
 */
export default function InvoicePanel({
  bookingId,
}: {
  bookingId: Id<"bookings">;
}) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);

  const eligibility = useQuery(api.invoices.eligibility, { bookingId });
  const invoice = useQuery(api.invoices.forBooking, { bookingId });
  const issue = useMutation(api.invoices.issue);

  async function handleIssue() {
    setBusy(true);
    try {
      await issue({ bookingId });
    } catch {
      // surfaced by the Convex error toast
    } finally {
      setBusy(false);
    }
  }

  // Still loading, or not yet paid — say nothing rather than flashing a button
  // the customer will not be able to press.
  if (eligibility === undefined) return null;

  if (!invoice) {
    if (!("ok" in eligibility) || !eligibility.ok) {
      // Only prompt the customer once the job is actually paid. Before that,
      // an invoice would be a claim that money moved, and it has not.
      if (eligibility.ok === false && eligibility.reason === "unpaid") {
        return (
          <Panel title={t("inv_title")}>
            <p className="text-xs text-slate-500">{t("inv_wait_paid")}</p>
          </Panel>
        );
      }
      return null;
    }
    return (
      <Panel title={t("inv_title")}>
        <p className="mb-3 text-xs text-slate-500">{t("inv_ready_desc")}</p>
        <TlButton
          className="w-full"
          onClick={() => void handleIssue()}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileText className="size-4" />
          )}
          {t("inv_issue")}
        </TlButton>
      </Panel>
    );
  }

  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <Panel
      title={t("inv_title")}
      tag={invoice.number}
      className="print:border-0 print:shadow-none"
      bodyClassName="p-5 print:p-0"
    >
      <div className="space-y-4 text-xs">
        {/* Letterhead — hidden on screen, the document needs it on paper. */}
        <div className="hidden print:block">
          <p className="text-base font-black">Sahakar Seva</p>
          <p className="text-[10px]">
            {t("inv_cooperative_of")} · {t("inv_receipt")}
          </p>
        </div>

        {/* Seller identity. Only rendered when the worker actually supplied
            one — an "unregistered seller" line reads better than a row of
            blanks, and printing empty GSTIN fields invites a rejection. */}
        {(invoice.pan || invoice.gstin || invoice.sacCode) && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-xl bg-slate-50 p-3 font-mono text-[10px] text-slate-600">
            {invoice.artisanName && (
              <>
                <dt className="font-semibold">{t("inv_seller")}</dt>
                <dd>{invoice.artisanName}</dd>
              </>
            )}
            {invoice.pan && (
              <>
                <dt className="font-semibold">PAN</dt>
                <dd>{invoice.pan}</dd>
              </>
            )}
            {invoice.gstin && (
              <>
                <dt className="font-semibold">GSTIN</dt>
                <dd>{invoice.gstin}</dd>
              </>
            )}
            {invoice.sacCode && (
              <>
                <dt className="font-semibold">{t("inv_sac")}</dt>
                <dd>{invoice.sacCode}</dd>
              </>
            )}
          </dl>
        )}

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-800">{invoice.serviceName}</p>
            <p className="text-slate-500">{invoice.address}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[10px] text-slate-400">
              {new Date(invoice.issuedAt).toLocaleDateString("en-IN")}
            </p>
            {invoice.paidAt && (
              <p className="font-mono text-[10px] text-slate-400">
                {t("inv_paid")}{" "}
                {new Date(invoice.paidAt).toLocaleDateString("en-IN")}
              </p>
            )}
          </div>
        </div>

        {/* The split, printed. This is the cooperative argument in one table. */}
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-1.5 text-slate-600">{t("inv_worker_share")}</td>
              <td className="py-1.5 text-right font-bold text-emerald-700">
                {inr(invoice.workerShare)}
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-1.5 text-slate-600">{t("inv_welfare_share")}</td>
              <td className="py-1.5 text-right font-bold text-sky-700">
                {inr(invoice.welfareAmt)}
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-1.5 text-slate-600">{t("inv_ops_share")}</td>
              <td className="py-1.5 text-right font-bold text-slate-500">
                {inr(invoice.opsAmt)}
              </td>
            </tr>
            <tr>
              <td className="py-1.5 font-bold text-slate-800">
                {t("bk_total")}
              </td>
              <td className="py-1.5 text-right font-black text-slate-900">
                {inr(invoice.total)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="space-y-1 rounded-xl bg-slate-50 p-3 font-mono text-[10px] text-slate-600">
          <p>
            {t("inv_utr")}: {invoice.utr ?? "—"}
          </p>
          <p>
            {t("inv_method")}: UPI ({invoice.paymentMethod ?? "upi_manual"})
          </p>
        </div>

        <p className="text-[10px] leading-relaxed text-slate-400">
          {t("inv_disclaimer")}
        </p>

        <TlButton
          variant="ghost"
          className="w-full print:hidden"
          onClick={() => window.print()}
        >
          <Printer className="size-4" />
          {t("inv_print")}
        </TlButton>
      </div>
    </Panel>
  );
}
