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
import {
  ArrowRight,
  CalendarCheck,
  HandHeart,
  Loader2,
  Mail,
  MapPin,
  ShieldCheck,
  UserX,
  Wrench,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { BackToHome } from "@/components/BackToHome";

function resolveReturnTo(returnTo: string | null, fallback = "/services") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

/**
 * Booking-person (customer) portal sign-in.
 * Email OTP verification, with an optional guest pass to browse and book.
 */
function CustomerAuth() {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  /**
   * Whether a sign-in code can actually be delivered on this deployment.
   *
   * `sendVerificationRequest` throws when the delivery credential is absent,
   * and that exception propagates out of `auth:signIn`, so the client sees
   * `[CONVEX A(auth:signIn)] Server Error` — opaque, and on a screen whose
   * only option was the thing that failed. WorkerAuth already queries this;
   * the customer screens did not, so they offered a method that could not work.
   */
  const delivery = useQuery(api.authConfig.delivery, {});
  const emailReady = delivery?.emailOtp !== false;
  const { t } = useLang();
  const requestOtp = useMutation(api.authThrottle.requestOtp);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveReturnTo(searchParams.get("returnTo"));
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      // Spend part of the per-address send budget first, so repeated requests
      // cannot be used to mail codes to an arbitrary inbox.
      await requestOtp({ email: String(formData.get("email") ?? "") });
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
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

  async function handleOtpSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch {
      setError("The verification code you entered is incorrect.");
      setOtp("");
      setIsLoading(false);
    }
  }

  async function handleGuestLogin() {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch {
      setError("Could not start a guest session. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-800 text-white">
              <HandHeart className="size-4" />
            </span>
            <span className="text-sm font-bold text-slate-900">
              Sahakar Seva
            </span>
          </Link>
          <LanguagePicker />
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
        <BackToHome />
      </div>

      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2">
        {/* Left: themed booking-portal pitch */}
        <div className="hidden lg:block">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-900">
            <CalendarCheck className="size-3.5" />
            Customer Booking Portal
          </span>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-slate-900">
            Book verified artisans,
            <br />
            pay them directly.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600">
            Sign in to schedule electricians, plumbers, carpenters and more —
            track them live on the GPS radar, and settle over UPI. Zero
            commission: every rupee goes where it belongs.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-slate-700">
            <li className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50">
                <ShieldCheck className="size-4 text-emerald-700" />
              </span>
              KYC-verified, trade-certified artisans only
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50">
                <MapPin className="size-4 text-emerald-700" />
              </span>
              Live GPS radar with doorstep arrival alerts
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50">
                <Wrench className="size-4 text-emerald-700" />
              </span>
              90% of every payment goes straight to the worker
            </li>
          </ul>
        </div>

        {/* Right: sign-in card */}
        <div className="mx-auto w-full max-w-sm">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {step === "signIn" ? (
              <>
                <div className="px-6 pt-6 text-center">
                  <div className="mx-auto mb-1 flex size-10 items-center justify-center rounded-xl bg-emerald-800 text-white">
                    <CalendarCheck className="size-5" />
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    Book with an account
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {emailReady
                      ? "Enter your email and we'll send a one-time code."
                      : t("auth_code_unavailable")}
                  </p>
                </div>
                <form onSubmit={handleEmailSubmit}>
                  <div className="space-y-4 px-6 py-5">
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 size-4 text-slate-400" />
                      <Input
                        name="email"
                        placeholder={t("auth_email_ph")}
                        type="email"
                        className="pl-9"
                        disabled={isLoading || !emailReady}
                        required
                      />
                    </div>
                    {error && (
                      <p className="text-sm font-semibold text-rose-600">
                        {error}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 px-6 pb-5">
                    <button
                      type="submit"
                      disabled={isLoading || !emailReady}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
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
                    <div className="relative w-full">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-slate-200" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-white px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {t("auth_or")}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleGuestLogin}
                      disabled={isLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                    >
                      <UserX className="size-4" />
                      {t("auth_guest")}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="px-6 pt-6 text-center">
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {t("auth_code_title")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {t("auth_code_desc", { email: step.email })}
                  </p>
                </div>
                <form onSubmit={handleOtpSubmit}>
                  <div className="px-6 py-5">
                    <input type="hidden" name="email" value={step.email} />
                    <input type="hidden" name="code" value={otp} />
                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={setOtp}
                        maxLength={6}
                        disabled={isLoading}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            otp.length === 6 &&
                            !isLoading
                          ) {
                            const form = (
                              e.target as HTMLElement
                            ).closest("form");
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
                    <p className="mt-4 text-center text-sm text-slate-500">
                      {t("auth_didnt")}{" "}
                      <button
                        type="button"
                        onClick={() => setStep("signIn")}
                        className="font-bold text-emerald-700 underline underline-offset-2"
                      >
                        {t("auth_try_again")}
                      </button>
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 px-6 pb-5">
                    <button
                      type="submit"
                      disabled={isLoading || otp.length !== 6}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
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
                      onClick={() => setStep("signIn")}
                      disabled={isLoading}
                      className="w-full rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      {t("auth_use_diff")}
                    </button>
                  </div>
                </form>
              </>
            )}
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-3.5 text-center text-xs text-slate-500">
              Are you an artisan?{" "}
              <Link
                to="/login/worker"
                className="font-bold text-emerald-700 underline underline-offset-2"
              >
                Sign in as a worker →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomerAuthPage() {
  return (
    <Suspense>
      <CustomerAuth />
    </Suspense>
  );
}
