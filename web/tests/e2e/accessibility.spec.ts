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
  await page.goto("/");
  await audit(page, "home");
  await page.goto("/portal");
  await audit(page, "portal home");
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
