/** Task P.7: the portal journey's structure and its guard rails (NIVARA_FLOW_AND_UI_PLAN.md §6.3, §8.4). */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { errorKey, KNOWN_ERRORS } from "@/components/portal/portal-api";
import { MESSAGES } from "@/core/i18n/messages";

const WEB = resolve(__dirname, "../..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });

describe("portal journey (P.7)", () => {
  it("has /start, /start/write and /start/speak, and no old demo pages", () => {
    for (const p of ["start/page.tsx", "start/layout.tsx", "start/write/page.tsx", "start/speak/page.tsx"]) expect(existsSync(resolve(WEB, "src/app/(public)", p)), p).toBe(true);
    expect(existsSync(resolve(WEB, "src/app/(public)/demo"))).toBe(false);
    expect(existsSync(resolve(WEB, "src/components/demo"))).toBe(false);
  });

  it("sends the old demo URLs to /start for good", () => {
    const cfg = readFileSync(resolve(WEB, "next.config.ts"), "utf8");
    for (const u of ["/demo", "/demo/text", "/demo/call", "/demo/recording"]) expect(cfg).toContain(`"${u}"`);
    expect(cfg).toMatch(/destination: "\/start", permanent: true/);
  });

  it("never imports staff screens, scoring or score labels into public pages (rule 1)", () => {
    const pub = [...files(resolve(WEB, "src/app/(public)")), ...files(resolve(WEB, "src/components/portal")), ...files(resolve(WEB, "src/components/public"))];
    for (const f of pub) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/from "@\/components\/staff/);
      expect(src, f).not.toMatch(/from "@\/core\/scoring/);
      expect(src, f).not.toMatch(/\b(svi|riskBand|currentBand)\b/i);
    }
  });

  it("never lets the page write the assistant's lines: no sender is sent from the portal", () => {
    for (const f of files(resolve(WEB, "src/components/portal"))) expect(readFileSync(f, "utf8"), f).not.toMatch(/sender:/);
  });

  it("has scripted wording for every error it can show, in all five languages", () => {
    expect(errorKey("LINE_BUSY")).toBe("LINE_BUSY");
    expect(errorKey("SOMETHING_ELSE")).toBe("ANALYSIS_DEGRADED");
    expect(errorKey(null)).toBe("ANALYSIS_DEGRADED");
    for (const lang of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) {
      const errors = (MESSAGES[lang] as unknown as { portal: { errors: Record<string, string> } }).portal.errors;
      for (const code of KNOWN_ERRORS) expect(errors[code], `${lang}: ${code}`).toBeTruthy();
    }
  });
});
