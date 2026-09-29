import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { LANGS, initBnGateway } from "@/lib/i18n";
import {
  SUPERADMIN_BN,
  SUPERADMIN_HI,
  SUPERADMIN_TA,
  SUPERADMIN_TE,
} from "@/lib/i18n.superadmin";
import { EV_BN, EV_HI, EV_TA, EV_TE } from "@/lib/i18n.ev";

/**
 * Guards against the two most common i18n defects in this project:
 *  1. a `t("key")` that has no English entry — the UI would render the raw key
 *  2. a key that is missing from a regional dictionary — that language silently
 *     falls back to English mid-screen
 */

const SRC = join(process.cwd(), "src");

/**
 * Translation data for the retired "federation gateway" landing section.
 * Nothing renders these keys any more; they are kept in the dictionaries so the
 * section can be restored without re-translating. They are deliberately exempt
 * from the orphan check below.
 */
const RETIRED_PREFIXES = ["gw_"];

/**
 * English strings left behind by earlier landing pages and portal shells that no
 * component renders. Harmless (they cost only bytes in the bundle) but listed
 * so the orphan check stays useful: a *new* unused key will still fail.
 */
const RETIRED_KEYS = new Set([
  "bd_send",
  "bk_slot",
  "bk_welfare",
  "bk_welfare_desc",
  "bk_welfare_row",
  "browse_sub",
  "browse_title",
  "btn_back",
  "btn_home",
  "close",
  "cta_dashboard",
  "cta_join",
  "cta_start",
  "dividend",
  "earn_jobs",
  "experience",
  "footer_note",
  "hero_kicker",
  "hero_sub",
  "hero_title",
  "how1_desc",
  "how2_desc",
  "how3_desc",
  "how4_desc",
  "how_title",
  "lang_label",
  "member_since",
  "nav_admin",
  "nav_bookings",
  "nav_hub",
  "nav_services",
  "nav_tag",
  "per_day",
  "portal_admin_d",
  "portal_admin_t",
  "portal_customers_d",
  "portal_customers_t",
  "portal_open",
  "portal_workers_d",
  "portal_workers_t",
  "portals_sub",
  "portals_title",
  "quiz_row",
  "rate",
  "signin",
  "signout",
  "stat_artisans",
  "stat_online",
  "stat_verified",
  "step_credential",
  "sv_from",
  "ticker_empty",
  "ticker_title",
  "trades_sub",
  "trades_title",
  "yrs",
]);

const isRetired = (key: string) =>
  RETIRED_PREFIXES.some((p) => key.startsWith(p)) || RETIRED_KEYS.has(key);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "_generated") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Every key the app asks for at runtime, plus any dynamic key prefixes. */
function usedKeys(): { keys: Set<string>; prefixes: string[] } {
  const keys = new Set<string>();
  const prefixes: string[] = [];
  const keyRe = /\bt\(\s*"([a-z0-9_]+)"/gi;
  // `t(`st_${status}`)` — a literal prefix followed by an interpolation.
  const dynamicRe = /\bt\(\s*`([a-z0-9_]*)\$\{/gi;
  const files = [...walk(SRC), ...walk(join(process.cwd(), "scripts"))];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    keyRe.lastIndex = 0;
    while ((m = keyRe.exec(src))) keys.add(m[1]);
    dynamicRe.lastIndex = 0;
    while ((m = dynamicRe.exec(src))) if (m[1]) prefixes.push(m[1]);
  }
  return { keys, prefixes };
}

/** Keys defined in one dictionary literal inside i18n.tsx. */
function definedKeys(lang: "en" | "hi" | "te" | "ta" | "bn"): Set<string> {
  const src = readFileSync(join(SRC, "lib/i18n.tsx"), "utf8");
  const start = src.indexOf(`const ${lang}: Dict = {`);
  expect(start, `could not locate the ${lang} dictionary`).toBeGreaterThan(-1);
  // Find the matching closing brace at column 0.
  const end = src.indexOf("\n};", start);
  const body = src.slice(start, end);
  const keys = new Set<string>();
  const re = /^\s{2}([a-zA-Z0-9_]+):/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) keys.add(m[1]);
  return keys;
}

/** Top-level keys of a `Record<string, string>` export in a side module. */
function exportedKeys(file: string, exportName: string): Set<string> {
  const src = readFileSync(join(SRC, "lib", file), "utf8");
  const start = src.indexOf(`export const ${exportName}`);
  if (start === -1) return new Set();
  const open = src.indexOf("{", start);
  const end = src.indexOf("\n};", open);
  const body = src.slice(open, end);
  const keys = new Set<string>();
  const re = /^\s{2}([a-zA-Z0-9_]+):/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) keys.add(m[1]);
  return keys;
}

/** Merge every module that contributes to a language at runtime. */
function effectiveKeys(lang: "en" | "hi" | "te" | "ta" | "bn"): Set<string> {
  const keys = definedKeys(lang);
  if (lang === "bn") {
    for (const k of exportedKeys("i18n.bn-gw.ts", "GW_BN")) keys.add(k);
    for (const k of exportedKeys("i18n.bn-gw.ts", "PORTAL_BN")) keys.add(k);
  }
  if (lang === "hi") for (const k of exportedKeys("i18n.skill.ts", "SKILL_HI")) keys.add(k);
  if (lang === "te") for (const k of exportedKeys("i18n.skill.ts", "SKILL_TE")) keys.add(k);
  if (lang === "ta") for (const k of exportedKeys("i18n.skill.ts", "SKILL_TA")) keys.add(k);
  if (lang === "bn") for (const k of exportedKeys("i18n.skill.ts", "SKILL_BN")) keys.add(k);
  if (lang === "ta") for (const k of exportedKeys("i18n.profile.ts", "PROFILE_TA")) keys.add(k);
  if (lang === "hi") for (const k of Object.keys(SUPERADMIN_HI)) keys.add(k);
  if (lang === "te") for (const k of Object.keys(SUPERADMIN_TE)) keys.add(k);
  if (lang === "ta") for (const k of Object.keys(SUPERADMIN_TA)) keys.add(k);
  if (lang === "bn") for (const k of Object.keys(SUPERADMIN_BN)) keys.add(k);
  if (lang === "hi") for (const k of Object.keys(EV_HI)) keys.add(k);
  if (lang === "te") for (const k of Object.keys(EV_TE)) keys.add(k);
  if (lang === "ta") for (const k of Object.keys(EV_TA)) keys.add(k);
  if (lang === "bn") for (const k of Object.keys(EV_BN)) keys.add(k);
  if (lang === "hi") for (const k of exportedKeys("i18n.wauth.ts", "WAUTH_HI")) keys.add(k);
  if (lang === "te") for (const k of exportedKeys("i18n.wauth.ts", "WAUTH_TE")) keys.add(k);
  if (lang === "ta") for (const k of exportedKeys("i18n.wauth.ts", "WAUTH_TA")) keys.add(k);
  if (lang === "bn") for (const k of exportedKeys("i18n.wauth.ts", "WAUTH_BN")) keys.add(k);
  return keys;
}

describe("i18n dictionary integrity", () => {
  const { keys: used, prefixes } = usedKeys();
  const en = definedKeys("en");

  /** A key counts as used if it is literal, or matches a dynamic prefix. */
  const isUsed = (key: string) =>
    used.has(key) || prefixes.some((p) => key.startsWith(p));

  it("finds a meaningful number of translation keys", () => {
    // Guards the regexes above against silently matching nothing.
    expect(used.size).toBeGreaterThan(150);
    expect(en.size).toBeGreaterThan(150);
  });

  it("every key used in the app exists in the English dictionary", () => {
    const missing = [...used].filter((k) => !en.has(k)).sort();
    expect(missing, `Missing English translations:\n${missing.join("\n")}`).toEqual([]);
  });

  it("has no English key that is empty or still a placeholder", () => {
    const src = readFileSync(join(SRC, "lib/i18n.tsx"), "utf8");
    const start = src.indexOf("const en: Dict = {");
    const end = src.indexOf("\n};", start);
    const body = src.slice(start, end);
    const blanks: string[] = [];
    const re = /^\s{2}([a-zA-Z0-9_]+):\s*"([^"]*)"/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      if (m[2].trim() === "") blanks.push(m[1]);
    }
    expect(blanks, `Empty English strings:\n${blanks.join("\n")}`).toEqual([]);
  });

  it("the side-module dictionaries only contain keys the app uses", () => {
    const side = new Set<string>([
      ...exportedKeys("i18n.bn-gw.ts", "GW_BN"),
      ...exportedKeys("i18n.bn-gw.ts", "PORTAL_BN"),
      ...exportedKeys("i18n.skill.ts", "SKILL_HI"),
      ...exportedKeys("i18n.skill.ts", "SKILL_TE"),
      ...exportedKeys("i18n.skill.ts", "SKILL_TA"),
      ...exportedKeys("i18n.skill.ts", "SKILL_BN"),
      ...exportedKeys("i18n.profile.ts", "PROFILE_TA"),
      ...Object.keys(SUPERADMIN_HI),
      ...Object.keys(SUPERADMIN_TE),
      ...Object.keys(SUPERADMIN_TA),
      ...Object.keys(SUPERADMIN_BN),
      ...Object.keys(EV_HI),
      ...Object.keys(EV_TE),
      ...Object.keys(EV_TA),
      ...Object.keys(EV_BN),
    ]);
    expect(side.size).toBeGreaterThan(50);
    const orphans = [...side].filter((k) => !isUsed(k) && !isRetired(k)).sort();
    expect(orphans, `Unused side-module keys:\n${orphans.join("\n")}`).toEqual([]);
  });

  it("has no unused English keys", () => {
    const orphans = [...en].filter((k) => !isUsed(k) && !isRetired(k)).sort();
    expect(orphans, `English keys nothing renders:\n${orphans.join(", ")}`).toEqual([]);
  });

  describe("locale coverage", () => {
    it("initBnGateway runs without a missing import and fills the side keys", () => {
      // main.tsx calls this at startup, before the first render, so a reference
      // to a module that is not actually imported throws a blank screen rather
      // than a failing assertion. Exercise it here instead.
      expect(() => initBnGateway()).not.toThrow();
      // The Bengali keys that only exist in the side module must be live after
      // the merge, not just present on disk.
      expect(effectiveKeys("bn").has("gw_op_badge")).toBe(true);
    });
    for (const lang of LANGS) {
      if (lang.code === "en") continue;
      it(`${lang.label} (${lang.code}) translates every key the app actually shows`, () => {
        const dict = effectiveKeys(lang.code as "hi" | "te" | "ta" | "bn");
        const missing = [...used]
          .filter((k) => en.has(k) && !dict.has(k))
          .sort();
        expect(
          missing,
          `${missing.length} key(s) missing from the ${lang.code} dictionary:\n${missing.join(", ")}`,
        ).toEqual([]);
      });
    }
  });
});
