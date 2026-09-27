import { Link } from "react-router";
import { useCallback, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLang } from "@/lib/i18n";
import { getTrade, COLOR_SOFT } from "@/lib/trades";
import { AppHeader } from "@/components/AppHeader";
import { BackToHome } from "@/components/BackToHome";
import { MonoBadge, Panel, StatusDot, TlButton } from "@/components/terminal";
import FederationGISMap from "@/components/map/FederationGISMap";
import LocationPickerModal from "@/components/map/LocationPickerModal";
import {
  Loader2,
  ShieldAlert,
  Users,
  CalendarCheck,
  Wallet,
  HeartPulse,
  Map,
  BrainCircuit,
  ShieldCheck,
  Building2,
  CheckCircle2,
  XCircle,
  Plus,
  ScrollText,
  UserPlus,
  Camera,
  Hammer,
} from "lucide-react";

type TabId = "overview" | "gis" | "forecast" | "governance" | "skills" | "works" | "members" | "societies" | "welfare" | "disputes" | "audit";

const TABS: Array<{ id: TabId; label: string; icon: typeof Users }> = [
  { id: "overview", label: "Overview", icon: Users },
  { id: "gis", label: "GIS Command Map", icon: Map },
  { id: "forecast", label: "AI Forecast", icon: BrainCircuit },
  { id: "governance", label: "KYC Queue", icon: ShieldCheck },
  { id: "skills", label: "Skill Review", icon: Camera },
  { id: "works", label: "Work Listings", icon: Hammer },
  { id: "members", label: "Members", icon: UserPlus },
  { id: "societies", label: "District Societies", icon: Building2 },
  { id: "welfare", label: "Welfare & Dividend", icon: HeartPulse },
  { id: "disputes", label: "Disputes", icon: ShieldAlert },
  { id: "audit", label: "Security Audit", icon: ScrollText },
];

/* ── shared error surface ──
 *
 * Federation admins are now scoped to their own federation, so the server
 * legitimately refuses several of these actions ("Not in your federation",
 * "Only platform officers can manage federations"). A rejected mutation with
 * no catch is a silent no-op: the spinner stops and the officer is told
 * nothing. Every refusal is surfaced instead, using the same inline pattern
 * the rest of this console already uses.
 */
function useActionErrors() {
  const [actionError, setActionError] = useState<string | null>(null);
  const reportError = useCallback(
    (e: unknown, fallback: string) =>
      setActionError(e instanceof Error ? e.message : fallback),
    [],
  );
  return { actionError, setActionError, reportError };
}

/** Inline banner for a refused action. */
function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
    >
      {message}
    </p>
  );
}

export default function Admin() {
  const { t } = useLang();
  const overview = useQuery(api.admin.overview, {});
  const [tab, setTab] = useState<TabId>("overview");

  if (overview === undefined) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </main>
      </div>
    );
  }

  if (overview === null) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50">
            <ShieldAlert className="size-6 text-amber-700" />
          </span>
          <h1 className="mt-4 text-lg font-extrabold text-slate-900">
            {t("ad_no_access")}
          </h1>
          <Link to="/" className="mt-4 inline-block">
            <TlButton variant="outline">{t("nav_home")}</TlButton>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <BackToHome />
        <h1 className="mt-3 text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
          {t("ad_title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t("ad_sub")}</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5">
          <ShieldAlert className="size-3.5 text-amber-700" />
          <span className="text-[11px] font-bold text-amber-800">
            Demo admin session — this console is running on a demo account and
            can be removed at any time
          </span>
        </div>

        {/* Tab bar */}
        <div className="mt-5 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition ${
                tab === id
                  ? "bg-emerald-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "overview" && <OverviewPanel overview={overview} />}
          {tab === "gis" && <GISPanel />}
          {tab === "forecast" && <ForecastPanel />}
          {tab === "governance" && <GovernancePanel />}
          {tab === "skills" && <SkillReviewPanel />}
          {tab === "works" && <WorkListingsReviewPanel />}
          {tab === "members" && <MembersPanel />}
          {tab === "societies" && <SocietiesPanel />}
          {tab === "welfare" && <WelfarePanel />}
          {tab === "disputes" && <DisputesPanel />}
          {tab === "audit" && <AuditPanel />}
        </div>
      </main>
    </div>
  );
}

/* ── Overview tab ── */

function OverviewPanel({
  overview,
}: {
  overview: {
    workers: number;
    online: number;
    bookings: number;
    revenueSettled: number;
    welfarePool: number;
    workerPayouts?: number;
    opsPool?: number;
    byStatus: Record<string, number>;
    byTrade: Record<string, number>;
  };
}) {
  const { t } = useLang();
  const directory = useQuery(api.admin.workerDirectory, {});
  const bookings = useQuery(api.bookings.listForAdmin, {});
  const adminCancel = useMutation(api.admin.adminCancelBooking);
  const pipeline = Object.entries(overview.byStatus);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile icon={<Users className="size-3.5" />} label={t("ad_workers")} value={String(overview.workers)} />
        <StatTile icon={<StatusDot tone="ok" blink />} label={t("ad_online")} value={String(overview.online)} tone="ok" />
        <StatTile icon={<CalendarCheck className="size-3.5" />} label={t("ad_bookings")} value={String(overview.bookings)} />
        <StatTile icon={<Wallet className="size-3.5" />} label={t("ad_settled")} value={`₹${overview.revenueSettled.toLocaleString("en-IN")}`} />
        <StatTile icon={<HeartPulse className="size-3.5" />} label={t("ad_welfare")} value={`₹${overview.welfarePool.toLocaleString("en-IN")}`} tone="orange" />
      </div>

      {/* Cooperative revenue distribution — 90 / 7 / 3 */}
      <Panel title="Revenue distribution · 90 / 7 / 3" className="mt-5" bodyClassName="p-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-center">
            <p className="text-lg font-black text-emerald-800">
              ₹{(overview.workerPayouts ?? 0).toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
              Worker payouts · 90%
            </p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-3 text-center">
            <p className="text-lg font-black text-orange-800">
              ₹{overview.welfarePool.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wide">
              Welfare fund · 7%
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
            <p className="text-lg font-black text-slate-800">
              ₹{(overview.opsPool ?? 0).toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
              Operations · 3%
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Settled revenue ₹{overview.revenueSettled.toLocaleString("en-IN")} · workers receive 90% directly via UPI, 7% accrues to the cooperative welfare pool, 3% covers dispatch and verification costs.
        </p>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Panel title={t("ad_pipeline")} className="lg:col-span-2" bodyClassName="p-4">
          <div className="space-y-2.5">
            {pipeline.length === 0 && <p className="py-6 text-center text-xs text-slate-500">{t("bks_empty")}</p>}
            {pipeline.map(([status, count]) => (
              <div key={status} className="flex items-center justify-between gap-3">
                <MonoBadge tone={status === "cancelled" ? "neutral" : status === "settled" || status === "completed" ? "ok" : "saffron"}>
                  {t(`st_${status}`)}
                </MonoBadge>
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.round((count / Math.max(overview.bookings, 1)) * 100)}%` }} />
                  </div>
                  <span className="w-6 text-right text-xs font-bold text-slate-900">{count}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-dashed border-slate-200 pt-3">
            <p className="tl-label mb-2">by trade</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(overview.byTrade).map(([tr, count]) => (
                <MonoBadge key={tr} tone="neutral">{tr} · {count}</MonoBadge>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title={t("ad_directory")} className="lg:col-span-3" bodyClassName="p-0">
          <div className="max-h-[420px] overflow-y-auto">
            {(directory ?? []).map((a) => {
              const trade = getTrade(a.trade);
              const Icon = trade?.icon;
              return (
                <div key={a._id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${COLOR_SOFT[trade?.color ?? "ok"]}`}>
                    {Icon && <Icon className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">{a.fullName}</p>
                    <p className="truncate text-[11px] text-slate-500">{a.district} · {a.phone}</p>
                  </div>
                  <MonoBadge tone={a.kycStatus === "verified" ? "ok" : "warn"}>
                    {a.kycStatus === "verified" ? t("kyc_badge") : t("kyc_pending")}
                  </MonoBadge>
                  {a.credentialId && <span className="hidden text-[10px] font-semibold text-emerald-700 sm:inline">{a.credentialId}</span>}
                  <StatusDot tone={a.isOnline ? "ok" : "idle"} blink={a.isOnline} />
                </div>
              );
            })}
            {(directory ?? []).length === 0 && <p className="py-10 text-center text-xs text-slate-500">{t("myjobs_empty")}</p>}
          </div>
        </Panel>
      </div>

      <Panel title={t("ad_pipeline")} className="mt-5" bodyClassName="p-0">
        <div className="max-h-[480px] overflow-y-auto">
          {(bookings ?? []).map((b) => (
            <div key={b._id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
              <Link to={`/bookings/${b._id}`} className="min-w-0 flex-1 hover:underline">
                <p className="truncate text-xs font-bold text-slate-900">{b.serviceName}</p>
                <p className="truncate text-[11px] text-slate-500">{b.address.slice(0, 40)} · {new Date(b.scheduledFor).toLocaleDateString("en-IN")}</p>
              </Link>
              <MonoBadge tone={b.status === "cancelled" ? "neutral" : b.status === "settled" || b.status === "completed" ? "ok" : "saffron"}>
                {t(`st_${b.status}`)}
              </MonoBadge>
              <span className="text-xs font-bold text-slate-900">₹{b.total}</span>
              {!["completed", "settled", "cancelled"].includes(b.status) && (
                <button type="button" onClick={() => void adminCancel({ id: b._id }).catch(() => {})} className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100">
                  {t("ad_cancel")}
                </button>
              )}
            </div>
          ))}
          {(bookings ?? []).length === 0 && <p className="py-10 text-center text-xs text-slate-500">{t("bks_empty")}</p>}
        </div>
      </Panel>
    </>
  );
}

/* ── GIS Command Map tab ── */

function GISPanel() {
  const mapData = useQuery(api.gis.mapData, {});
  if (mapData === undefined) return <LoadingPlaceholder text="Loading map data…" />;
  if (mapData === null) return <LoadingPlaceholder text="Access denied" />;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <Map className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Federation GIS Command Map</h2>
          <p className="text-xs text-slate-500">
            Live artisan positions, active dispatches, and district society HQs
          </p>
        </div>
      </div>
      <FederationGISMap
        artisans={mapData.artisans}
        bookings={mapData.bookings}
        societies={mapData.societies}
        demandPoints={mapData.demandPoints}
        height="520px"
      />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<Users className="size-3.5" />} label="Total artisans" value={String(mapData.artisans.length)} />
        <StatTile icon={<StatusDot tone="ok" blink />} label="Online" value={String(mapData.artisans.filter((a: { isOnline: boolean }) => a.isOnline).length)} tone="ok" />
        <StatTile icon={<CalendarCheck className="size-3.5" />} label="Active dispatches" value={String(mapData.bookings.length)} />
        <StatTile icon={<Building2 className="size-3.5" />} label="Societies" value={String(mapData.societies.length)} tone="orange" />
      </div>
    </div>
  );
}

/* ── AI Forecast tab ── */

function ForecastPanel() {
  const latest = useQuery(api.forecasts.latest, {});
  const forecastAction = useAction(api.forecastAi.runForecast);
  const forecastBudget = useMutation(api.forecastThrottle.requestForecastRun);
  const [forecasting, setForecasting] = useState(false);
  const [forecast, setForecast] = useState<Awaited<
    ReturnType<typeof forecastAction>
  > | { error: string } | null>(null);
  const [kind, setKind] = useState<"forecast" | "stabilization">("forecast");

  async function runForecast() {
    setForecasting(true);
    try {
      // Spend the federation's forecast budget BEFORE the billable call, so an
      // over-budget officer is refused before Gemini is ever invoked.
      await forecastBudget({ kind });
      const result = await forecastAction({ kind });
      setForecast(result);
    } catch (e) {
      setForecast({ error: e instanceof Error ? e.message : "Forecast failed" });
    } finally {
      setForecasting(false);
    }
  }

  const display = forecast ?? latest;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <BrainCircuit className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Gemini AI Demand Forecast</h2>
            <p className="text-xs text-slate-500">Regional labor demand analysis & fair pricing intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "forecast" | "stabilization")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            <option value="forecast">Demand Forecast</option>
            <option value="stabilization">Fair Pricing Stabilization</option>
          </select>
          <TlButton onClick={() => void runForecast()} disabled={forecasting}>
            {forecasting ? <Loader2 className="size-4 animate-spin" /> : <BrainCircuit className="size-4" />}
            {forecasting ? "Analyzing…" : "Run analysis"}
          </TlButton>
        </div>
      </div>

      {display?.error && (
        <Panel className="border-amber-200 bg-amber-50" bodyClassName="p-4">
          <p className="text-xs font-bold text-amber-800">⚠ {display.error}</p>
          <p className="mt-1 text-[11px] text-amber-700">
            Add GOOGLE_API_KEY to the Convex environment to enable Gemini forecasting. Running with heuristic fallback.
          </p>
        </Panel>
      )}

      {display && !display.error && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel bodyClassName="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="tl-label">Demand Index</span>
              <span className={`text-2xl font-black ${display.demandIndex >= 70 ? "text-rose-700" : display.demandIndex >= 40 ? "text-amber-700" : "text-emerald-700"}`}>
                {display.demandIndex}/100
              </span>
            </div>
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${display.demandIndex >= 70 ? "bg-rose-600" : display.demandIndex >= 40 ? "bg-amber-500" : "bg-emerald-600"}`}
                style={{ width: `${display.demandIndex}%` }}
              />
            </div>
            {display.source && (
              <p className="text-[10px] text-slate-400">
                Source: {display.source} {display.model ? `(${display.model})` : ""}
                {display.createdAt ? ` · ${new Date(display.createdAt).toLocaleString("en-IN")}` : ""}
              </p>
            )}
          </Panel>

          <Panel title="Welfare Pool Allocation" bodyClassName="p-4">
            <span className="text-2xl font-black text-orange-800">{display.welfarePoolAllocation}%</span>
            <p className="mt-1 text-xs text-slate-500">Recommended welfare reserve allocation of transaction revenue</p>
          </Panel>

          <Panel title="Price Recommendation" bodyClassName="p-4">
            <p className="text-sm font-bold text-slate-900">{display.priceRecommendation}</p>
          </Panel>

          <Panel title="Deficit Trades" bodyClassName="p-4">
            {display.primaryDeficitTrades?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {display.primaryDeficitTrades.map((tr: string) => (
                  <MonoBadge key={tr} tone="warn">{tr}</MonoBadge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No critical shortages detected across trades</p>
            )}
          </Panel>

          <Panel title="Actionable Advisories" className="lg:col-span-2" bodyClassName="p-4">
            <ol className="space-y-2">
              {display.advisories?.map((ad: string, i: number) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">
                    {i + 1}
                  </span>
                  {ad}
                </li>
              ))}
            </ol>
          </Panel>

          {display.summary && (
            <Panel className="lg:col-span-2" bodyClassName="p-4">
              <p className="text-sm leading-relaxed text-slate-600">{display.summary}</p>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Governance KYC Queue tab ── */

function GovernancePanel() {
  const queue = useQuery(api.admin.verificationQueue, {});
  const reviewKyc = useMutation(api.admin.reviewKyc);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { actionError, setActionError } = useActionErrors();

  async function handleReview(artisanId: Id<"artisans">, approve: boolean) {
    setBusyId(artisanId);
    try {
      await reviewKyc({ artisanId, approve });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not review this worker");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white">            <ShieldCheck className="size-4" />
        </span>
        <ActionError message={actionError} />
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Artisan Verification Queue</h2>
          <p className="text-xs text-slate-500">Review identity documents and approve artisan registrations</p>
        </div>
      </div>

      <Panel bodyClassName="p-0">
        <div className="max-h-[500px] overflow-y-auto">
          {queue === undefined && <LoadingPlaceholder text="Loading queue…" />}
          {queue && queue.length === 0 && (
            <div className="py-12 text-center">
              <CheckCircle2 className="mx-auto size-8 text-emerald-400" />
              <p className="mt-2 text-sm font-bold text-slate-600">All clear — no pending verifications</p>
              <p className="mt-1 text-xs text-slate-400">New artisan KYC submissions will appear here</p>
            </div>
          )}
          {queue?.map((a) => {
            const trade = getTrade(a.trade);
            const isBusy = busyId === a._id;
            return (
              <div key={a._id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${COLOR_SOFT[trade?.color ?? "ok"]}`}>
                  {trade?.icon && <trade.icon className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">{a.fullName}</p>
                  <p className="text-[11px] text-slate-500">
                    {a.trade} · {a.district} · {a.idType?.toUpperCase()} ****{a.idLast4}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    📞 {a.phone} · {a.experienceYears}yr exp · ₹{a.dailyRate}/day
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleReview(a._id, true)}
                    disabled={isBusy}
                    className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReview(a._id, false)}
                    disabled={isBusy}
                    className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    <XCircle className="size-3" />
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ── District Societies Registration tab ── */

function SocietiesPanel() {
  const societies = useQuery(api.societies.listForAdmin, {});
  const register = useMutation(api.societies.register);
  const review = useMutation(api.societies.review);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("Telangana");
  const [jurisdiction, setJurisdiction] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [hq, setHq] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { actionError, setActionError } = useActionErrors();

  async function handleRegister() {
    if (!name.trim() || !district.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await register({
        name: name.trim(),
        district: district.trim(),
        state,
        jurisdiction: jurisdiction.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        lat: hq?.lat,
        lng: hq?.lng,
        address: hq?.address,
      });
      setName("");
      setDistrict("");
      setJurisdiction("");
      setContactPhone("");
      setHq(null);
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleSocietyReview(id: Id<"societies">, status: string) {
    try {
      await review({ id, status });
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not update this federation",
      );
    }
  }

  const STATES = ["Telangana", "Andhra Pradesh", "Karnataka", "Tamil Nadu", "Kerala", "Maharashtra", "Delhi", "West Bengal", "Uttar Pradesh", "Gujarat", "Rajasthan"];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <ActionError message={actionError} />
            <Building2 className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">District Cooperative Societies</h2>
            <p className="text-xs text-slate-500">Register and manage district cooperative society charters</p>
          </div>
        </div>
        <TlButton onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : <><Plus className="size-3.5" /> Register new society</>}
        </TlButton>
      </div>

      {showForm && (
        <Panel className="mb-5" title="New Society Registration" bodyClassName="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Society name</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Secunderabad Electrical Workers Co-op" />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">District</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Secunderabad" />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">State</label>
              <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20" value={state} onChange={(e) => setState(e.target.value)}>
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Jurisdiction (optional)</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="e.g. Secunderabad, Malkajgiri mandals" />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Branch secretary phone (optional)</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="e.g. +91 98XXXXXX21" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Headquarters location</label>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm transition hover:border-emerald-400"
              >
                <Map className="size-4 shrink-0 text-emerald-600" />
                <span className="truncate text-slate-700">
                  {hq ? hq.address : "Pin the society HQ on the map…"}
                </span>
                {hq && (
                  <span className="ml-auto shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                    {hq.lat.toFixed(4)}, {hq.lng.toFixed(4)}
                  </span>
                )}
              </button>
            </div>
          </div>
          <LocationPickerModal
            open={pickerOpen}
            initialLat={hq?.lat}
            initialLng={hq?.lng}
            onConfirm={(loc) => {
              setHq({ lat: loc.lat, lng: loc.lng, address: loc.address });
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
          <div className="mt-3 flex justify-end">
            <TlButton onClick={() => void handleRegister()} disabled={busy || !name.trim() || !district.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Register society
            </TlButton>
          </div>
        </Panel>
      )}

      <Panel bodyClassName="p-0">
        <div className="max-h-[500px] overflow-y-auto">
          {societies === undefined && <LoadingPlaceholder text="Loading societies…" />}
          {societies && societies.length === 0 && (
            <div className="py-12 text-center">
              <Building2 className="mx-auto size-8 text-slate-300" />
              <p className="mt-2 text-sm font-bold text-slate-600">No societies registered yet</p>
              <p className="mt-1 text-xs text-slate-400">Register the first district cooperative society above</p>
            </div>
          )}
          {societies?.map((s) => (
            <div key={s._id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700">
                <Building2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900">{s.name}</p>
                <p className="text-[11px] text-slate-500">
                  {s.code} · {s.district}, {s.state} · {s.registrationNo}
                </p>
                <p className="text-[11px] text-slate-500">
                  {s.memberCount} artisan members
                </p>
              </div>
              <MonoBadge tone={s.status === "active" ? "ok" : s.status === "pending" ? "warn" : "neutral"}>
                {s.status}
              </MonoBadge>
              {s.status === "pending" && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleSocietyReview(s._id, "active")}
                    className="flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="size-3" /> Charter
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSocietyReview(s._id, "rejected")}
                    className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100"
                  >
                    <XCircle className="size-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ── Welfare & Dividend Settlement Ledger tab ── */

function WelfarePanel() {
  const overview = useQuery(api.admin.overview, {});
  const ledger = useQuery(api.admin.earningsLedger, {});
  const [dividendRate, setDividendRate] = useState(10);

  if (overview === undefined || ledger === undefined) {
    return <LoadingPlaceholder text="Loading cooperative ledger…" />;
  }

  const totalEarnings = ledger.reduce((s, e) => s + e.earnings, 0);
  const surplus = overview.welfarePool;
  const dividendPool = Math.round((surplus * dividendRate) / 100);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <StatTile
          icon={<Wallet className="size-3.5" />}
          label="Gross volume · 0% platform fee"
          value={`₹${overview.revenueSettled.toLocaleString("en-IN")}`}
        />
        <StatTile
          icon={<HeartPulse className="size-3.5" />}
          label="Cooperative welfare reserve (7%)"
          value={`₹${overview.welfarePool.toLocaleString("en-IN")}`}
          tone="orange"
        />
        <StatTile
          icon={<Users className="size-3.5" />}
          label="Operations reserve (3%)"
          value={`₹${(overview.opsPool ?? 0).toLocaleString("en-IN")}`}
        />
      </div>

      <Panel
        title="Annual patronage dividend calculator"
        className=""
        bodyClassName="p-4"
      >
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Surplus share returned to members (%)
            </label>
            <input
              type="range"
              min={0}
              max={50}
              value={dividendRate}
              onChange={(e) => setDividendRate(Number(e.target.value))}
              className="w-48 accent-emerald-600"
            />
            <p className="text-xs font-bold text-slate-900">{dividendRate}%</p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-center">
            <p className="text-xl font-black text-orange-800">
              ₹{dividendPool.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700">
              Dividend pool (from welfare surplus)
            </p>
          </div>
          <p className="max-w-xs text-[11px] leading-relaxed text-slate-500">
            Distributed pro-rata by each artisan's verified service volume and
            customer ratings. Zero-commission policy untouched — the pool comes
            only from the welfare surplus.
          </p>
        </div>
      </Panel>

      <Panel title="Per-artisan earnings ledger" bodyClassName="p-0">
        <div className="max-h-[420px] overflow-y-auto">
          {ledger.length === 0 && (
            <p className="py-10 text-center text-xs text-slate-500">
              No settled bookings yet — the ledger fills as jobs complete.
            </p>
          )}
          {ledger.map((e) => (
            <div
              key={e.artisanId}
              className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900">{e.name}</p>
                <p className="text-[11px] text-slate-500">{e.trade}</p>
              </div>
              <MonoBadge tone="neutral">{e.jobs} jobs</MonoBadge>
              <span className="text-xs font-bold text-emerald-800">
                ₹{e.earnings.toLocaleString("en-IN")}
              </span>
              <span className="hidden text-[11px] font-semibold text-orange-700 sm:inline">
                +₹{e.welfare.toLocaleString("en-IN")} welfare
              </span>
            </div>
          ))}
        </div>
        {ledger.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
            Total direct worker earnings: ₹{totalEarnings.toLocaleString("en-IN")}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ── Dispute Arbitration tab ── */

const DISPUTE_CATEGORIES: Record<string, string> = {
  late: "Late arrival",
  quality: "Poor craftsmanship",
  unsafe: "Unsafe work",
  payment: "Payment dispute",
  behavior: "Misconduct",
  other: "Other",
};

function DisputesPanel() {
  const disputes = useQuery(api.disputes.listForAdmin, {});
  const resolve = useMutation(api.disputes.resolve);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { actionError, setActionError } = useActionErrors();

  async function handleResolve(
    id: Id<"disputes">,
    status: "resolved" | "dismissed" | "blacklisted",
  ) {
    setBusyId(id);
    try {
      await resolve({ id, status, resolution: notes[id] });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not resolve this dispute");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-rose-600 text-white">
          <ShieldAlert className="size-4" />
          <ActionError message={actionError} />
        </span>
        <div>
          <h2 className="text-base font-extrabold text-slate-900">
            Dispute Arbitration Board
          </h2>
          <p className="text-xs text-slate-500">
            Double-blind flags from customers and artisans — arbitrate fairly or blacklist abuse
          </p>
        </div>
      </div>

      <Panel bodyClassName="p-0">
        <div className="max-h-[560px] overflow-y-auto">
          {disputes === undefined && <LoadingPlaceholder text="Loading disputes…" />}
          {disputes && disputes.length === 0 && (
            <div className="py-12 text-center">
              <CheckCircle2 className="mx-auto size-8 text-emerald-400" />
              <p className="mt-2 text-sm font-bold text-slate-600">No disputes filed</p>
              <p className="mt-1 text-xs text-slate-400">
                Flags raised by customers or workers will appear here
              </p>
            </div>
          )}
          {disputes?.map((d) => (
            <div key={d._id} className="border-b border-slate-100 px-4 py-3 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <MonoBadge tone={d.raisedByRole === "customer" ? "saffron" : "ok"}>
                  {d.raisedByRole === "customer" ? "Customer flag" : "Artisan flag"}
                </MonoBadge>
                <MonoBadge tone="warn">{DISPUTE_CATEGORIES[d.category] ?? d.category}</MonoBadge>
                <MonoBadge
                  tone={
                    d.status === "open" ? "warn" : d.status === "blacklisted" ? "neutral" : "ok"
                  }
                >
                  {d.status}
                </MonoBadge>
                <Link
                  to={`/bookings/${d.bookingId}`}
                  className="ml-auto text-[11px] font-semibold text-emerald-700 hover:underline"
                >
                  View booking →
                </Link>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-700">{d.details}</p>
              {d.status === "open" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 transition focus:border-emerald-500 focus:bg-white focus:outline-none"
                    placeholder="Arbitration note (optional)…"
                    value={notes[d._id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [d._id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => void handleResolve(d._id, "resolved")}
                    disabled={busyId === d._id}
                    className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Resolve for raiser
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleResolve(d._id, "dismissed")}
                    disabled={busyId === d._id}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleResolve(d._id, "blacklisted")}
                    disabled={busyId === d._id}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    Blacklist
                  </button>
                </div>
              ) : (
                d.resolution && (
                  <p className="mt-1.5 text-[11px] italic text-slate-500">
                    Board note: {d.resolution}
                  </p>
                )
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ── Security Audit tab ── */

function AuditPanel() {
  const log = useQuery(api.admin.auditLog, {});
  if (log === undefined) return <LoadingPlaceholder text="Loading audit ledger…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-white">
          <ScrollText className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Federation Security Ledger</h2>
          <p className="text-xs text-slate-500">
            Every board clearance attempt and privileged action, append-only.
          </p>
        </div>
      </div>

      <Panel title="Recent events" bodyClassName="p-0">
        <div className="max-h-[520px] overflow-y-auto">
          {log.length === 0 && (
            <p className="py-10 text-center text-xs text-slate-500">No security events recorded yet.</p>
          )}
          {log.map((e) => (
            <div key={e._id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${
                  e.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                }`}
              >
                {e.ok ? "✓" : "✕"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900">{e.detail ?? e.kind}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {e.actor} · {e.kind}
                  {e.method ? ` (${e.method})` : ""} · {new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
              <MonoBadge tone={e.ok ? "ok" : "warn"}>{e.ok ? "OK" : "DENIED"}</MonoBadge>
            </div>
          ))}
        </div>
      </Panel>

      <p className="text-[11px] text-slate-400">
        Hardening in place: 5 wrong passcodes lock clearance for 10 minutes; guest sessions are
        refused the emergency passcode path; all privileged actions (KYC review, booking cancellation,
        clearance grant/deny) are written to this append-only ledger.
      </p>
    </div>
  );
}

/* ── Skill Review tab ── */

function SkillReviewPanel() {
  const queue = useQuery(api.workSamples.reviewQueue, {});
  const reviewSample = useMutation(api.workSamples.reviewSample);
  const reviewKyc = useMutation(api.workSamples.reviewKycFromSkillTab);
  const [busy, setBusy] = useState<string | null>(null);
  const { actionError, setActionError } = useActionErrors();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);

  if (queue === undefined) return <LoadingPlaceholder text="Loading work evidence…" />;

  async function decide(sampleId: Id<"workSamples">, approve: boolean) {
    setBusy(sampleId);
    try {
      // The note field is shared across rows; send it only for the row being
      // decided (reject requires it, approve treats it as optional praise).
      await reviewSample({ sampleId, approve, note: note || undefined });
      setNote("");
      setRejecting(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <ActionError message={actionError} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile icon={<Camera className="size-3.5" />} label="Samples awaiting review" value={String(queue.length)} tone="orange" />
        <StatTile icon={<ShieldCheck className="size-3.5" />} label="With KYC pending too" value={String(queue.filter((q) => q.kycStatus !== "verified").length)} />
        <StatTile icon={<CheckCircle2 className="size-3.5" />} label="Ready for full verification" value={String(queue.filter((q) => q.kycStatus === "verified").length)} tone="ok" />
      </div>

      {queue.length === 0 && (
        <Panel title="Skill verification queue" bodyClassName="p-0">
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Camera className="size-8 text-emerald-400" />
            <p className="text-sm font-bold text-slate-600">No work samples awaiting review</p>
            <p className="text-xs text-slate-400">Workers upload photos of their work from onboarding — they appear here for verification.</p>
          </div>
        </Panel>
      )}

      {queue.length > 0 && (
        <Panel title={`Work evidence awaiting review (${queue.length})`} bodyClassName="p-0">
          <div className="divide-y divide-slate-100">
            {queue.map((s) => (
              <div key={s._id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row">
                {/* Thumbnail */}
                <button
                  type="button"
                  onClick={() => setZoom(s.url)}
                  className="group relative h-40 w-full shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:w-56"
                >
                  {s.url && <img src={s.url} alt={s.caption ?? "work sample"} className="size-full object-cover transition group-hover:scale-105" />}
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-slate-900/70 px-1.5 py-0.5 text-[9px] font-bold text-white">tap to zoom</span>
                </button>

                {/* Details + actions */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-black text-slate-900">{s.fullName}</p>
                    <MonoBadge tone="neutral">{s.trade}</MonoBadge>
                    <span className="text-[11px] text-slate-500">{s.district} · 📞 {s.phone}</span>
                    <MonoBadge tone={s.kycStatus === "verified" ? "ok" : "warn"}>
                      KYC: {s.kycStatus}
                    </MonoBadge>
                  </div>
                  {s.caption && <p className="mt-1 text-[11px] italic text-slate-500">“{s.caption}”</p>}
                  <p className="mt-0.5 text-[10px] text-slate-400">Uploaded {new Date(s.uploadedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>

                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Review note (sent to the worker on reject; optional on approve)…"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === s._id}
                      onClick={() => void decide(s._id, true)}
                      className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy === s._id ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                      Verify skill {s.kycStatus === "verified" ? "+ issue credential" : ""}
                    </button>
                    <button
                      type="button"
                      disabled={busy === s._id}
                      onClick={() => setRejecting(rejecting === s._id ? null : s._id)}
                      className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    >
                      <XCircle className="size-3" /> Reject
                    </button>
                    {s.kycStatus === "pending" && (
                      <button
                        type="button"
                        disabled={busy === s._id}
                        onClick={() =>
                          void reviewKyc({ artisanId: s.artisanId, approve: true }).catch(
                            (e) =>
                              setActionError(
                                e instanceof Error
                                  ? e.message
                                  : "Could not verify KYC",
                              ),
                          )
                        }
                        className="flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <ShieldCheck className="size-3" /> Also verify KYC
                      </button>
                    )}
                  </div>
                  {rejecting === s._id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2">
                      <p className="text-[10px] font-bold text-rose-800">Confirm rejection — the note above is sent to the worker:</p>
                      <button
                        type="button"
                        disabled={busy === s._id}
                        onClick={() => void decide(s._id, false)}
                        className="rounded-xl bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
                      >
                        Reject & notify worker
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-6" onClick={() => setZoom(null)}>
          <img src={zoom} alt="work sample full view" className="max-h-full max-w-full rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

/* ── Work listings tab — worker-created work awaiting board approval ── */

function WorkListingsReviewPanel() {
  const { t } = useLang();
  const queue = useQuery(api.customServices.reviewQueue, {});
  const review = useMutation(api.customServices.review);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (queue === undefined) return <LoadingPlaceholder text="Loading worker work listings…" />;

  async function decide(serviceId: Id<"customServices">, approve: boolean) {
    setBusy(serviceId);
    setError(null);
    try {
      await review({ serviceId, approve, note: notes[serviceId] || undefined });
    } catch (e) {
      setError(
        e instanceof Error ? e.message.replace(/^\[CONVEX[^\]]*\]\s*/, "") : "Review failed",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-slate-600">
        {t("wc_review_sub")}
      </p>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          {error}
        </p>
      )}

      {queue.length === 0 ? (
        <Panel title={t("wc_review_title")} bodyClassName="p-0">
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Hammer className="size-8 text-emerald-400" />
            <p className="text-sm font-bold text-slate-600">{t("wc_review_empty")}</p>
          </div>
        </Panel>
      ) : (
        <Panel title={`${t("wc_review_title")} (${queue.length})`} bodyClassName="p-0">
          <div className="divide-y divide-slate-100">
            {queue.map((w) => (
              <div key={w._id} className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-black text-slate-900">{w.fullName}</p>
                  <MonoBadge tone="neutral">{w.trade}</MonoBadge>
                  <span className="text-[11px] text-slate-500">{w.district}</span>
                  {w.isCustomCategory && (
                    <MonoBadge tone="saffron">✦ {t("wc_own_category")}: {w.category}</MonoBadge>
                  )}
                  <MonoBadge tone={w.kycStatus === "verified" ? "ok" : "warn"}>
                    KYC: {w.kycStatus}
                  </MonoBadge>
                  <MonoBadge tone={w.skillStatus === "verified" ? "ok" : "warn"}>
                    {t("br_skill")}: {w.skillStatus}
                  </MonoBadge>
                </div>

                <p className="mt-1.5 text-sm font-bold text-slate-900">{w.name}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600 italic">
                  “{w.description}”
                </p>
                <p className="mt-1 text-[11px] font-semibold text-slate-700">
                  ₹{w.base} {t("sv_base")}
                  {w.hourly > 0 ? ` + ₹${w.hourly} ${t("sv_hourly")}` : ""}
                  {w.urgent ? ` · ${t("sv_urgent")}` : ""}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {new Date(w.createdAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>

                <input
                  value={notes[w._id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [w._id]: e.target.value }))}
                  placeholder={t("wc_note")}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
                />

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === w._id}
                    onClick={() => void decide(w._id, true)}
                    className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === w._id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3" />
                    )}
                    {t("wc_approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busy === w._id}
                    onClick={() => void decide(w._id, false)}
                    className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    <XCircle className="size-3" />
                    {t("wc_reject")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ── Members tab ── */

function MembersPanel() {
  const members = useQuery(api.admin.memberList, {});
  const removedWorkers = useQuery(api.admin.removedWorkers, {});
  const [addTarget, setAddTarget] = useState<{ _id: Id<"users">; email?: string; name?: string } | null>(null);
  const [removing, setRemoving] = useState<{ artisanId: Id<"artisans">; name: string } | null>(null);

  if (members === undefined) return <LoadingPlaceholder text="Loading member registry…" />;

  const real = members.filter((m) => !m.isAnonymous);
  const guests = members.length - real.length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={<UserPlus className="size-3.5" />} label="Total accounts" value={String(members.length)} />
        <StatTile icon={<Users className="size-3.5" />} label="Signed-up members" value={String(real.length)} tone="ok" />
        <StatTile
          icon={<ShieldCheck className="size-3.5" />}
          label="Workers onboarded"
          value={String(real.filter((m) => m.workerId).length)}
        />
        <StatTile icon={<ShieldAlert className="size-3.5" />} label="Guest sessions" value={String(guests)} />
      </div>

      <Panel title="Member registry — every account created on the platform" bodyClassName="p-0">
        <div className="max-h-[560px] overflow-y-auto">
          {real.length === 0 && (
            <p className="py-10 text-center text-xs text-slate-500">No signed-up members yet.</p>
          )}
          {real.map((m) => (
            <div key={m._id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black uppercase text-slate-600">
                {(m.name || m.email || "?").charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900">
                  {m.name || m.email?.split("@")[0] || "Member"}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {m.email || "no email"} · joined {new Date(m.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </p>
              </div>
              {m.workerId ? (
                <>
                  <MonoBadge tone={m.kycStatus === "verified" ? "ok" : "warn"}>
                    worker · {m.workerTrade}
                  </MonoBadge>
                  <button
                    type="button"
                    onClick={() => setRemoving({ artisanId: m.workerId!, name: m.workerName || m.name || m.email || "worker" })}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <MonoBadge tone="neutral">customer</MonoBadge>
                  <button
                    type="button"
                    onClick={() => setAddTarget({ _id: m._id, email: m.email, name: m.name })}
                    className="flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <UserPlus className="size-3" /> Add as worker
                  </button>
                </>
              )}
              {m.role === "admin" && <MonoBadge tone="saffron">admin</MonoBadge>}
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          Everyone who signs in creates an account here automatically. Signing up alone does not create a worker
          listing — use “Add as worker” to register a member, or complete onboarding at /onboarding. Removed workers
          appear below with their removal note; the worker is notified in their hub either way.
        </div>
      </Panel>

      {removedWorkers && removedWorkers.length > 0 && (
        <Panel title={`Removed workers (${removedWorkers.length})`} bodyClassName="p-0">
          <div className="max-h-[300px] overflow-y-auto">
            {removedWorkers.map((w) => (
              <div key={w._id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-[11px] font-black uppercase text-rose-600">
                  {w.fullName.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">{w.fullName} · {w.trade}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    Removed {w.removedAt ? new Date(w.removedAt).toLocaleDateString("en-IN", { dateStyle: "medium" }) : ""} · {w.removalNote || "No note"}
                  </p>
                </div>
                <MonoBadge tone="neutral">removed</MonoBadge>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {addTarget && (
        <AddWorkerDialog
          target={addTarget}
          onClose={() => setAddTarget(null)}
          onDone={() => setAddTarget(null)}
        />
      )}
      {removing && (
        <RemoveWorkerDialog
          target={removing}
          onClose={() => setRemoving(null)}
          onDone={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

/* ── Add worker dialog (admin registers a member as worker + notifies) ── */

const TRADE_OPTIONS = ["electrician", "plumber", "carpenter", "mason", "painter", "appliance"];

function AddWorkerDialog({
  target,
  onClose,
  onDone,
}: {
  target: { _id: Id<"users">; email?: string; name?: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const addWorker = useMutation(api.workerAdmin.addWorker);
  const [fullName, setFullName] = useState(target.name || target.email?.split("@")[0] || "");
  const [phone, setPhone] = useState("");
  const [trade, setTrade] = useState(TRADE_OPTIONS[0]);
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("Andhra Pradesh");
  const [experienceYears, setExperienceYears] = useState(1);
  const [dailyRate, setDailyRate] = useState(500);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await addWorker({
        userId: target._id,
        fullName,
        phone,
        trade,
        district,
        state,
        experienceYears,
        dailyRate,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add worker");
      setBusy(false);
    }
  }

  const valid = fullName.trim().length > 1 && phone.trim().length >= 10 && district.trim().length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-600 text-white"><UserPlus className="size-4" /></span>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Register member as worker</h2>
              <p className="text-[11px] text-slate-500">{target.email || target.name} — they'll be notified in their hub</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <Field label="Full name" value={fullName} onChange={setFullName} placeholder="e.g. Ramesh Kumar" />
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="10-digit mobile" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Trade</label>
              <select value={trade} onChange={(e) => setTrade(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-emerald-500 focus:bg-white focus:outline-none">
                {TRADE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Field label="District" value={district} onChange={setDistrict} placeholder="e.g. Kurnool" />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">State</label>
            <select value={state} onChange={(e) => setState(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-emerald-500 focus:bg-white focus:outline-none">
              {["Andhra Pradesh", "Telangana", "Karnataka", "Tamil Nadu", "Kerala", "Maharashtra", "Delhi", "West Bengal", "Uttar Pradesh", "Gujarat", "Rajasthan"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Experience (years)</label>
              <input type="number" min={0} max={60} value={experienceYears} onChange={(e) => setExperienceYears(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-emerald-500 focus:bg-white focus:outline-none" />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Daily rate (₹)</label>
              <input type="number" min={0} step={50} value={dailyRate} onChange={(e) => setDailyRate(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-emerald-500 focus:bg-white focus:outline-none" />
            </div>
          </div>
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          <button type="button" disabled={!valid || busy} onClick={() => void submit()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50">
            {busy && <Loader2 className="size-4 animate-spin" />}
            Add worker &amp; send notification
          </button>
          <p className="text-center text-[10px] text-slate-400">KYC starts as pending — the worker completes verification and the skill quiz in their hub.</p>
        </div>
      </div>
    </div>
  );
}

/* ── Remove worker dialog (soft delete + notification) ── */

function RemoveWorkerDialog({
  target,
  onClose,
  onDone,
}: {
  target: { artisanId: Id<"artisans">; name: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const removeWorker = useMutation(api.workerAdmin.removeWorker);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await removeWorker({ artisanId: target.artisanId, note });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove worker");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-rose-600 text-white"><XCircle className="size-4" /></span>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Remove worker from federation</h2>
              <p className="text-[11px] text-slate-500">{target.name} — they'll be notified with your reason</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Reason (sent to the worker)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Repeated quality complaints from customers" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
            Their profile is deactivated (off the dispatch radar and public directory), any active jobs are cancelled, and booking history is preserved.
          </p>
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          <button type="button" disabled={busy} onClick={() => void submit()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 active:scale-95 disabled:opacity-50">
            {busy && <Loader2 className="size-4 animate-spin" />}
            Remove worker &amp; send notification
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
    </div>
  );
}

function StatTile({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; tone?: "neutral" | "ok" | "orange" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-center gap-1.5">
        <span className={tone === "ok" ? "text-emerald-600" : tone === "orange" ? "text-orange-600" : "text-slate-400"}>{icon}</span>
        <span className="tl-label">{label}</span>
      </div>
      <p className={`mt-1.5 text-xl font-black tracking-tight ${tone === "ok" ? "text-emerald-800" : tone === "orange" ? "text-orange-800" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function LoadingPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center gap-2">
      <Loader2 className="size-5 animate-spin text-slate-400" />
      <span className="text-sm text-slate-400">{text}</span>
    </div>
  );
}
