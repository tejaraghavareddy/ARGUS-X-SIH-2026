import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { LanguagePicker } from "@/components/terminal";
import { useDetectedLocation, formatCoords, formatAccuracy } from "@/lib/useLocation";
import LocationPickerModal from "@/components/map/LocationPickerModal";
import AdminLoginModal from "@/components/AdminLoginModal";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  HardHat,
  HeartPulse,
  MapPin,
  RefreshCcw,
  ShieldCheck,
  HandCoins,
} from "lucide-react";

/* ── Brand mark: rounded emerald tile with the सह glyph ─────── */

export function SahMark({ size = "lg" }: { size?: "sm" | "md" | "lg" }) {
  const cls =
    size === "lg"
      ? "size-24 rounded-[1.75rem] text-5xl shadow-xl shadow-emerald-600/30"
      : size === "md"
        ? "size-10 rounded-xl text-xl"
        : "size-8 rounded-lg text-base";
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-700 font-black text-white select-none ${cls}`}
    >
      सह
    </span>
  );
}

export default function Landing() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { location, detect, setManual } = useDetectedLocation();
  const [showMap, setShowMap] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-emerald-50/30 to-slate-100 font-sans text-slate-900 antialiased">
      {/* ── Top utility bar: location pill, role tag, language ── */}
      <header className="relative z-30 mx-auto flex w-full max-w-5xl items-center justify-end gap-2 px-4 pt-5 sm:gap-3">
        <span className="hidden max-w-[16rem] items-center gap-1.5 truncate rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-xs sm:inline-flex">
          <MapPin className="size-3 shrink-0 text-emerald-600" />
          <span className="truncate italic">{location.label}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-xs">
          <HardHat className="size-3 text-emerald-600" />
          Federation Admin
        </span>
        <LanguagePicker />
      </header>

      {/* ── Centered hero ────────────────────────────────────── */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 pt-16 pb-20 text-center sm:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex w-full flex-col items-center"
        >
          <SahMark size="lg" />

          <h1 className="mt-6 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
            Sahakar Seva
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500 italic sm:text-base">
            {t("ld_tagline")}
          </p>

          {/* ── Detected location bar ────────────────────────── */}
          <div className="mt-8 flex w-full max-w-2xl flex-col items-stretch gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2.5 text-left">
              <span className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
              <div className="min-w-0">
                <p className="truncate text-xs text-slate-800">
                  <span className="font-bold">{t("ld_your_location")}</span>{" "}
                  <span className="italic">{location.label}</span>
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  GPS: {formatCoords(location)}{" "}
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-1 font-semibold text-emerald-700">
                    {formatAccuracy(location)}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => detect(false)}
                title="Re-detect GPS location"
                className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-emerald-700"
              >
                <RefreshCcw className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowMap(true)}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 active:scale-95"
              >
                ✎ {t("ld_change")}
              </button>
            </div>
          </div>

          {/* ── Role selection heading ───────────────────────── */}
          <h2 className="mt-10 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            {t("ld_choose")}
          </h2>
          <p className="mt-1.5 text-xs text-slate-500 italic sm:text-sm">
            {t("ld_choose_sub")}
          </p>

          {/* ── Two gateway cards ────────────────────────────── */}
          <div className="mt-8 grid w-full max-w-5xl grid-cols-1 gap-6 text-left md:grid-cols-3">
            <GatewayCard to="/services" delay={0.05}>
              <div className="flex items-start justify-between">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 transition group-hover:scale-105">
                  <CalendarClock className="size-7" />
                </span>
                <ArrowRight className="size-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-emerald-600" />
              </div>
              <span className="mt-5 w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800">
                {t("ld_cust_badge")}
              </span>
              <h3 className="mt-2.5 text-2xl font-black tracking-tight text-slate-900">
                {t("ld_cust_title")}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 italic">
                {t("ld_cust_desc")}
              </p>
              <span className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700 group-active:scale-[0.98]">
                {t("ld_cust_cta")}
              </span>
            </GatewayCard>

            <GatewayCard to="/onboarding" delay={0.12}>
              <div className="flex items-start justify-between">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-teal-100 text-teal-700 transition group-hover:scale-105">
                  <HardHat className="size-7" />
                </span>
                <ArrowRight className="size-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-teal-600" />
              </div>
              <span className="mt-5 w-fit rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-semibold text-teal-800">
                {t("ld_work_badge")}
              </span>
              <h3 className="mt-2.5 text-2xl font-black tracking-tight text-slate-900">
                {t("ld_work_title")}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 italic">
                {t("ld_work_desc")}
              </p>
              <span className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-900 px-4 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-teal-800 group-active:scale-[0.98]">
                {t("ld_work_cta")}
              </span>
            </GatewayCard>

            <GatewayCard to="/admin" delay={0.19}>
              <div className="flex items-start justify-between">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-800 transition group-hover:scale-105">
                  <ShieldCheck className="size-7" />
                </span>
                <ArrowRight className="size-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-600" />
              </div>
              <span className="mt-5 w-fit rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                {t("ld_admin_badge")}
              </span>
              <h3 className="mt-2.5 text-2xl font-black tracking-tight text-slate-900">
                {t("ld_admin_title")}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 italic">
                {t("ld_admin_desc")}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowAdminLogin(true);
                }}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-slate-800 group-active:scale-[0.98]"
              >
                {t("ld_admin_cta")}
              </button>
            </GatewayCard>
          </div>

        </motion.div>
      </main>

      {/* ── Cooperative revenue engine ────────────────────────
          Continues the card grid above rather than sitting under it as a
          separate band: same max-w-5xl column, no hard border, and the three
          shares divided by hairlines so they read as one 90/7/3 statement. */}
      <section aria-label="Cooperative revenue engine">
        <div className="mx-auto w-full max-w-5xl px-4 pb-16 sm:pb-20">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-5 text-left sm:grid-cols-3 sm:divide-x sm:divide-slate-200">
            {/* Welfare share — federation's top preference, listed first */}
            <div className="flex items-start gap-2.5 sm:pr-6">
              <HeartPulse className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              <div>
                <dt className="flex items-center gap-1.5 text-base font-black leading-tight text-emerald-700">
                  7% Dedicated Welfare Pool
                  <BadgeCheck
                    className="size-4 shrink-0 text-emerald-600"
                    aria-label="Top priority"
                  />
                </dt>
                <dd className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                  Top priority — funded before any ops spend
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5 sm:px-6">
              <HandCoins className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              <dt className="text-base font-black leading-tight text-emerald-700">
                90% Direct Worker Payout
              </dt>
            </div>
            <div className="flex items-start gap-2.5 sm:pl-6">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-slate-400" />
              <dt className="text-base font-black leading-tight text-slate-500">
                3% Federation Ops
              </dt>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Footer strip ─────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-5 text-center text-[11px] leading-relaxed text-slate-500">
          <div className="flex items-center gap-2">
            <SahMark size="sm" />
            <span className="italic">{t("ld_tagline")}</span>
          </div>
          {/* Rule instead of a gap so the two lines read as one statement. */}
          <span
            aria-hidden="true"
            className="hidden h-3 w-px shrink-0 bg-slate-200 sm:block"
          />
          <span className="text-slate-400">{t("ld_footer_reg")}</span>
        </div>
      </footer>

      {/* Exact-location picker for the detected address */}
      <LocationPickerModal
        open={showMap}
        initialLat={location.lat}
        initialLng={location.lng}
        onClose={() => setShowMap(false)}
        onConfirm={(loc) => {
          setManual({
            label: loc.address || location.label,
            lat: loc.lat,
            lng: loc.lng,
            area: loc.geo?.area,
            city: loc.geo?.city,
            district: loc.geo?.district,
            state: loc.geo?.state,
            pincode: loc.geo?.pincode,
          });
          setShowMap(false);
        }}
      />

      {/* Secure officer clearance for the admin gateway */}
      <AdminLoginModal
        open={showAdminLogin}
        onClose={() => setShowAdminLogin(false)}
        onSuccess={() => {
          setShowAdminLogin(false);
          navigate("/admin");
        }}
      />
    </div>
  );
}

/* ---------- Gateway card shell ---------- */

function GatewayCard({
  to,
  children,
  delay,
}: {
  to: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Link
        to={to}
        className="group flex h-full cursor-pointer flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none sm:p-7"
      >
        {children}
      </Link>
    </motion.div>
  );
}
