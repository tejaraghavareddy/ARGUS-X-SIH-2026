import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLang } from "@/lib/i18n";
import { Panel, TlButton } from "@/components/terminal";
import { BadgeIndianRupee, Loader2, Save } from "lucide-react";

/**
 * The worker's tax identity, printed on every invoice they issue.
 *
 * Deliberately optional and non-blocking. Most members are unregistered, and
 * making a PAN a condition of taking work would exclude exactly the people a
 * labour cooperative exists to serve. An absent PAN simply produces a receipt
 * with no seller tax block — still a valid record of the payment.
 *
 * Formats are checked client-side for immediate feedback and again on the
 * server, which is the copy that counts. Nothing here is verified against a
 * government registry, and the copy says so.
 */
export default function TaxIdentityPanel({
  pan,
  gstin,
  sacCode,
}: {
  pan?: string;
  gstin?: string;
  sacCode?: string;
}) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const setTax = useMutation(api.artisans.setTaxIdentity);

  const [form, setForm] = useState({
    pan: pan ?? "",
    gstin: gstin ?? "",
    sacCode: sacCode ?? "",
  });

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await setTax({
        pan: form.pan.trim() || undefined,
        gstin: form.gstin.trim() || undefined,
        sacCode: form.sacCode.trim() || undefined,
      });
      setSaved(true);
    } catch {
      // surfaced by the Convex error toast
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Panel title={t("tax_title")} tag={t("tax_invoice_tag")}>
      <form onSubmit={handleSave} className="space-y-3 text-xs">
        <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          <BadgeIndianRupee className="mt-0.5 size-4 shrink-0 text-slate-400" />
          {t("tax_intro")}
        </p>

        <label className="block">
          <span className="tl-label">PAN</span>
          <input
            className="tl-input font-mono uppercase"
            value={form.pan}
            onChange={set("pan")}
            placeholder="ABCDE1234F"
            maxLength={10}
          />
        </label>

        <label className="block">
          <span className="tl-label">GSTIN</span>
          <input
            className="tl-input font-mono uppercase"
            value={form.gstin}
            onChange={set("gstin")}
            placeholder="29ABCDE1234F1Z5"
            maxLength={15}
          />
        </label>

        <label className="block">
          <span className="tl-label">{t("tax_sac")}</span>
          <input
            className="tl-input font-mono"
            value={form.sacCode}
            onChange={set("sacCode")}
            placeholder="998311"
            inputMode="numeric"
            maxLength={6}
          />
        </label>

        <TlButton type="submit" className="w-full" disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {saved ? t("tax_saved") : t("tax_save")}
        </TlButton>

        <p className="text-[10px] leading-relaxed text-slate-400">
          {t("tax_not_verified")}
        </p>
      </form>
    </Panel>
  );
}
