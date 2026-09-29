import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SAFETY_WITHHELD_ADDRESS } from "@/convex/bookings";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
import type { Id } from "@/convex/_generated/dataModel";
import { getService, COLOR_SOFT } from "@/lib/trades";
import { AppHeader } from "@/components/AppHeader";
import { BackToHome } from "@/components/BackToHome";
import { MonoBadge, Panel, StatusDot, TlButton } from "@/components/terminal";
import {
  ArrowLeft,
  BadgeCheck,
  Loader2,
  Send,
  ShieldCheck,
  Signal,
  XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import CustomerRealtimeRadarMap from "@/components/map/CustomerRealtimeRadarMap";
import { RevenueSplitBar } from "@/components/RevenueSplit";
import ReviewForm from "@/components/ReviewForm";
import RatingStars from "@/components/RatingStars";
import { Repeat2, Users } from "lucide-react";

const FLOW = [
  "pending",
  "accepted",
  "enroute",
  "inprogress",
  "payment",
  "completed",
  "settled",
];

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

export default function BookingDetail() {
  const { id } = useParams();
  const { t } = useLang();
  const { user } = useAuth();
  const booking = useQuery(api.bookings.getBooking, { id: id as Id<"bookings"> });
  const messages = useQuery(api.bookings.listMessages, {
    bookingId: id as Id<"bookings">,
  });
  const sendMessage = useMutation(api.bookings.sendMessage);
  const advance = useMutation(api.bookings.advance);
  const confirmUtr = useMutation(api.bookings.confirmUtr);
  const cancelBooking = useMutation(api.bookings.cancel);
  const raiseDispute = useMutation(api.disputes.raise);
  const requestSwap = useMutation(api.bookings.requestSwap);
  const releaseForSwap = useMutation(api.bookings.releaseForSwap);
  const myReview = useQuery(
    api.reviews.forBooking,
    booking ? { bookingId: booking._id } : "skip",
  );
  // A swap that nobody claimed has to fall back to the original worker
  // eventually, or the customer is left holding a job that nobody is coming to.
  // There is no cron here; loading the booking *is* the trigger, and the
  // mutation is a no-op until the window has genuinely lapsed.
  const expireSwap = useMutation(api.bookings.expireSwap);
  useEffect(() => {
    if (!booking?.swapRequestedAt || booking.status !== "pending") return;
    void expireSwap({ id: booking._id }).catch(() => {});
  }, [booking?.swapRequestedAt, booking?.status, booking?._id, expireSwap]);
  // The raiser is the only participant who needs to see the verdict, so the
  // arbitration board's decision is read back here rather than staying admin-only.
  const myDispute = useQuery(
    api.disputes.myDisputeForBooking,
    booking ? { bookingId: booking._id } : "skip",
  );

  const [utr, setUtr] = useState("");
  const [chat, setChat] = useState("");
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [showFlag, setShowFlag] = useState(false);
  const [flagCategory, setFlagCategory] = useState("quality");
  const [flagDetails, setFlagDetails] = useState("");
  const [flagBusy, setFlagBusy] = useState(false);
  const [swapBusy, setSwapBusy] = useState(false);
  const radar = useQuery(
    api.gis.radar,
    ["accepted", "enroute", "inprogress"].includes(booking?.status ?? "") && booking
      ? { bookingId: booking._id }
      : "skip",
  );
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Guarded: scrollIntoView is missing in some embedded webviews and in any
    // non-DOM render, where an unguarded call would take the whole page down.
    chatEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages?.length]);

  if (booking === undefined) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </main>
      </div>
    );
  }

  if (booking === null) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <p className="text-sm text-slate-500">Booking not found.</p>
          <Link to="/bookings" className="mt-4 inline-block">
            <TlButton variant="outline">{t("bks_title")}</TlButton>
          </Link>
        </main>
      </div>
    );
  }

  const svc = getService(booking.serviceId);
  const Icon = svc?.icon;
  const soft = COLOR_SOFT[svc?.color ?? "ok"];
  const isWorker = !!user && booking.workerUserId === user._id;
  const isCustomer = !!user && booking.customerId === user._id;
  const statusIdx = FLOW.indexOf(booking.status);
  const stageKeys: Record<string, string> = {
    accepted: "st_enroute",
    enroute: "st_inprogress",
    inprogress: "st_payment",
    payment: "st_completed",
    completed: "st_settled",
  };

  const payeeVpa = booking.workerVpa ?? "sahakar@upi";
  const upiString = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(
    "Sahakar Seva Artisan",
  )}&am=${booking.total}&tn=${encodeURIComponent(
    `Booking_${booking._id.slice(-8)}`,
  )}&cu=INR`;
  const awaitingUtr =
    booking.status === "payment" && !paid && booking.utr === undefined;

  async function handleSend() {
    const body = chat.trim();
    if (!body) return;
    setChat("");
    await sendMessage({ bookingId: booking!._id, body });
  }

  async function handleAdvance() {
    setBusy(true);
    try {
      await advance({ id: booking!._id });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmPaid() {
    setBusy(true);
    try {
      await confirmUtr({ id: booking!._id, utr });
      setPaid(true);
    } catch {
      // surfaced via Convex error toast
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    try {
      await cancelBooking({
        id: booking!._id,
        by: isCustomer ? "customer" : "worker",
      });
    } finally {
      setBusy(false);
    }
  }

  /** Ask the federation to find a different worker for this booking. */
  async function handleSwap() {
    if (!booking) return;
    setSwapBusy(true);
    try {
      await requestSwap({ id: booking._id });
    } catch {
      // surfaced via Convex error
    } finally {
      setSwapBusy(false);
    }
  }

  /** The assigned worker hands the job back to their trade's pool. */
  async function handleRelease() {
    if (!booking) return;
    setSwapBusy(true);
    try {
      await releaseForSwap({ id: booking._id });
    } catch {
      // surfaced via Convex error
    } finally {
      setSwapBusy(false);
    }
  }

  async function handleFlag() {
    if (!booking) return;
    setFlagBusy(true);
    try {
      await raiseDispute({
        bookingId: booking._id,
        category: flagCategory,
        details: flagDetails,
      });
      setShowFlag(false);
      setFlagDetails("");
    } catch {
      // surfaced via Convex error
    } finally {
      setFlagBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <BackToHome />
          <span className="text-slate-300">·</span>
          <Link
          to="/bookings"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-emerald-700"
        >
          <ArrowLeft className="size-3.5" />
          {t("bks_title")}
        </Link>
        </div>

        {/* Header */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex size-11 items-center justify-center rounded-xl border ${soft}`}
            >
              {Icon && <Icon className="size-5" />}
            </span>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                {booking.serviceName}
              </h1>
              <p className="text-xs text-slate-500">
                {t("bd_ref")} {booking._id.slice(-8).toUpperCase()} ·{" "}
                {t("bd_schedule")}{" "}
                {new Date(booking.scheduledFor).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          </div>
          <MonoBadge tone={STATUS_TONE[booking.status] ?? "neutral"}>
            {t(`st_${booking.status}`)}
          </MonoBadge>
        </div>

        {/* Shared visit banner — one worker trip, several households */}
        {booking.shareCount && booking.shareCount > 1 && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-xs text-teal-900">
            <Users className="mt-0.5 size-4 shrink-0 text-teal-700" />
            <span className="leading-relaxed">
              {t("gb_joined_banner")} — {t("gb_your_share")}{" "}
              <strong>₹{booking.shareAmount}</strong> {t("gb_of")}{" "}
              {booking.shareCount} {t("gb_households")}. {t("gb_note")}
            </span>
          </div>
        )}

        {/* Swap in progress */}
        {booking.swapRequestedAt && booking.status === "pending" && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <Repeat2 className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span className="leading-relaxed">{t("sw_pending")}</span>
          </div>
        )}

        {/* Safety Mode — the address is withheld by the server, this says why */}
        {isWorker && booking.address === SAFETY_WITHHELD_ADDRESS && (
          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-[11px] leading-relaxed text-teal-900">
            {t("sf_active")} — {t("sf_withheld")}
          </div>
        )}

        {/* Stepper */}
        {booking.status !== "cancelled" && (
          <Panel className="mt-5" bodyClassName="p-5">
            <div className="flex items-center">
              {FLOW.map((s, i) => (
                <div key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex size-6 items-center justify-center rounded-full border text-[10px] font-bold ${
                        i < statusIdx
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : i === statusIdx
                            ? "border-emerald-800 bg-emerald-800 text-white"
                            : "border-slate-200 bg-white text-slate-400"
                      }`}
                    >
                      {i < statusIdx ? "✓" : i + 1}
                    </span>
                    <span className="mt-1 hidden text-[9px] font-semibold sm:block">
                      {t(`st_${s}`)}
                    </span>
                  </div>
                  {i < FLOW.length - 1 && (
                    <div
                      className={`mx-1 mb-0 h-0.5 flex-1 sm:mb-4 ${
                        i < statusIdx ? "bg-emerald-600" : "bg-slate-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Live radar map */}
        {radar && radar.worker && radar.worker.lat && radar.worker.lng &&
         booking.lat && booking.lng && (
          <div className="mt-5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <Signal className="size-3.5 text-emerald-600" />
              Live artisan radar
            </p>
            <CustomerRealtimeRadarMap
              customerLat={booking.lat}
              customerLng={booking.lng}
              worker={{
                lat: radar.worker.lat,
                lng: radar.worker.lng,
                name: radar.worker.fullName,
                trade: radar.worker.trade,
                telemetryAt: radar.worker.telemetryAt,
              }}
              trade={booking.serviceId.split("-")[0]}
            />
          </div>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* Left: assignment + address + chat */}
          <div className="space-y-5">
            <Panel title={t("bd_worker")}>
              {booking.workerUserId ? (
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50">
                    <ShieldCheck className="size-5 text-emerald-700" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Verified artisan
                    </p>
                    <p className="text-xs text-slate-500">
                      {t("kyc_badge")} · {booking.workerVpa ?? t("upi_missing")}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">{t("bd_unassigned")}</p>
              )}
              <div className="mt-4 space-y-1 border-t border-dashed border-slate-200 pt-3 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">{t("bk_address")}</span>
                  <span className="max-w-[60%] text-right font-semibold text-slate-900">
                    {booking.address}
                  </span>
                </div>
                {booking.notes && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">{t("bk_notes")}</span>
                    <span className="max-w-[60%] text-right text-slate-900">
                      {booking.notes}
                    </span>
                  </div>
                )}
              </div>
            </Panel>

            {/* Chat */}
            <Panel title={t("bd_chat")} bodyClassName="p-0">
              <div className="max-h-64 space-y-2 overflow-y-auto bg-slate-50/60 p-4">
                {(messages ?? []).map((m) => {
                  const mine = m.senderId === user?._id;
                  return (
                    <div
                      key={m._id}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl border px-3 py-2 text-xs ${
                          mine
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-white text-slate-900"
                        }`}
                      >
                        <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          {m.senderName} · {m.senderRole}
                        </p>
                        {m.body}
                      </div>
                    </div>
                  );
                })}
                {messages?.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-500">
                    {t("bd_chat_ph")}
                  </p>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex items-center gap-2 border-t border-slate-200 p-3">
                <input
                  className="tl-input h-9 flex-1"
                  placeholder={t("bd_chat_ph")}
                  value={chat}
                  onChange={(e) => setChat(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSend();
                  }}
                />
                <TlButton
                  className="h-9 px-3"
                  onClick={() => void handleSend()}
                  disabled={!chat.trim()}
                >
                  <Send className="size-4" />
                </TlButton>
              </div>
            </Panel>
          </div>

          {/* Right: payment + actions */}
          <div className="space-y-5">
            {/* UPI payment */}
            <Panel title={t("bd_upi_title")} bodyClassName="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
                  <QRCodeSVG value={upiString} size={140} />
                </div>
                <p className="mt-3 text-sm font-bold text-emerald-800">
                  ₹{booking.total} · {t("bk_total")}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  {t("bd_upi_note")}
                </p>
              </div>

              {awaitingUtr && (
                <div className="mt-4 space-y-2 border-t border-dashed border-slate-200 pt-4">
                  <span className="tl-label">{t("bd_utr")}</span>
                  <input
                    className="tl-input"
                    placeholder={t("bd_utr_ph")}
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                  />
                  <TlButton
                    className="w-full"
                    onClick={handleConfirmPaid}
                    disabled={busy || utr.trim().length < 6}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <BadgeCheck className="size-4" />
                    )}
                    {t("bd_confirm_paid")}
                  </TlButton>
                </div>
              )}
              {(paid || booking.utr) && (
                <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-800">
                  {t("bd_paid_ok")} {booking.utr ? `(${booking.utr})` : ""}
                </p>
              )}
            </Panel>

            {/* Worker actions */}
            {isWorker && stageKeys[booking.status] && (
              <Panel bodyClassName="p-4">
                <TlButton
                  className="w-full"
                  onClick={handleAdvance}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <StatusDot tone="ok" />
                  )}
                  {t("bd_advance", { stage: t(stageKeys[booking.status]) })}
                </TlButton>
                <button
                  type="button"
                  onClick={handleRelease}
                  disabled={swapBusy}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                >
                  {t("sw_release")}
                </button>
              </Panel>
            )}

            {/* Swap Service — customer asks, the trade's pool answers */}
            {isCustomer && !booking.swapRequestedAt && (
              <button
                type="button"
                onClick={handleSwap}
                disabled={swapBusy || !booking.workerUserId}
                className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 active:scale-95 disabled:opacity-50"
              >
                {t("sw_ask")}
              </button>
            )}

            {/* Reputation — a review of work that actually happened */}
            {isCustomer && ["completed", "settled"].includes(booking.status) && (
              myReview ? (
                <Panel title={t("rv_title")} bodyClassName="p-4">
                  <div className="flex items-center gap-2">
                    <RatingStars value={myReview.rating} size="md" />
                    <span className="text-[11px] font-semibold text-emerald-700">
                      {t("rv_posted")}
                    </span>
                  </div>
                  {myReview.comment && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                      “{myReview.comment}”
                    </p>
                  )}
                </Panel>
              ) : (
                <ReviewForm bookingId={booking._id} />
              )
            )}

            {/* Bill summary with cooperative split */}
            <Panel title={t("bk_summary")} bodyClassName="p-4">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t("bk_visit")}</span>
                  <span className="font-semibold text-slate-900">
                    ₹{booking.base}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Worker receives (90%)</span>
                  <span className="font-semibold text-emerald-800">
                    ₹{booking.workerShare ?? Math.round(booking.base * 0.9)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Welfare fund (7%)</span>
                  <span className="font-semibold text-orange-800">
                    ₹{booking.welfareAmt}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Operations (3%)</span>
                  <span className="font-semibold text-slate-900">
                    ₹{booking.opsAmt ?? (booking.base - booking.welfareAmt - (booking.workerShare ?? Math.round(booking.base * 0.9)))}
                  </span>
                </div>
                <div className="flex justify-between border-t border-dashed border-slate-200 pt-2">
                  <span className="font-bold text-slate-900">
                    {t("bk_total")}
                  </span>
                  <span className="font-bold text-slate-900">
                    ₹{booking.total}
                  </span>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3">
                <p className="tl-label mb-2">Cooperative split</p>
                <RevenueSplitBar
                  total={booking.total}
                  workerShare={booking.workerShare ?? Math.round(booking.base * 0.9)}
                  welfareAmt={booking.welfareAmt}
                  opsAmt={booking.opsAmt ?? booking.base - booking.welfareAmt - (booking.workerShare ?? Math.round(booking.base * 0.9))}
                />
              </div>
            </Panel>

            {/* Cancel */}
            {!["completed", "settled", "cancelled"].includes(booking.status) && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-rose-700 active:scale-95 disabled:opacity-50"
              >
                <XCircle className="size-4" />
                {t("bd_cancel")}
              </button>
            )}

            {/* Raise dispute (double-blind flag) */}
            {myDispute ? (
              <div
                className={`rounded-xl border px-4 py-3 ${
                  myDispute.status === "open"
                    ? "border-amber-200 bg-amber-50"
                    : myDispute.status === "resolved"
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="text-xs font-bold text-slate-800">
                  ⚑ Your dispute is {myDispute.status === "open" ? "with the board" : myDispute.status}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  You reported: {myDispute.details}
                </p>
                {myDispute.resolution && (
                  <p className="mt-1.5 text-[11px] italic text-slate-600">
                    Board note: {myDispute.resolution}
                  </p>
                )}
              </div>
            ) : !showFlag ? (
              <button
                type="button"
                onClick={() => setShowFlag(true)}
                className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 active:scale-95"
              >
                ⚑ Raise a dispute with the federation board
              </button>
            ) : (
              <Panel title="Raise a dispute" bodyClassName="p-4">
                <div className="space-y-3">
                  <select
                    value={flagCategory}
                    onChange={(e) => setFlagCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none"
                  >
                    <option value="late">Late arrival</option>
                    <option value="quality">Poor craftsmanship</option>
                    <option value="unsafe">Unsafe work environment</option>
                    <option value="payment">Payment dispute</option>
                    <option value="behavior">Misconduct</option>
                    <option value="other">Other</option>
                  </select>
                  <textarea
                    rows={3}
                    value={flagDetails}
                    onChange={(e) => setFlagDetails(e.target.value)}
                    placeholder="Describe the issue — the board will arbitrate both sides fairly…"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-emerald-500 focus:bg-white focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowFlag(false)}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleFlag()}
                      disabled={flagBusy || !flagDetails.trim()}
                      className="flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
                    >
                      {flagBusy ? "Submitting…" : "Submit to board"}
                    </button>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
