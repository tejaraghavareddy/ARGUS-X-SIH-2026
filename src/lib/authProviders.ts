/**
 * Convex Auth provider ids, shared by the sign-in screens and the server-side
 * provider definitions.
 *
 * This lives outside `src/convex/` on purpose: the provider modules import
 * server-only code (Convex Auth's `Phone` factory and axios), and pulling that
 * into the browser bundle would be both wasteful and wrong. A plain constants
 * module is the one file both sides can import.
 *
 * The ids are asserted in src/test/workerAuth.test.ts, because a mismatch is
 * silent at build time and fails at runtime as "Provider `x` is not
 * configured" — the screen would simply never work.
 */
export const PHONE_PROVIDER_ID = "phone-otp";
export const EMAIL_PROVIDER_ID = "email-otp";

/**
 * Normalise a user-typed Indian mobile number to E.164 (+91XXXXXXXXXX).
 *
 * This lives in the shared module rather than in `src/convex/auth/phoneOtp.ts`
 * because BOTH sides need it and must agree exactly.
 *
 * Convex Auth's `Phone` provider stores the identifier used at sign-in and,
 * on verification, throws unless `params.phone` is byte-identical to it:
 *
 *     if (account.providerAccountId !== params.phone) throw ...
 *
 * So the string the screen sends on "send a code" is the string that must come
 * back on "verify a code". Previously the screen rebuilt it with a one-line
 * `+91${digits}` while the server used the fuller function below, and the two
 * disagreed on exactly the inputs Indian workers actually type:
 *
 *     "09876543210"  →  screen sent +9109876543210  (wrong number)
 *     "+91 98765 43210"  →  screen rejected it as not 10 digits
 *
 * A worker typing their own number correctly was locked out. One function,
 * imported by the provider and the form, removes that whole class of bug.
 */
export function normalisePhone(raw: string): string {
  // Strip the separators people type for legibility.
  let digits = (raw ?? "").replace(/[\s\-()]/g, "");
  // A leading "+" means the number is already international.
  const hasPlus = digits.startsWith("+");
  digits = digits.replace(/\D/g, "");
  if (!hasPlus) {
    // "09876543210" — a leading trunk zero is how Indians write a mobile number
    // locally; internationally it is dropped.
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    // A bare 10-digit number is assumed Indian, which is the only market this
    // federation operates in.
    if (digits.length === 10) return `+91${digits}`;
  }
  if (digits.length < 8 || digits.length > 15) {
    throw new Error("Enter a valid mobile number.");
  }
  return `+${digits}`;
}

/**
 * Whether a typed number is worth a paid SMS round trip.
 *
 * Uses the same normaliser as the provider, so the client can never disagree
 * with the server about what counts as a usable number. Returns false rather
 * than throwing, because a form field wants a boolean.
 */
export function isPlausiblePhone(raw: string): boolean {
  try {
    normalisePhone(raw);
    return true;
  } catch {
    return false;
  }
}
