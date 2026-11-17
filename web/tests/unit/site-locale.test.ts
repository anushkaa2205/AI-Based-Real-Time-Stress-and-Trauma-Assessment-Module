/** Task P.5 (FR-LANG-07, AC-LANG-05): the site language, English by default, from one cookie. */
import { describe, expect, it } from "vitest";
import { MESSAGES, leafKeys } from "@/core/i18n/messages";
import { DEFAULT_LOCALE, LOCALE_COOKIE, SITE_LOCALES, localeCookie, siteLocale } from "@/i18n/locale";

describe("site language (P.5)", () => {
  it("is English unless the cookie names a supported language", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(siteLocale(undefined)).toBe("en");
    expect(siteLocale("fr")).toBe("en");
    expect(siteLocale("hi")).toBe("hi");
    expect([...SITE_LOCALES]).toEqual(["en", "hi", "mr", "ta", "bn"]);
  });

  it("is remembered for a year in NEXT_LOCALE, with no language prefix in URLs", () => {
    const c = localeCookie("ta");
    expect(LOCALE_COOKIE).toBe("NEXT_LOCALE");
    expect(c).toMatch(/^NEXT_LOCALE=ta; Path=\/; Max-Age=31536000; SameSite=Lax$/);
  });

  it("has every public, login and track string in all five languages", () => {
    const en = leafKeys(MESSAGES.en).filter((k) => /^(public|login|track|languageNames)\./.test(k));
    expect(en.length).toBeGreaterThan(30);
    for (const lang of SITE_LOCALES) {
      const have = new Set(leafKeys(MESSAGES[lang]));
      for (const k of en) expect(have.has(k), `${lang}: ${k}`).toBe(true);
    }
  });
});
