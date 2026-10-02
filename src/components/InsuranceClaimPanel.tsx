import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLang } from "@/lib/i18n";
import { CLAIM_CATEGORIES, CLAIM_ROUTES } from "@/lib/insurance";
import { Panel, TlButton } from "@/components/terminal";
import { HeartPulse, Loader2, ShieldCheck } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * The member's side of the accident-cover flow.
 *
 * The copy here is the load-bearing part. A panel labelled "Insurance" with a
 * green tick implies a product this platform does not sell. So the panel leads
 * with the number the member can actually rely on — the 7% accrued on their own
 * completed jobs — and states plainly that a claim is forwarded to a scheme,
 * not paid by us.
 *
 * Showing the accrued balance rather than a "covered" badge is the honest
 * version of the same feature: it is a number in the cooperative's own ledger
 * that a member can point at.
 */
export default function InsuranceClaimPanel({
  artisanId,
}: {
  artisanId: Id<"artisans">;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scheme, setScheme] = useState<string>("pmjjby");
  const [category, setCategory] = useState<string>("accident");
  const [details, setDetails] = useState("");
  const [amount, setAmount] = useState("");

  const cover = useQuery(api.insurance.coverStatus, { artisanId });
  const claims = useQuery(api.insurance.myClaims, {});
  const raise = useMutation(api.insurance.raise);

  // `null` means the viewer is not this worker's account and not an admin, so
  // there is nothing to show them.
  if (!cover) return null;

  const routes = CLAIM_ROUTES;
  const categories = CLAIM_CATEGORIES;

  async function handleRaise() {
    setBusy(true);
    try {
      await raise({
        artisanId,
        scheme,
        category,
        description: details,
        claimedAmount: amount.trim() ? Number(amount) : undefined,
      });
      setDetails("");
      setAmount("");
      setOpen(false);
    } catch {
      // surfaced by the Convex error toast
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={t("ins_title")} tag={t("ins_tag")}>
      <div className="space-y-4 text-xs">
        <div className="flex items-start gap-2.5">
          <HeartPulse className="mt-0.5 size-5 shrink-0 text-rose-500" />
          <div>
            <p className="text-lg font-black text-slate-800">
              ₹{(cover.welfareBalance ?? 0).toLocaleString("en-IN")}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {t("ins_balance")}
            </p>
          </div>
        </div>

        <div className="flex gap-2 text-[11px]">
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">
            {t("ins_open")}: {cover.openClaims}
          </span>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">
            {t("ins_settled")}: {cover.settledClaims}
          </span>
        </div>

        <p className="rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
          {t("ins_disclaimer")}
        </p>

        {!open ? (
          <TlButton
            variant="outline"
            className="w-full"
            onClick={() => setOpen(true)}
          >
            <ShieldCheck className="size-4" />
            {t("ins_file")}
          </TlButton>
        ) : (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <label className="block">
              <span className="tl-label">{t("ins_route")}</span>
              <select
                className="tl-input"
                value={scheme}
                onChange={(e) => setScheme(e.target.value)}
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="tl-label">{t("ins_category")}</span>
              <select
                className="tl-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="tl-label">{t("ins_details")}</span>
              <textarea
                className="tl-input min-h-20"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t("ins_details_ph")}
              />
            </label>

            <label className="block">
              <span className="tl-label">{t("ins_amount")}</span>
              <input
                className="tl-input"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0"
              />
            </label>

            <div className="flex gap-2">
              <TlButton
                variant="ghost"
                className="flex-1"
                onClick={() => setOpen(false)}
              >
                {t("btn_cancel")}
              </TlButton>
              <TlButton
                className="flex-1"
                onClick={() => void handleRaise()}
                disabled={busy || details.trim().length < 10}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {t("ins_submit")}
              </TlButton>
            </div>
          </div>
        )}

        {claims && claims.length > 0 && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            {claims.slice(0, 4).map((c) => (
              <div
                key={c._id}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="truncate text-slate-600">{c.category}</span>
                <span
                  className={
                    c.status === "open"
                      ? "font-bold text-amber-600"
                      : c.status === "settled"
                        ? "font-bold text-emerald-600"
                        : "font-bold text-slate-400"
                  }
                >
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
