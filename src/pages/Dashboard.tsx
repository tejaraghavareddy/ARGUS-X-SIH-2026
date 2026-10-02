import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Link } from "react-router";
import { BackToHome } from "@/components/BackToHome";
import SlotEditor from "@/components/SlotEditor";
import DemandOutlook from "@/components/DemandOutlook";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
import { getTrade } from "@/lib/trades";
import { stopSpeaking } from "@/lib/speech";
import { haversine, formatDistance, estimateEtaMinutes } from "@/lib/geo";
import {
  LanguagePicker,
  MonoBadge,
  Panel,
  SectionHeader,
  StatusDot,
  TlButton,
} from "@/components/terminal";
import { IdCardDialog } from "@/components/IdCardDialog";
import ForecastCard from "@/components/ForecastCard";
import WorkListingsPanel from "@/components/WorkListingsPanel";
import InsuranceClaimPanel from "@/components/InsuranceClaimPanel";
import {
  Loader2,
  LogOut,
  Navigation,
  Radio,
  Radar,
  Briefcase,
  HandHeart,
  HandCoins,
  Bell,
  UserPlus,
  UserMinus,
  CheckCheck,
} from "lucide-react";

const STATUS_TONE: Record<string, "neutral" | "ok" | "warn" | "saffron"> = {
  pending: "warn",
  accepted: "saffron",
  enroute: "saffron",
  inprogress: "saffron",
  payment: "warn",
  completed: "ok",
  settled: "ok",
  cancelled: "neutral",
};

export default function Dashboard() {
  const { t } = useLang();
  const { isLoading: authLoading, signOut } = useAuth();
  const artisan = useQuery(api.artisans.getMyArtisan, {});
  const jobs = useQuery(api.bookings.listForWorker, {});
  const notifications = useQuery(api.workerAdmin.myNotifications, {});
  const unread = useQuery(api.workerAdmin.unreadCount, {});
  const markAllRead = useMutation(api.workerAdmin.markAllRead);
  const setPresence = useMutation(api.artisans.setPresence);
  const acceptJob = useMutation(api.bookings.accept);
  const advance = useMutation(api.bookings.advance);
  const [showNotifs, setShowNotifs] = useState(false);

  const [geoError, setGeoError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [busyAdvance, setBusyAdvance] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => () => stopSpeaking(), []);

  /* GPS telemetry ping while online */
  useEffect(() => {
    if (!artisan?.isOnline) return;
    let cancelled = false;
    const ping = () => {
      if (!("geolocation" in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          void setPresence({
            isOnline: true,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setGeoError(null);
        },
        () => {
          if (!cancelled) setGeoError(t("telemetry_err"));
        },
        { enableHighAccuracy: true, maximumAge: 15000 },
      );
    };
    ping();
    const timer = setInterval(ping, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artisan?.isOnline]);

  async function toggleOnline(next: boolean) {
    setToggling(true);
    setGeoError(null);
    try {
      if (next && "geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await setPresence({
              isOnline: true,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            setToggling(false);
          },
          async () => {
            await setPresence({ isOnline: true });
            setGeoError(t("telemetry_err"));
            setToggling(false);
          },
          { enableHighAccuracy: true, timeout: 8000 },
        );
      } else {
        await setPresence({ isOnline: next });
        setToggling(false);
      }
    } catch {
      setToggling(false);
    }
  }

  async function handleAccept(id: Id<"bookings">) {
    setAccepting(id);
    setAcceptError(null);
    try {
      await acceptJob({ id });
    } catch (e) {
      setAcceptError(
        e instanceof Error
          ? e.message
          : "Could not accept this job — please try again.",
      );
    } finally {
      setAccepting(null);
    }
  }

  async function handleAdvance(id: Id<"bookings">) {
    setBusyAdvance(id);
    setAcceptError(null);
    try {
      await advance({ id });
    } catch (e) {
      setAcceptError(
        e instanceof Error ? e.message : "Could not update the job stage.",
      );
    } finally {
      setBusyAdvance(null);
    }
  }

  async function handleSignOut() {
    stopSpeaking();
    if (artisan?.isOnline) {
      try {
        await setPresence({ isOnline: false });
      } catch {
        /* ignore */
      }
    }
    await signOut();
    window.location.href = "/";
  }

  if (authLoading || artisan === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </main>
    );
  }

  const online = artisan?.isOnline ?? false;

  function offerDistance(b: { lat?: number; lng?: number }) {
    if (!artisan?.lat || !artisan?.lng || b.lat === undefined || b.lng === undefined)
      return null;
    return haversine(artisan.lat!, artisan.lng!, b.lat, b.lng);
  }

  function openExternalMaps(b: { lat?: number; lng?: number; address: string }) {
    if (b.lat !== undefined && b.lng !== undefined) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}&travelmode=driving`,
        "_blank",
        "noopener",
      );
    } else {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`,
        "_blank",
        "noopener",
      );
    }
  }
  const trade = artisan ? getTrade(artisan.trade) : undefined;
  const TradeIcon = trade?.icon;
  const mine = jobs?.mine ?? [];
  const radar = jobs?.radar ?? [];
  const jobDone = mine.filter(
    (b) => b.status === "settled" || b.status === "completed",
  );
  const earned = jobDone.reduce((sum, b) => sum + b.workerShare, 0);
  const verified = artisan?.kycStatus === "verified" && artisan?.quizPassed;

  const stageKeys: Record<string, string> = {
    accepted: "st_enroute",
    enroute: "st_inprogress",
    inprogress: "st_payment",
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-800 text-white">
              <HandHeart className="size-4" />
            </span>
            <span className="text-sm font-bold text-slate-900">
              Sahakar Seva
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/welfare"
              className="hidden items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 sm:inline-flex"
            >
              <HandCoins className="size-3.5" />
              {t("wf_title")}
            </Link>
            <LanguagePicker />
            <TlButton variant="ghost" onClick={handleSignOut}>
              <LogOut className="size-4" />
            </TlButton>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
        <BackToHome />
      </div>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        {/* Greeting + presence */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeader
            title={t("hub_title")}
            sub={
              artisan
                ? t("hub_welcome", { name: artisan.fullName })
                : t("hub_not_onboarded")
            }
          />
          {artisan && (
            <div className="flex items-center gap-2">
              <MonoBadge tone={online ? "ok" : "neutral"}>
                <StatusDot tone={online ? "ok" : "idle"} blink={online} />
                {online ? t("status_online") : t("status_offline")}
              </MonoBadge>
              <TlButton
                variant={online ? "outline" : "primary"}
                disabled={toggling}
                onClick={() => toggleOnline(!online)}
              >
                {toggling ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Radio className="size-4" />
                )}
                {online ? t("toggle_go_offline") : t("toggle_go_online")}
              </TlButton>
            </div>
          )}
        </div>

        {/* Federation notification center */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => {
              setShowNotifs((v) => !v);
              if (!showNotifs && (unread ?? 0) > 0) void markAllRead({});
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50"
          >
            <Bell className="size-4 text-emerald-600" />
            Federation notices
            {(unread ?? 0) > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white">
                {unread}
              </span>
            )}
          </button>
          {showNotifs && (
            <Panel title="Notices from the federation board" className="mt-3" bodyClassName="p-0">
              <div className="max-h-[360px] overflow-y-auto">
                {(notifications ?? []).length === 0 && (
                  <p className="px-5 py-8 text-center text-xs text-slate-500">
                    No notices yet — federation board updates about your
                    membership will appear here.
                  </p>
                )}
                {(notifications ?? []).map((n) => (
                  <div key={n._id} className={`flex gap-3 border-b border-slate-100 px-4 py-3 last:border-0 ${!n.readAt ? "bg-emerald-50/40" : ""}`}>
                    <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl ${n.kind === "worker_removed" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>
                      {n.kind === "worker_removed" ? <UserMinus className="size-4" /> : <UserPlus className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900">{n.title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{n.body}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {new Date(n.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {(notifications ?? []).length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2">
                  <CheckCheck className="size-3.5 text-slate-400" />
                  <span className="text-[10px] text-slate-400">Marked read on open</span>
                </div>
              )}
            </Panel>
          )}
        </div>

        {!artisan && (
          <Panel className="mt-8">
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50">
                <HandHeart className="size-5 text-emerald-700" />
              </span>
              <p className="max-w-sm text-sm text-slate-600">
                {t("hub_not_onboarded")}
              </p>
              <Link to="/onboarding">
                <TlButton>{t("hub_cta_onboard")}</TlButton>
              </Link>
            </div>
          </Panel>
        )}

        {/* Verification status banner — guides workers through board verification */}
        {artisan && (artisan.kycStatus !== "verified" || artisan.skillStatus !== "verified") && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <p className="text-xs font-bold text-amber-900">Federation verification status:</p>
              <span className={`text-[11px] font-bold ${artisan.kycStatus === "verified" ? "text-emerald-700" : "text-amber-800"}`}>
                {artisan.kycStatus === "verified" ? "✓ KYC verified" : artisan.kycStatus === "rejected" ? "✕ KYC rejected — resubmit from onboarding" : "… KYC in board review"}
              </span>
              <span className={`text-[11px] font-bold ${artisan.skillStatus === "verified" ? "text-emerald-700" : "text-amber-800"}`}>
                {artisan.skillStatus === "verified" ? "✓ Skill verified" : artisan.skillStatus === "rejected" ? "✕ Work evidence rejected — upload clearer photos" : "… Skill in board review"}
              </span>
            </div>
            {artisan.skillStatus !== "verified" && (
              <p className="mt-1.5 text-[11px] text-amber-800">
                Upload work photos from onboarding so the board can verify your skill —
                <Link to="/onboarding" className="ml-1 font-bold underline underline-offset-2">open onboarding →</Link>
              </p>
            )}
          </div>
        )}

        {/* Weekly availability — what the catalog shows customers */}
        {artisan && (
          <div className="mt-6">
            <SlotEditor slots={artisan.slots ?? 0} />
          </div>
        )}

        {/* What this worker's own trade looks like this week */}
        {artisan && (
          <div className="mt-5">
            <DemandOutlook />
          </div>
        )}

        {artisan && (
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {/* AI Demand & Fair-Price Forecasting */}
            <div className="lg:col-span-3">
              <ForecastCard />
            </div>
            {/* My work — publish work in one of the six trades or a category of my own */}
            <div className="lg:col-span-3">
              <WorkListingsPanel />
            </div>
            {/* Accident cover — the accrued 7% welfare balance and a claim route */}
            {artisan && (
              <div className="lg:col-span-3">
                <InsuranceClaimPanel artisanId={artisan._id} />
              </div>
            )}
            {/* Left column */}
            <div className="flex flex-col gap-5">
              {/* Telemetry */}
              <Panel title={t("telemetry")} tag={online ? "live" : "off"}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex size-11 items-center justify-center rounded-xl border ${
                        online
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      {TradeIcon && (
                        <TradeIcon
                          className={`size-5 ${
                            online ? "text-emerald-700" : "text-slate-400"
                          }`}
                        />
                      )}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {online ? t("telemetry_on") : t("telemetry_off")}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {online ? "20s ping" : "—"}
                      </p>
                    </div>
                  </div>
                  <StatusDot tone={online ? "ok" : "idle"} blink={online} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <TeleCell
                    label={t("tele_lat")}
                    value={artisan.lat?.toFixed(4) ?? "—"}
                  />
                  <TeleCell
                    label={t("tele_lng")}
                    value={artisan.lng?.toFixed(4) ?? "—"}
                  />
                  <TeleCell
                    label={t("tele_ping")}
                    value={
                      artisan.telemetryAt
                        ? new Date(artisan.telemetryAt).toLocaleTimeString()
                        : "—"
                    }
                  />
                </div>
                {geoError && (
                  <p className="mt-3 text-[11px] font-semibold text-amber-700">
                    {geoError}
                  </p>
                )}
              </Panel>

              {/* Earnings */}
              <Panel title={t("earnings_title")} bodyClassName="p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                    <p className="tl-label">{t("earn_collected")}</p>
                    <p className="mt-1 text-lg font-black text-emerald-800">
                      ₹{earned.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-3">
                    <p className="tl-label">{t("welfare")}</p>
                    <p className="mt-1 text-lg font-black text-orange-800">
                      ₹{artisan.welfareBalance.toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
                    Worker 90%
                  </span>
                  <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-orange-800">
                    Welfare 7%
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                    Operations 3%
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-slate-500">
                  {t("ledger_note")}
                </p>
              </Panel>

              {/* Credential */}
              <Panel title={t("card_id")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {artisan.credentialId ?? t("quiz_none")}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {t("cred_score")}: {artisan.quizScore ?? 0}%
                    </p>
                  </div>
                  {artisan.credentialId && <IdCardDialog artisan={artisan} />}
                </div>
              </Panel>
            </div>

            {/* Right: radar + jobs */}
            <div className="flex flex-col gap-5 lg:col-span-2">
              {/* Radar */}
              <Panel
                title={t("radar_title")}
                tag={`${radar.length}`}
                bodyClassName="p-0"
              >
                {acceptError && (
                  <p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] font-semibold text-amber-800">
                    ⚠ {acceptError}
                  </p>
                )}
                {!verified && radar.length > 0 && (
                  <p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] font-semibold text-amber-800">
                    ⚠ Complete your KYC verification and skill check to accept
                    jobs. Your federation officer approves KYC in the admin
                    console.
                  </p>
                )}
                <div className="divide-y divide-slate-100">
                  {radar.length === 0 && (
                    <p className="px-5 py-10 text-center text-xs text-slate-500">
                      {t("radar_empty")}
                    </p>
                  )}
                  {radar.map((b) => (
                    <div
                      key={b._id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50">
                        <Radar className="size-4 text-emerald-700" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-900">
                          {b.serviceName}
                        </p>
                        {b.myListing && (
                          <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                            ✦ {t("wc_mine")}
                          </p>
                        )}
                        {/* A shared visit is one trip for several households.
                            Showing it as N jobs would have the worker drive out
                            once and leave N-1 calls unclaimed. */}
                        {b.sharedCount && b.sharedCount > 1 ? (
                          <p className="text-[10px] font-black uppercase tracking-wide text-teal-700">
                            ⌂ {b.sharedCount} {t("gb_households")} · 1 {t("gb_visit")}
                          </p>
                        ) : null}
                        <p className="truncate text-[11px] text-slate-500">
                          {b.address.slice(0, 44)} · ₹{b.total} · you earn ₹
                          {b.workerShare}
                        </p>
                        {(() => {
                          const d = offerDistance(b);
                          return d !== null ? (
                            <p className="text-[11px] font-bold text-emerald-700">
                              📍 {formatDistance(d)} away · ~{estimateEtaMinutes(d)}
                              min travel
                            </p>
                          ) : null;
                        })()}
                        <p className="text-[11px] font-semibold text-emerald-700">
                          {new Date(b.scheduledFor).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <TlButton
                        className="h-8 px-3 text-xs"
                        onClick={() => handleAccept(b._id)}
                        disabled={accepting === b._id || !verified}
                        title={
                          !verified
                            ? "KYC verification + skill check required"
                            : undefined
                        }
                      >
                        {accepting === b._id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          t("radar_accept")
                        )}
                      </TlButton>
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Active + history jobs */}
              <Panel title={t("myjobs_title")} bodyClassName="p-0">
                <div className="divide-y divide-slate-100">
                  {mine.length === 0 && (
                    <p className="px-5 py-10 text-center text-xs text-slate-500">
                      {t("myjobs_empty")}
                    </p>
                  )}
                  {mine.map((b) => (
                    <div
                      key={b._id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <Briefcase className="size-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/bookings/${b._id}`}
                          className="block truncate text-xs font-bold text-slate-900 hover:text-emerald-700"
                        >
                          {b.serviceName}
                        </Link>
                        <p className="truncate text-[11px] text-slate-500">
                          {new Date(b.scheduledFor).toLocaleDateString("en-IN")}{" "}
                          · ₹{b.total}
                        </p>
                      </div>
                      <MonoBadge tone={STATUS_TONE[b.status] ?? "neutral"}>
                        {t(`st_${b.status}`)}
                      </MonoBadge>
                      {stageKeys[b.status] && (
                        <TlButton
                          variant="outline"
                          className="h-8 px-2.5 text-[11px]"
                          onClick={() => handleAdvance(b._id)}
                          disabled={busyAdvance === b._id}
                        >
                          {busyAdvance === b._id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            t(stageKeys[b.status])
                          )}
                        </TlButton>
                      )}
                      {["accepted", "enroute"].includes(b.status) && (
                        <div className="flex shrink-0 flex-col gap-1">
                          <Link to={`/bookings/${b._id}`}>
                            <TlButton
                              className="h-7 gap-1 px-2.5 text-[11px]"
                              title="Open in-app navigation map"
                            >
                              <Navigation className="size-3" /> Navigate
                            </TlButton>
                          </Link>
                          <button
                            type="button"
                            onClick={() => openExternalMaps(b)}
                            className="rounded-lg border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-emerald-700"
                          >
                            Open in Maps ↗
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TeleCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50 px-2 py-2.5 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-teal-700">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-bold text-teal-900">
        {value}
      </p>
    </div>
  );
}
