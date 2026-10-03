import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { EMAIL_PROVIDER_ID } from "@/lib/authProviders";
import { useLang } from "@/lib/i18n";
import { ArrowRight, HandHeart, Loader2, Mail, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { BackToHome } from "@/components/BackToHome";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  /**
   * Whether a sign-in code can actually be delivered on this deployment.
   *
   * `sendVerificationRequest` throws when the delivery credential is absent and
   * that exception propagates out of `auth:signIn`, surfacing as
   * `[CONVEX A(auth:signIn)] Server Error` — opaque, on the one screen whose
   * only option was the thing that failed. WorkerAuth already queries this; the
   * customer screens did not.
   */
  const delivery = useQuery(api.authConfig.delivery, {});
  /**
   * Fail CLOSED while the answer is unknown.
   *
   * `delivery?.emailOtp !== false` looks safe but is the opposite: while the
   * query is in flight `delivery` is `undefined`, `undefined !== false` is
   * true, and the form is live for that window. Submitting inside it threw from
   * the provider and surfaced as `[CONVEX A(auth:signIn)] Server Error`. An
   * unknown answer is therefore treated as "not deliverable", so the only way
   * to submit an address is after the server confirms a code can be sent.
   */
  const emailReady = delivery?.emailOtp === true;
  const { t } = useLang();
  const requestOtp = useMutation(api.authThrottle.requestOtp);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      // Spend part of the per-address send budget first, so repeated requests
      // cannot be used to mail codes to an arbitrary inbox.
      await requestOtp({ email: String(formData.get("email") ?? "") });
      await signIn(EMAIL_PROVIDER_ID, formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn(EMAIL_PROVIDER_ID, formData);
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(t("auth_guest_error"));
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top band */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-800 text-white">
              <HandHeart className="size-4" />
            </span>
            <span className="text-sm font-bold text-slate-900">Sahakar Seva</span>
          </Link>
          <LanguagePicker />
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl px-4 pt-3 sm:px-6">
        <BackToHome />
      </div>

      {/* Auth content */}
      <div className="tl-glow flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm overflow-hidden rounded-3xl border-slate-200 pt-0 shadow-sm">
          {step === "signIn" ? (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto mb-1 flex size-10 items-center justify-center rounded-xl bg-emerald-800 text-white">
                  <HandHeart className="size-5" />
                </div>
                <CardTitle className="text-xl font-extrabold text-slate-900">{t("auth_title")}</CardTitle>
                <CardDescription>
                  {delivery === undefined
                    ? t("wauth_checking")
                    : emailReady
                      ? t("auth_desc")
                      : t("auth_code_unavailable")}
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleEmailSubmit}>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
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
                    <p className="text-sm font-semibold text-rose-600">{error}</p>
                  )}
                </CardContent>
                <CardFooter className="flex-col gap-3">
                  <Button type="submit" className="w-full" disabled={isLoading || !emailReady}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("auth_sending")}
                      </>
                    ) : (
                      <>
                        {t("auth_send")}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <div className="relative w-full">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">
                        {t("auth_or")}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleGuestLogin}
                    disabled={isLoading}
                  >
                    <UserX className="mr-2 h-4 w-4" />
                    {t("auth_guest")}
                  </Button>
                </CardFooter>
              </form>
            </>
          ) : (
            <>
              <CardHeader className="text-center">
                <CardTitle>{t("auth_code_title")}</CardTitle>
                <CardDescription>
                  {t("auth_code_desc", { email: step.email })}
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleOtpSubmit}>
                <CardContent className="pb-4">
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
                          const form = (e.target as HTMLElement).closest(
                            "form",
                          );
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
                  <p className="mt-4 text-center text-sm text-muted-foreground">
                    {t("auth_didnt")}{" "}
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => setStep("signIn")}
                    >
                      {t("auth_try_again")}
                    </Button>
                  </p>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || otp.length !== 6}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("auth_verifying")}
                      </>
                    ) : (
                      <>
                        {t("auth_verify")}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep("signIn")}
                    disabled={isLoading}
                    className="w-full"
                  >
                    {t("auth_use_diff")}
                  </Button>
                </CardFooter>
              </form>
            </>
          )}
          <div className="border-t bg-muted px-6 py-4 text-center text-xs text-muted-foreground">
            {t("secured")}{" "}
            <a
              href="https://freebuff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary transition-colors"
            >
              freebuff.com
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
