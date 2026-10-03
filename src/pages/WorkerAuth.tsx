import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { LanguagePicker } from "@/components/terminal";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLang } from "@/lib/i18n";
// The provider ids are owned by a client-safe constants module, so the screens
// and the server providers cannot drift apart. Hard-coding "phone-otp" here
// once shipped a screen that signed in with a provider Convex Auth had not
// actually registered.
import {
  EMAIL_PROVIDER_ID,
  PHONE_PROVIDER_ID,
  isPlausiblePhone,
  normalisePhone,
} from "@/lib/authProviders";
import {
  ArrowRight,
  BadgeCheck,
  HandCoins,
  HandHeart,
  Loader2,
  Mail,
  MessageSquare,
  Smartphone,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { BackToHome } from "@/components/BackToHome";

/** Where a worker lands: their job hub, or the credential wizard if new. */
const WORKER_HOME = "/dashboard";

function resolveReturnTo(returnTo: string | null): string {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return WORKER_HOME;
}

/**
 * Worker portal sign-in.
 *
 * A worker is signing in to *do a job*, not to browse, so this screen is built
 * around the phone: a gig worker registering with the federation is far more
 * likely to have a handset than an inbox, and an SMS code is the only sign-in
 * that reaches someone in the field. Email is kept as a second tab rather than
 * removed, because the federation office verifies workers who join by email.
 *
 * A signed-in worker is sent straight to their hub; a first-time one is handed
 * to /onboarding by the dashboard's own empty state, not from here, so this
 * screen has no opinion about whether the account is new.
 */
function WorkerAuth() {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const { t } = useLang();
  const requestOtp = useMutation(api.authThrottle.requestOtp);
  const requestPhoneOtp = useMutation(api.authThrottle.requestPhoneOtp);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveReturnTo(searchParams.get("returnTo"));

  // Whether SMS is actually deliverable on this deployment. Without this the
  // phone tab is a trap: the provider throws on send, and the worker sees a
  // bare "[CONVEX A(auth:signIn)] Server Error" with no way to tell that the
  // problem is a missing credential rather than their phone number.
  const delivery = useQuery(api.authConfig.delivery, {});
  /**
   * Fail CLOSED while the answer is unknown.
   *
   * `delivery?.phoneOtp !== false` reads as safe but is the opposite: while the
   * query is in flight `delivery` is `undefined`, `undefined !== false` is
   * true, and every control is live for that window. A worker who typed a
   * number and pressed send before the query settled hit exactly that — the
   * provider threw on the missing Vonage key and surfaced a bare
   * `[CONVEX A(auth:signIn)] Server Error`.
   *
   * So an unknown answer is treated as "not deliverable": the form is inert
   * until the server has positively confirmed the credential exists. The cost
   * is a brief disabled input on first paint; the benefit is that the only way
   * to submit a phone number is after we know an SMS can actually be sent.
   */
  const smsReady = delivery?.phoneOtp === true;
  const emailReady = delivery?.emailOtp === true;

  // The worker's explicit choice, or null while they have not chosen. The
  // effective method is derived rather than stored in an effect: until the
  // server reports that SMS is unavailable we default to the phone, and once
  // it does we fall back to email — without a state update cascading a render.
  const [choice, setChoice] = useState<"phone" | "email" | null>(null);
  const smsIsTheOnlyBrokenOne =
    delivery?.phoneOtp === false && delivery?.emailOtp === true;
  const method: "phone" | "email" =
    choice ?? (smsIsTheOnlyBrokenOne ? "email" : "phone");
  // The code step holds whichever identifier the code was sent to, because
  // Convex Auth verifies the code against the identifier used to request it.
  const [step, setStep] = useState<"signIn" | { kind: "phone" | "email"; to: string }>(
    "signIn",
  );
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  /**
   * Client-side shape check.
   *
   * This is a courtesy to the worker, not a security control — the server
   * re-normalises and re-validates. It exists so a typo does not cost a paid
   * SMS round trip.
   *
   * It deliberately calls the SAME normaliser the provider uses. The previous
   * inline `digits.length === 10` check disagreed with the server on the two
   * forms Indian workers actually type: "09876543210" (rejected as 11 digits)
   * and "+91 98765 43210" (rejected). One function, one answer.
   */
  function validPhone(raw: string): boolean {
    return isPlausiblePhone(raw);
  }

  async function handlePhoneSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const entered = String(formData.get("phone") ?? "").trim();
    setError(null);
    if (!validPhone(entered)) {
      setError(t("wauth_phone_err"));
      return;
    }
    // Normalise before the provider sees it, so the identifier used to request
    // the code is byte-identical to the one used to verify it. Convex Auth
    // compares these strings directly and throws on any mismatch.
    const phone = normalisePhone(entered);
    setIsLoading(true);
    try {
      await requestPhoneOtp({ phone });
      // Convex Auth decides between "send a code" and "verify a code" by
      // whether `code` is *present*, not whether it is non-empty: see
      // handleEmailAndPhoneProvider, which branches on
      // `args.params?.code !== undefined`. Sending an empty `code` here would
      // take the verify path with a blank code and never send an SMS at all.
      // So the send step carries the phone number and nothing else.
      const sendForm = new FormData();
      sendForm.set("phone", phone);
      await signIn(PHONE_PROVIDER_ID, sendForm);
      setStep({ kind: "phone", to: phone });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") ?? "").trim();
      await requestOtp({ email });
      await signIn("email-otp", formData);
      setStep({ kind: "email", to: email });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send the verification code. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCodeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "signIn") return;
    setIsLoading(true);
    setError(null);
    try {
      const provider = step.kind === "phone" ? PHONE_PROVIDER_ID : EMAIL_PROVIDER_ID;
      const formData = new FormData();
      if (step.kind === "phone") formData.set("phone", step.to);
      else formData.set("email", step.to);
      formData.set("code", code);
      await signIn(provider, formData);
      navigate(redirect);
    } catch {
      setError(t("wauth_wrong_code"));
      setCode("");
    } finally {
      setIsLoading(false);
    }
  }

  const backToStart = () => {
    setStep("signIn");
    setCode("");
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-teal-900 text-white">
              <HandHeart className="size-4" />
            </span>
            <span className="text-sm font-bold text-slate-900">Sahakar Seva</span>
          </Link>
          <LanguagePicker />
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
        <BackToHome />
      </div>

      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2">
        {/* Left: what a worker gets */}
        <div className="hidden lg:block">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-teal-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-teal-900">
            <BadgeCheck className="size-3.5" />
            {t("wauth_badge")}
          </span>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-slate-900">
            {t("wauth_title")}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600">
            {t("ld_work_desc")}
          </p>
          <ul className="mt-6 space-y-3 text-sm text-slate-700">
            <li className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl border border-teal-200 bg-teal-50">
                <HandCoins className="size-4 text-teal-700" />
              </span>
              {t("wauth_benefit_payout")}
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl border border-teal-200 bg-teal-50">
                <BadgeCheck className="size-4 text-teal-700" />
              </span>
              {t("wauth_benefit_credential")}
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl border border-teal-200 bg-teal-50">
                <HandHeart className="size-4 text-teal-700" />
              </span>
              {t("wauth_benefit_welfare")}
            </li>
          </ul>
        </div>

        {/* Right: sign-in card */}
        <div className="mx-auto w-full max-w-sm">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {step === "signIn" ? (
              <>
                <div className="px-6 pt-6 text-center">
                  <div className="mx-auto mb-1 flex size-10 items-center justify-center rounded-xl bg-teal-900 text-white">
                    <HandHeart className="size-5" />
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    {t("wauth_title")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {delivery === undefined
                      ? t("wauth_checking")
                      : method === "phone" && smsReady
                        ? t("wauth_sub")
                        : t("wauth_email_sub")}
                  </p>
                </div>

                {/* Method switch */}
                <div className="mx-6 mt-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setChoice("phone");
                      setError(null);
                    }}
                    disabled={!smsReady}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      method === "phone"
                        ? "bg-white text-teal-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Smartphone className="size-3.5" />
                    {t("wauth_tab_phone")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChoice("email");
                      setError(null);
                    }}
                    disabled={!emailReady}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      method === "email"
                        ? "bg-white text-teal-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Mail className="size-3.5" />
                    {t("wauth_tab_email")}
                  </button>
                </div>

                {method === "phone" ? (
                  <form onSubmit={handlePhoneSubmit}>
                    <div className="space-y-4 px-6 py-5">
                      <div className="relative">
                        <MessageSquare className="absolute left-3 top-3 size-4 text-slate-400" />
                        <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                          +91
                        </span>
                        <Input
                          name="phone"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          placeholder={t("wauth_phone_ph")}
                          className="pl-[3.75rem]"
                          disabled={isLoading || !smsReady}
                          required
                        />
                      </div>
                      {error && (
                        <p className="text-sm font-semibold text-rose-600">{error}</p>
                      )}
                    </div>
                    <div className="px-6 pb-5">
                      <button
                        type="submit"
                        disabled={isLoading || !smsReady}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800 active:scale-95 disabled:opacity-50"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            {t("wauth_sending_sms")}
                          </>
                        ) : (
                          <>
                            {t("wauth_send_sms")}
                            <ArrowRight className="size-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleEmailSubmit}>
                    <div className="space-y-4 px-6 py-5">
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 size-4 text-slate-400" />
                        <Input
                          name="email"
                          type="email"
                          autoComplete="email"
                          placeholder={t("auth_email_ph")}
                          className="pl-9"
                          disabled={isLoading || !emailReady}
                          required
                        />
                      </div>
                      {error && (
                        <p className="text-sm font-semibold text-rose-600">{error}</p>
                      )}
                    </div>
                    <div className="px-6 pb-5">
                      <button
                        type="submit"
                        disabled={isLoading || !emailReady}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800 active:scale-95 disabled:opacity-50"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            {t("auth_sending")}
                          </>
                        ) : (
                          <>
                            {t("auth_send")}
                            <ArrowRight className="size-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <>
                <div className="px-6 pt-6 text-center">
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {step.kind === "phone"
                      ? t("wauth_sms_sent", { phone: step.to })
                      : t("auth_code_title")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {step.kind === "phone"
                      ? t("wauth_sms_desc", { phone: step.to })
                      : t("auth_code_desc", { email: step.to })}
                  </p>
                </div>
                <form onSubmit={handleCodeSubmit}>
                  <div className="px-6 py-5">
                    <div className="flex justify-center">
                      <InputOTP
                        value={code}
                        onChange={setCode}
                        maxLength={6}
                        disabled={isLoading}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && code.length === 6 && !isLoading) {
                            const form = (e.target as HTMLElement).closest("form");
                            if (form) form.requestSubmit();
                          }
                        }}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {error && (
                      <p className="mt-2 text-center text-sm font-semibold text-rose-600">
                        {error}
                      </p>
                    )}
                    {step.kind === "email" && (
                      <p className="mt-4 text-center text-sm text-slate-500">
                        {t("auth_didnt")}{" "}
                        <button
                          type="button"
                          onClick={backToStart}
                          className="font-bold text-teal-800 underline underline-offset-2"
                        >
                          {t("auth_try_again")}
                        </button>
                      </p>
                    )}
                    {step.kind === "email" && (
                      // A worker in the field often reaches this screen having
                      // tapped the wrong tab. Offer the SMS route rather than
                      // making them go back and start over.
                      <p className="mt-1.5 text-center text-sm text-slate-500">
                        <button
                          type="button"
                          onClick={() => {
                            setChoice("phone");
                            backToStart();
                          }}
                          className="font-bold text-teal-800 underline underline-offset-2"
                        >
                          {t("wauth_switch_to_phone")}
                        </button>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 px-6 pb-5">
                    <button
                      type="submit"
                      disabled={isLoading || code.length !== 6}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800 active:scale-95 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t("auth_verifying")}
                        </>
                      ) : (
                        <>
                          {t("auth_verify")}
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={backToStart}
                      disabled={isLoading}
                      className="w-full rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      {step.kind === "phone"
                        ? t("wauth_use_diff")
                        : t("auth_use_diff")}
                    </button>
                  </div>
                </form>
              </>
            )}

            <div className="border-t border-slate-200 bg-slate-50 px-6 py-3.5 text-center text-xs text-slate-500">
              {t("wauth_footnote")}
            </div>
            <div className="border-t border-slate-200 bg-white px-6 py-3.5 text-center text-xs text-slate-500">
              {t("wauth_customer_link")}{" "}
              <Link
                to="/login/customer"
                className="font-bold text-teal-800 underline underline-offset-2"
              >
                {t("wauth_customer_cta")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkerAuthPage() {
  return (
    <Suspense>
      <WorkerAuth />
    </Suspense>
  );
}
