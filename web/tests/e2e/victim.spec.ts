/**
 * Victim text flow end to end (task 3.9). Synthetic, non-graphic text only.
 * AC-CH-01, AC-CH-04, AC-CH-05, AC-CON-01…05, AC-SCR-01, AC-SCR-03, AC-REC-04, rule 1.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

const FORBIDDEN = ["svi", "band", "computedBand", "dimension", "dimensions", "indicator", "indicators", "overridesFired", "confidence", "explanation", "topEvidence"];

/** Each test looks like a different client, so the 10-sessions-per-hour limit is not hit. */
let ipCounter = Math.floor(Math.random() * 200);
async function freshClient(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${(ipCounter++ % 250) + 1}` });
}

/** Records every victim API response and checks none carries a risk field (CLAUDE.md rule 1). */
function watchResponses(page: Page) {
  const leaks: string[] = [];
  const keysOf = (v: unknown, out: string[] = []): string[] => {
    if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        out.push(k);
        keysOf(x, out);
      }
    }
    return out;
  };
  page.on("response", async (res: Response) => {
    if (!res.url().includes("/api/v1/victim/")) return;
    const body = await res.json().catch(() => null);
    const found = keysOf(body).filter((k) => FORBIDDEN.includes(k));
    if (found.length) leaks.push(`${res.url()} → ${found.join(", ")}`);
  });
  return leaks;
}

const promptKey = (page: Page) => page.getByTestId("prompt").getAttribute("data-key");

async function waitForPrompt(page: Page, key: string | RegExp) {
  await expect(page.getByTestId("prompt")).toHaveAttribute("data-key", key);
}

async function start(page: Page, lang: "en" | "hi") {
  await page.goto("/portal");
  await page.getByRole("link", { name: lang === "hi" ? "हिंदी" : "English" }).click();
  const created = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/v1/victim/interactions"));
  await page.getByRole("button", { name: lang === "hi" ? "शुरू करें" : "Start" }).click();
  expect((await created).postDataJSON().channel).toBe("PORTAL"); // audit G1: the portal is not the chatbot channel
  await expect(page).toHaveURL(new RegExp(`/portal/${lang}/consent\\?i=[a-f0-9]{24}`));
  return new URL(page.url()).searchParams.get("i")!;
}

async function consent(page: Page, choices: string[], submitLabel: string) {
  for (const label of choices) await page.getByLabel(label).check();
  await page.getByRole("button", { name: submitLabel }).click();
  await waitForPrompt(page, "flow.screener.SAFETY_SAFE_NOW");
}

/** Skips whatever is asked until the closing note. */
async function skipToClose(page: Page, skip: string, skipAll: string) {
  for (let i = 0; i < 30; i++) {
    const key = await promptKey(page);
    if (key === "flow.close") return;
    if (key === "flow.context.intro") await page.getByRole("button", { name: skipAll }).click();
    else await page.getByRole("button", { name: skip, exact: true }).click();
    await expect(page.getByTestId("prompt")).not.toHaveAttribute("data-key", key!);
  }
  throw new Error("flow did not reach the closing note");
}

test.beforeEach(async ({ page }) => {
  await freshClient(page);
  // The quick-exit destination is stubbed so tests never leave the machine.
  await page.route("https://www.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>neutral</title>neutral page" }));
});

test("full Hindi flow: consent, safety check, story, emergency panel, docket (AC-CH-01, AC-CH-04)", async ({ page }) => {
  const leaks = watchResponses(page);
  await start(page, "hi");
  await consent(page, ["मेरे लिखे शब्दों को देखें", "मेरी बातें एक परामर्शदाता के साथ साझा करें"], "आगे बढ़ें");

  await page.getByRole("button", { name: "हाँ" }).click(); // safe now
  await waitForPrompt(page, "flow.screener.SAFETY_ACCUSED_NEARBY");
  await page.getByRole("button", { name: "नहीं" }).click();
  await waitForPrompt(page, "flow.screener.SAFETY_SUICIDAL_THOUGHTS");
  await page.getByRole("button", { name: "नहीं" }).click();
  await waitForPrompt(page, "flow.context.intro");
  await page.getByRole("button", { name: "ये सवाल छोड़ें" }).click();
  await waitForPrompt(page, "flow.narrative.open");
  await expect(page.getByRole("alert").filter({ hasText: "मदद अभी उपलब्ध है" })).toHaveCount(0);

  await page.getByPlaceholder("यहाँ लिखें").fill("वो लोग अभी घर के बाहर खड़े हैं, कह रहे हैं केस वापस लो");
  const t0 = Date.now();
  await page.getByRole("button", { name: "भेजें" }).click();
  await expect(page.getByText("मदद अभी उपलब्ध है")).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(10_000); // dev server; the 3 s target is measured in Phase 9
  await expect(page.getByRole("alert").getByRole("link", { name: /112/ })).toHaveAttribute("href", "tel:112"); // the panel, not the footer

  await skipToClose(page, "यह सवाल छोड़ें", "ये सवाल छोड़ें");
  await page.getByRole("button", { name: "समाप्त करें" }).click();
  await expect(page.getByTestId("docket")).toHaveText(/^NHAA-\d{4}-[A-Z]{2}-\d{6}$/);
  expect(leaks).toEqual([]);
});

test("all consent declined: complaint still filed, safety check runs, no screeners (AC-CON-03, AC-SCR-01)", async ({ page }) => {
  const leaks = watchResponses(page);
  const id = await start(page, "en");
  await consent(page, [], "Continue");
  await page.getByRole("button", { name: "Yes" }).click();
  await waitForPrompt(page, "flow.screener.SAFETY_ACCUSED_NEARBY");
  await page.getByRole("button", { name: "No" }).click();
  await page.getByRole("button", { name: "No" }).click();
  await waitForPrompt(page, "flow.context.intro");
  await page.getByRole("button", { name: "Skip these questions" }).click();
  await page.getByPlaceholder("Type here").fill("I want to register my complaint about the damage to our house.");
  await page.getByRole("button", { name: "Send" }).click();
  await waitForPrompt(page, "flow.narrative.more");
  await page.getByRole("button", { name: "Skip this question", exact: true }).click();
  // No PHQ-2/GAD-2/PC-PTSD-5 without consent: straight to the closing note.
  await waitForPrompt(page, "flow.close");

  const phq = await page.request.post(`/api/v1/victim/interactions/${id}/screeners`, {
    data: { instrument: "PHQ2", itemCode: "PHQ2_1", value: 2 },
  });
  expect(phq.status()).toBe(409);

  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByTestId("docket")).toHaveText(/^NHAA-/);
  expect(leaks).toEqual([]);
});

test("consent does not offer keeping voice recordings while audio storage is not built (audit G2)", async ({ page }) => {
  await start(page, "en");
  await expect(page.getByRole("checkbox")).toHaveCount(4);
  await expect(page.getByLabel(/recording/i)).toHaveCount(0);
  const sent = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/consent"));
  for (const box of await page.getByRole("checkbox").all()) await box.check(); // even with every choice ticked
  await page.getByRole("button", { name: "Continue" }).click();
  expect((await sent).postDataJSON().audioRetention).toBe(false);
  await waitForPrompt(page, "flow.screener.SAFETY_SAFE_NOW");
});

test("withdrawing consent stops analysis at once (AC-CON-04)", async ({ page }) => {
  const id = await start(page, "en");
  await consent(page, ["Look at what I type"], "Continue");
  await page.getByRole("button", { name: "Stop looking at what I share" }).click();
  await expect(page.getByRole("status")).toContainText("We will not look at what you share");
  const r = await page.request.post(`/api/v1/victim/interactions/${id}/screeners`, {
    data: { instrument: "GAD2", itemCode: "GAD2_1", value: 1 },
  });
  expect(r.status()).toBe(409);
  // The safety check still works after withdrawal (FR-SCR-01).
  const safety = await page.request.post(`/api/v1/victim/interactions/${id}/screeners`, {
    data: { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SAFE_NOW", value: 1 },
  });
  expect(safety.status()).toBe(200);
});

test("'yes' to suicidal thoughts with intent shows the emergency panel (AC-SCR-03, AC-REC-04)", async ({ page }) => {
  await start(page, "en");
  await consent(page, [], "Continue"); // even with no analysis consent
  await page.getByRole("button", { name: "Skip this question", exact: true }).click();
  await page.getByRole("button", { name: "Skip this question", exact: true }).click();
  await waitForPrompt(page, "flow.screener.SAFETY_SUICIDAL_THOUGHTS");
  await page.getByRole("button", { name: "Yes" }).click();
  await waitForPrompt(page, "flow.screener.SAFETY_SUICIDAL_INTENT");
  const t0 = Date.now();
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByText("Help is available right now")).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(10_000);
  await expect(page.getByRole("alert").getByRole("link", { name: /14416/ })).toHaveAttribute("href", "tel:14416"); // the panel, not the footer
});

test("quick exit leaves at once and ends the session (AC-CH-05)", async ({ page }) => {
  const id = await start(page, "en");
  await consent(page, [], "Continue");
  const t0 = Date.now();
  await page.getByRole("button", { name: /Leave this page at once/ }).click();
  await page.waitForURL("https://www.google.com/**");
  expect(Date.now() - t0).toBeLessThan(1_000);
  // The session no longer works.
  await expect
    .poll(async () => (await page.request.get(`/api/v1/victim/interactions/${id}/next`)).status())
    .toBe(401);
});

test("every question can be skipped and the flow still completes (AC-CH-05, FR-CH-09)", async ({ page }) => {
  await start(page, "en");
  await consent(page, ["Look at what I type", "Listen to my voice if I choose to speak"], "Continue");
  await skipToClose(page, "Skip this question", "Skip these questions");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByTestId("docket")).toBeVisible();
});

test("messages before consent are refused (AC-CON-01)", async ({ page }) => {
  const id = await start(page, "en");
  const r = await page.request.post(`/api/v1/victim/interactions/${id}/messages`, { data: { text: "test" } });
  expect(r.status()).toBe(409);
});
