/**
 * Public homepage and its pages (task F.2; brief §2, checklist §2, §3, §6).
 * Synthetic use only. Every test looks like a different client so the session rate limit is not hit.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { freshIp } from "./helpers";

const LANGS = ["en", "hi", "mr", "ta", "bn"] as const;
const msg = (lang: string) => JSON.parse(readFileSync(resolve(__dirname, `../../messages/${lang}.json`), "utf8"));
const home = (lang: string) => (lang === "en" ? "/" : `/?lang=${lang}`);

/** Words and shapes that would mean staff or case data reached a public page (CLAUDE.md rule 1, rule 8). */
const CASE_DATA = /\bSVI\b|risk band|\bCRITICAL\b|indicator|NHAA-\d{4}-[A-Z]{2}-\d{6}|counsellor queue|case summary/i;

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
});

test("/ loads without signing in, sets no session and shows no case data", async ({ page, context }) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiCalls.push(r.url());
  });
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  expect(page.url()).not.toContain("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("en").home.hero.title);
  await expect(page.getByTestId("home-start")).toBeVisible();
  for (const w of ["write", "speak", "guided"]) await expect(page.getByTestId(`way-${w}`)).toBeVisible();
  await expect(page.getByTestId("urgent-help")).toBeVisible();

  expect(await page.locator("body").innerText()).not.toMatch(CASE_DATA);
  await expect(page.locator("input[type=password], form")).toHaveCount(0); // no public login form
  expect(apiCalls).toEqual([]); // nothing is fetched: no session, no data
  expect((await context.cookies()).map((c) => c.name)).toEqual([]);
});

test("the urgent section reuses the approved emergency copy and only dials 112, 14416 and 14566", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: msg("en").home.hero.urgent }).click();
  const urgent = page.getByTestId("urgent-help");
  await expect(urgent).toBeInViewport();
  await expect(urgent).toContainText(msg("en").emergency.message);
  const tels = await urgent.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(tels).toEqual(["tel:112", "tel:14416", "tel:14566"]);
});

for (const lang of LANGS) {
  test(`Start reaches consent in ${lang}`, async ({ page }) => {
    await page.goto(home(lang));
    await expect(page.locator(`[lang=${lang}][data-theme=quiet-paper]`)).toBeVisible();
    await page.getByTestId("home-start").click();
    await expect(page).toHaveURL(new RegExp(`/portal/${lang}$`));
    await page.getByRole("button", { name: msg(lang).start.start }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/${lang}/consent\\?i=[a-f0-9]{24}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(lang).consent.title);
  });
}

test("the language selector switches the homepage and keeps each name in its own script", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: msg("en").home.nav.language });
  for (const label of ["English", "हिंदी", "मराठी", "தமிழ்", "বাংলা"]) await expect(nav.getByRole("link", { name: label })).toBeVisible();
  await expect(nav.getByRole("link", { name: "English" })).toHaveAttribute("aria-current", "true");
  await nav.getByRole("link", { name: "मराठी" }).click();
  await expect(page).toHaveURL(/\/\?lang=mr$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("mr").home.hero.title);
  await expect(page.getByTestId("home-start")).toHaveAttribute("href", "/portal/mr");
});

/** Walks a fresh session from a homepage card to the story step, declining all optional consent. */
async function toStoryStep(page: Page, way: "write" | "speak") {
  await page.goto("/");
  await page.getByTestId(`way-${way}`).click();
  await expect(page).toHaveURL(`/portal/en?way=${way}`);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(new RegExp(`/portal/en/consent\\?i=[a-f0-9]{24}&way=${way}$`));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(new RegExp(`/portal/en/chat\\?i=[a-f0-9]{24}&way=${way}$`));
  await expect(page.getByTestId("prompt")).toHaveAttribute("data-key", "flow.screener.SAFETY_SAFE_NOW"); // safety first, every mode
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByTestId("prompt")).toHaveAttribute("data-key", "flow.screener.SAFETY_ACCUSED_NEARBY");
  await page.getByRole("button", { name: "No" }).click();
  await expect(page.getByTestId("prompt")).toHaveAttribute("data-key", "flow.screener.SAFETY_SUICIDAL_THOUGHTS");
  await page.getByRole("button", { name: "No" }).click();
  await expect(page.getByTestId("prompt")).toHaveAttribute("data-key", "flow.context.intro");
  await page.getByRole("button", { name: "Skip these questions" }).click();
  await expect(page.getByTestId("prompt")).toHaveAttribute("data-key", "flow.narrative.open");
}

/** True if the text box comes before the voice button in the page. */
const textBoxFirst = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector("textarea#text");
    const mic = document.querySelector("[data-testid=voice-start]");
    return !!box && !!mic && !!(box.compareDocumentPosition(mic) & Node.DOCUMENT_POSITION_FOLLOWING);
  });

test("the card choice travels as a hint: Write puts typing first, Speak puts the recorder first, and nothing records on its own", async ({ page }) => {
  test.setTimeout(180_000);
  await toStoryStep(page, "write");
  expect(await textBoxFirst(page)).toBe(true);

  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
  await toStoryStep(page, "speak");
  expect(await textBoxFirst(page)).toBe(false);
  await expect(page.getByTestId("voice-start")).toBeVisible();
  await expect(page.getByTestId("voice-recorder")).toHaveCount(0); // not recording until pressed
});

test("no horizontal scrolling at 320 px on the public pages", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of ["/", "/?lang=ta", "/?lang=bn", "/how-it-works?lang=mr", "/privacy?lang=hi", "/privacy", "/portal/ta"]) {
    await page.goto(path);
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw, path).toBeLessThanOrEqual(cw);
  }
});

test("every link on the public pages goes somewhere real", async ({ page }) => {
  for (const path of ["/", "/?lang=hi", "/how-it-works", "/privacy"]) {
    await page.goto(path);
    const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.length, path).toBeGreaterThan(10);
    for (const href of new Set(hrefs)) {
      if (href.startsWith("tel:")) {
        expect(["tel:112", "tel:14416", "tel:14566"], `${path} → ${href}`).toContain(href);
      } else if (href.startsWith("#")) {
        await expect(page.locator(href), `${path} → ${href}`).toHaveCount(1);
      } else {
        expect(href, `${path}: no external links`).toMatch(/^\//);
        const [target = "/", hash] = href.split("#");
        const res = await page.request.get(target);
        expect(res.status(), `${path} → ${href}`).toBeLessThan(400);
        if (hash) expect(await res.text(), `${path} → ${href}`).toContain(`id="${hash}"`);
      }
    }
  }
});

test("/portal sends people to the homepage", async ({ page }) => {
  const res = await page.request.get("/portal", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toMatch(/^\/$|^http:\/\/[^/]+\/$/);
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/$/);
});

test("how it works and privacy are built from the real notice, with no invented promises", async ({ page }) => {
  await page.goto("/privacy?lang=bn");
  for (const k of ["what", "why", "who", "howLong", "refuse", "withdraw"]) await expect(page.locator(`#${k}`)).toContainText(msg("bn").consent[k]);
  await page.goto("/how-it-works");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("en").howItWorks.title);
  for (const path of ["/", "/how-it-works", "/privacy"]) {
    await page.goto(path);
    expect(await page.locator("body").innerText(), path).not.toMatch(/100%|guarantee|completely (safe|confidential)|within \d+ (minutes|hours)|police will come|we will call/i);
  }
});
