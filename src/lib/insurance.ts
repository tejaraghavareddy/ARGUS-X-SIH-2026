/**
 * Claim categories and cover routes, shared by the Convex backend and the UI.
 *
 * These live here rather than in `src/convex/insurance.ts` because a generated
 * `api.*` reference only exposes function endpoints — a value export from a
 * Convex module is not reachable from the client. The server imports from here
 * too, so the two can never disagree about what a valid route is.
 */

export const CLAIM_CATEGORIES = [
  { id: "accident", label: "Accident on the job" },
  { id: "injury", label: "Injury" },
  { id: "property", label: "Damage to customer property" },
  { id: "liability", label: "Liability / third party" },
  { id: "other", label: "Other" },
] as const;

export const CLAIM_ROUTES = [
  {
    id: "pmjjby",
    label: "PMJJBY — PM Suraksha Bima Yojana",
    note: "Government accidental insurance. ₹2 lakh/year cover for registered unorganised workers aged 18–59.",
    url: "https://account.gib.gov.in/",
  },
  {
    id: "society_pool",
    label: "Society welfare pool",
    note: "The 7% welfare share accumulated on completed jobs. Adjudicated by the society committee.",
    url: null,
  },
  {
    id: "external",
    label: "External insurer / third party",
    note: "Forwarded to a partner policy. The cooperative supplies the job record only.",
    url: null,
  },
] as const;

export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number]["id"];
export type ClaimRoute = (typeof CLAIM_ROUTES)[number]["id"];

export const CLAIM_STATUSES = [
  "open",
  "forwarded",
  "settled",
  "rejected",
] as const;

export const isClaimCategory = (v: string): v is ClaimCategory =>
  CLAIM_CATEGORIES.some((c) => c.id === v);

export const isClaimRoute = (v: string): v is ClaimRoute =>
  CLAIM_ROUTES.some((r) => r.id === v);

export const isClaimStatus = (v: string): boolean =>
  (CLAIM_STATUSES as readonly string[]).includes(v);
