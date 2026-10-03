import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EMAIL_PROVIDER_ID } from "@/lib/authProviders";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, LockKeyhole, ShieldCheck, X } from "lucide-react";

interface AdminLoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Federation Officer clearance dialog.
 *
 * Clearance is granted by proving ownership of a registered officer email
 * (one-time 6-digit code sent to that inbox). There is no shared-secret
 * fallback for real officers: any passcode baked into this file would ship in
 * the public JS bundle. The one exception is the fixed demo account, which is
 * a documented convenience door for judges — the server still re-checks the
 * address against the demo list, so only that one account can use it.
 */
export default function AdminLoginModal({ open, onClose, onSuccess }: AdminLoginModalProps) {
  const { isLoading, signIn } = useAuth();
  const requestOtp = useMutation(api.authThrottle.requestOtp);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Spend part of the per-address send budget first, so repeated requests
      // cannot be used to mail codes to an arbitrary inbox.
      await requestOtp({ email });
      const fd = new FormData();
      fd.set("email", email);
      await signIn(EMAIL_PROVIDER_ID, fd);
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  }

  /** One-click entry for the fixed demo federation officer. */
  async function handleDemoSignIn() {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("email", "demo.admin@sahakar.demo");
      fd.set("code", "000000");
      await signIn("demo-admin", fd);
      onSuccess();
    } catch {
      setError("The demo account is unavailable on this deployment.");
      setBusy(false);
    }
  }

  /** One-click entry for the fixed demo SUPER admin (platform tier). */
  async function handleDemoSuperSignIn() {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("email", "super.admin@sahakar.demo");
      fd.set("code", "000000");
      await signIn("demo-superadmin", fd);
      onSuccess();
    } catch {
      setError("The demo account is unavailable on this deployment.");
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("code", otp);
      await signIn(EMAIL_PROVIDER_ID, fd);
      // Session cleared; the officer-email check happens server-side.
      onSuccess();
    } catch {
      setError("The code is incorrect or expired. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-800 text-white">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">
                Federation Officer Clearance
              </h2>
              <p className="text-[11px] text-slate-500">
                Restricted governance area
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {!otpSent ? (
          <form onSubmit={handleSendOtp} className="px-6 py-6">
            <label className="block text-xs font-bold text-slate-700">
              Officer email address
            </label>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Enter the email registered with the cooperative board. We will
              send a 6-digit verification code to that inbox.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="officer@sahakar.demo"
              className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {error && (
              <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy || isLoading || !email.trim()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 active:scale-95 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
              Send verification code
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="px-6 py-6">
            <label className="block text-xs font-bold text-slate-700">
              Enter the 6-digit code
            </label>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Sent to <span className="font-semibold text-slate-700">{email}</span>.
              Codes expire in 15 minutes.
            </p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center font-mono text-xl tracking-[0.5em] text-slate-900 transition placeholder:text-slate-300 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {error && (
              <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy || otp.length !== 6}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 active:scale-95 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Verify &amp; enter console
            </button>
            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setOtp("");
                setError(null);
              }}
              className="mt-3 w-full text-center text-[11px] font-semibold text-slate-500 transition hover:text-emerald-700"
            >
              Use a different email
            </button>
          </form>
        )}

        <div className="rounded-b-3xl border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={() => void handleDemoSuperSignIn()}
            disabled={busy || isLoading}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-400 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="size-3.5" />
            )}
            Sign in as demo super admin
          </button>
          <button
            type="button"
            onClick={() => void handleDemoSignIn()}
            disabled={busy || isLoading}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="size-3.5" />
            )}
            Sign in as demo officer
          </button>
          <p className="text-center text-[10px] leading-relaxed text-slate-400">
            Clearance attempts are written to the federation audit ledger.
            Officer status is verified on the server, never in the browser.
          </p>
        </div>
      </div>
    </div>
  );
}
