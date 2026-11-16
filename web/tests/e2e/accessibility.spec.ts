/**
 * Accessibility (task 9.4, AC-ACC-01, NFR-ACC-01): axe-core WCAG 2.1 A/AA rules on the sign-in page and
 * the staff dashboards, plus a keyboard-only pass on sign-in. The module has no victim-facing pages
 * (PRODUCT_VISION.md §5); calling systems own those. A screen-reader session still needs a person.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { freshIp, staffLogin } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function audit(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const problems = r.violations.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}×) ${v.nodes[0]?.target.join(" ") ?? ""}`);
  expect(problems, `${label}\n${problems.join("\n")}`).toEqual([]);
}

test("sign-in and staff dashboards have no WCAG 2.1 AA violations (AC-ACC-01)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/); // no victim website: / goes to staff sign-in
  await audit(page, "login");

  await staffLogin(page, "COUNSELLOR");
  await page.goto("/counsellor");
  await expect(page.getByTestId("queue").or(page.getByText("No open cases."))).toBeVisible();
  await audit(page, "counsellor queue");

  await staffLogin(page, "OPERATOR");
  await page.goto("/operator");
  await audit(page, "operator console");
});

test("keyboard only: the sign-in form is reachable and focus is always visible", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
  await page.goto("/login");
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    // Skip the page body (focus wraps after the last control) and the dev-mode overlay (not in production).
    if (await page.evaluate(() => ["NEXTJS-PORTAL", "BODY"].includes(document.activeElement?.tagName ?? "BODY"))) continue;
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLInputElement | HTMLButtonElement | null;
        return `${el?.tagName ?? ""}:${(el as HTMLInputElement | null)?.name ?? ""}:${(el?.textContent ?? "").trim()}`;
      }),
    );
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
    expect(outline, seen.at(-1)).not.toBe("none");
  }
  expect(seen.some((s) => s.startsWith("INPUT:email")), seen.join(" | ")).toBe(true);
  expect(seen.some((s) => s.startsWith("INPUT:password")), seen.join(" | ")).toBe(true);
  expect(seen.some((s) => s.startsWith("BUTTON:")), seen.join(" | ")).toBe(true);
});
