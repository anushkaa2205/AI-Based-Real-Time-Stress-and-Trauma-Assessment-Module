/**
 * Accessibility (task 9.4, AC-ACC-01, NFR-ACC): axe-core WCAG 2.1 A/AA rules on every victim page,
 * and a keyboard-only pass. A real low-end phone and a screen-reader session still need a person.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { freshIp } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function audit(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const problems = r.violations.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}×) ${v.nodes[0]?.target.join(" ") ?? ""}`);
  expect(problems, `${label}\n${problems.join("\n")}`).toEqual([]);
}

test("victim pages have no WCAG 2.1 AA violations (AC-ACC-01)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
  // Public pages (task F.2): homepage in every language, How it works, Privacy, and the phone menu open.
  for (const lang of ["en", "hi", "mr", "ta", "bn"]) {
    await page.goto(lang === "en" ? "/" : `/?lang=${lang}`);
    await audit(page, `home ${lang}`);
  }
  await page.goto("/how-it-works?lang=ta");
  await audit(page, "how it works");
  await page.goto("/privacy?lang=hi");
  await audit(page, "privacy");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await page.getByTestId("site-menu").locator("summary").click();
  await audit(page, "home 320px, menu open");
  await page.setViewportSize({ width: 1280, height: 800 });

  for (const lang of ["en", "hi", "mr", "ta", "bn"]) {
    await page.goto(`/portal/${lang}`);
    await audit(page, `start ${lang}`);
  }
  await page.goto("/portal/en/ivrs");
  await audit(page, "ivrs");

  // Consent and chat need a session.
  await page.goto("/portal/en");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/portal\/en\/consent/);
  await audit(page, "consent");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/portal\/en\/chat/);
  await expect(page.getByTestId("prompt")).toBeVisible();
  await audit(page, "chat");
});

test("keyboard only on the homepage: skip link first, then quick exit, Start and the three ways", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("href"))).toBe("#main"); // skip link
  const seen: string[] = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    // Accessible name where one is set (Quick exit has an aria-label), otherwise the visible text on one line.
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return (el?.getAttribute("aria-label") ?? el?.innerText ?? "").replace(/\s+/g, " ").trim();
      }),
    );
  }
  expect(seen.some((t) => /quick exit/i.test(t)), seen.join(" | ")).toBe(true);
  for (const name of ["Start", "Write", "Speak", "Guided questions"]) {
    expect(seen.some((t) => t === name || t.startsWith(`${name} `)), `${name}: ${seen.join(" | ")}`).toBe(true);
  }
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe("none");
});

test("keyboard only: quick exit and start are reachable and usable", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
  await page.goto("/portal/en");
  const seen: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    seen.push(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText?.trim() ?? ""));
  }
  expect(seen.some((t) => /quick exit|leave/i.test(t)), seen.join(" | ")).toBe(true);
  expect(seen).toContain("Start");
  // Focus is always visible (no outline removal on focus).
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe("none");
});
