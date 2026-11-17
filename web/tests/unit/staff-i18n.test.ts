/** Task P.8 (FR-LANG-07, AC-LANG-05): every staff label exists in all five languages, for every enum value shown. */
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/core/i18n/messages";
import { SITE_LOCALES } from "@/i18n/locale";
import { STAFF_PAGES } from "@/lib/staff-nav";
import { CASE_STATUSES, CHANNELS, DIMENSIONS, INDICATOR_STATUSES, RECOMMENDATION_STATUSES, REFERRAL_STATUSES, RISK_BANDS, ROLES, SIGNAL_SOURCES, SUPPORT_TYPES, URGENCIES } from "@/models/enums";

type Tree = Record<string, unknown>;
const at = (lang: (typeof SITE_LOCALES)[number], path: string): unknown => path.split(".").reduce<unknown>((n, k) => (n && typeof n === "object" ? (n as Tree)[k] : undefined), MESSAGES[lang]);

describe("staff portals in five languages (P.8)", () => {
  const groups: [string, readonly string[]][] = [
    ["staff.nav", Object.keys(STAFF_PAGES)],
    ["staff.roles", ROLES],
    ["staff.bands", RISK_BANDS],
    ["staff.status", CASE_STATUSES],
    ["staff.channels", CHANNELS],
    ["staff.enums.dimensions", DIMENSIONS],
    ["staff.enums.sources", SIGNAL_SOURCES],
    ["staff.enums.indicatorStatus", INDICATOR_STATUSES],
    ["staff.enums.support", SUPPORT_TYPES],
    ["staff.enums.urgency", URGENCIES],
    ["staff.enums.recStatus", RECOMMENDATION_STATUSES],
    ["staff.enums.referralStatus", REFERRAL_STATUSES],
  ];
  for (const [path, values] of groups) {
    it(`labels every value of ${path}`, () => {
      for (const lang of SITE_LOCALES) for (const v of values) expect(typeof at(lang, `${path}.${v}`), `${lang}: ${path}.${v}`).toBe("string");
    });
  }

  it("translates, rather than copies, the main labels outside English", () => {
    for (const lang of SITE_LOCALES.filter((l) => l !== "en")) {
      expect(at(lang, "staff.queue.title")).not.toBe(at("en", "staff.queue.title"));
      expect(at(lang, "staff.bands.CRITICAL")).not.toBe(at("en", "staff.bands.CRITICAL"));
      expect(at(lang, "staff.shell.signOut")).not.toBe(at("en", "staff.shell.signOut"));
    }
  });
});
