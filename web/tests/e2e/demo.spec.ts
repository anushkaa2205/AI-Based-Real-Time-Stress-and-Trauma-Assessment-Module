/**
 * The portal journey (NIVARA_FLOW_AND_UI_PLAN.md §5–§8, Phase P task P.9; earlier N.4, N.7, N.8, N.11).
 * Needs DEMO_ENABLED=true and DEMO_API_KEY (`npm run api:client -- --demo`, scopes include status:read
 * and questions:read; an older demo client: `npm run api:client -- --update-demo-scopes`); skipped
 * otherwise. All text is synthetic, respectful and non-graphic (CLAUDE.md rule 11).
 */
import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import { dropIntegrationKeys, freshIp, integrationSession, staffLogin, withDb } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(dropIntegrationKeys);

const CONSENT = { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: true, shareWithCounsellor: true, followUpContact: false, audioRetention: false };
const START = { mode: "LIVE_TEXT", language: "en", consent: CONSENT, districtCode: "MH-PUN" };

test.beforeAll(async ({ request }) => {
  test.skip(process.env.DEMO_ENABLED !== "true", "demo input layer switched off");
  expect((await request.get("/api/demo/track?docket=bad")).status()).toBe(400); // demo routes are on
});

test("signed out, a person writes a case: scripted questions, skip, review with a note, docket, tracking, staff queue (P.7, P.9)", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin: baseURL ?? "http://localhost:3000" });
  await page.goto("/");
  await expect(page.getByTestId("call-emergency")).toBeVisible();
  await expect(page.getByTestId("quick-exit")).toBeVisible();
  await page.getByTestId("start").click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByTestId("demo-notice")).toBeVisible();
  await page.getByTestId("continue").click();
  await page.getByTestId("choose-write").click();
  await expect(page).toHaveURL(/\/start\/write$/);

  // The opening is the scripted line, recorded by the server; the visitor writes only the person's words.
  await expect(page.getByTestId("line-assistant").first()).toContainText(en.operatorQuestions.opening.slice(0, 30), { timeout: 30_000 });
  await page.getByTestId("draft").fill("Some people from the village keep coming to my door and shouting.");
  await page.getByTestId("send").click();
  await expect(page.getByTestId("line-assistant")).toHaveCount(2, { timeout: 30_000 });
  await page.getByTestId("skip").click();
  await expect(page.getByTestId("line-assistant")).toHaveCount(3, { timeout: 30_000 });
  await page.getByTestId("draft").fill("I am at my sister's house today.");
  await page.getByTestId("send").click();
  await expect(page.getByTestId("line-person")).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator("[data-band]")).toHaveCount(0);
  await expect(page.getByText(/SVI|Critical|indicator|score/i)).toHaveCount(0);

  await page.getByTestId("finish").click();
  await expect(page.getByTestId("review")).toBeVisible();
  await expect(page.getByTestId("review-list")).toContainText("keep coming to my door");
  await page.getByTestId("note").fill("They usually come in the evening.");
  await page.getByTestId("submit").click();
  const docket = ((await page.getByTestId("docket").textContent({ timeout: 30_000 })) ?? "").trim();
  expect(docket).toMatch(/^NHAA-\d{4}-MH-\d{6}$/);

  await withDb(async (db) => {
    const c = await db.collection("cases").findOne({ docketNumber: docket });
    expect(c?.isDemo).toBe(true);
    const i = await db.collection("interactions").findOne({ caseId: c?._id });
    expect(i?.channel).toBe("CHATBOT");
    expect(i?.status).toBe("ENDED");
    // Opening, the question after the first answer, and the skipped one: all recorded by the server.
    expect(await db.collection("messages").countDocuments({ interactionId: i?._id, sender: "OPERATOR" })).toBeGreaterThanOrEqual(3);
    expect(await db.collection("messages").countDocuments({ interactionId: i?._id, sender: "VICTIM" })).toBe(3); // two answers and the note
  });

  await page.getByTestId("track-this").click();
  await expect(page).toHaveURL(new RegExp(`/track/${docket}$`));
  const result = page.getByTestId("track-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute("data-status", "NEW");
  await expect(result).not.toContainText(/SVI|band|critical/i);

  await staffLogin(page, "COUNSELLOR");
  await page.goto("/counsellor");
  const row = page.locator("[data-testid=queue-row]", { hasText: docket });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId("demo-mark")).toBeVisible();
});

test("relay shape: no sender, question text only, nothing about the assessment; old routes gone (plan §7, §8.3)", async ({ page, baseURL }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin: baseURL ?? "http://localhost:3000" });
  await page.goto("/");
  const start = await page.request.post("/api/demo/interactions", { data: START });
  expect(start.status()).toBe(201);
  const s = (await start.json()) as { interactionId: string; question: { text: string } | null };
  expect(Object.keys(s)).toEqual(["interactionId", "question"]);
  expect(Object.keys(s.question ?? {})).toEqual(["text"]);
  const id = s.interactionId;
  // A visitor can never write the assistant's lines.
  expect((await page.request.post(`/api/demo/interactions/${id}/messages`, { data: { sender: "OPERATOR", text: "Are you safe?" } })).status()).toBe(400);
  const m = await page.request.post(`/api/demo/interactions/${id}/messages`, { data: { text: "They said they will come back tonight." } });
  expect(m.status()).toBe(200);
  expect(Object.keys((await m.json()) as object).sort()).toEqual(["emergency", "ok", "question", "showEmergencyPanel"]);
  const n = await page.request.post(`/api/demo/interactions/${id}/next-question`);
  expect(n.status()).toBe(200);
  expect(Object.keys((await n.json()) as object)).toEqual(["question"]);
  expect((await page.request.get("/api/demo/library")).status()).toBe(404);
  expect((await page.request.post(`/api/demo/interactions/${id}/recording`, { data: { scenarioId: "S047" } })).status()).toBe(404);
  const end = await page.request.post(`/api/demo/interactions/${id}/end`);
  expect(end.status()).toBe(200);
  expect(Object.keys((await end.json()) as object)).toEqual(["docketNumber"]);
});

test("a browser may only touch its own cases; cross-site posts are refused; a normal key cannot ask for the demo tag (plan §7, M.7)", async ({ page, browser, request, baseURL }) => {
  const origin = baseURL ?? "http://localhost:3000";
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin });
  await page.goto("/");
  const start = await page.request.post("/api/demo/interactions", { data: START });
  const { interactionId } = (await start.json()) as { interactionId: string };

  const other = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": freshIp(), origin } });
  expect((await other.request.post(`${origin}/api/demo/interactions/${interactionId}/messages`, { data: { text: "hello" } })).status()).toBe(404);
  expect((await other.request.post(`${origin}/api/demo/interactions/${interactionId}/next-question`)).status()).toBe(404);
  expect((await other.request.post(`${origin}/api/demo/interactions/${interactionId}/end`)).status()).toBe(404);
  await other.close();

  const crossSite = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": freshIp(), origin: "https://evil.example" } });
  expect((await crossSite.request.post(`${origin}/api/demo/interactions`, { data: START })).status()).toBe(403);
  await crossSite.close();

  expect((await page.request.post(`/api/demo/interactions/${interactionId}/end`)).status()).toBe(200);

  const v = await integrationSession(request);
  const started = await request.post("/api/v1/integration/interactions", { headers: v.headers, data: { channel: "CHATBOT", language: "en", consent: CONSENT, isDemo: true } });
  expect(started.status()).toBe(201);
  const s2 = (await started.json()) as { interactionId: string };
  await withDb(async (db) => {
    const i = await db.collection("interactions").findOne({ _id: new mongoose.Types.ObjectId(s2.interactionId) });
    expect(i?.isDemo ?? false).toBe(false);
  });
});

test("tracking: a wrong docket is a neutral 404; a case owned by another key is the same 404 (N.3, N.8)", async ({ page, request, baseURL }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin: baseURL ?? "http://localhost:3000" });
  await page.goto("/");
  expect((await page.request.get("/api/demo/track?docket=NHAA-2026-MH-999999")).status()).toBe(404);
  expect((await page.request.get("/api/demo/track?docket=nonsense")).status()).toBe(400);
  const v = await integrationSession(request);
  const started = await request.post("/api/v1/integration/interactions", { headers: v.headers, data: { channel: "CHATBOT", language: "en", consent: CONSENT } });
  const { docketNumber } = (await started.json()) as { docketNumber: string };
  expect((await page.request.get(`/api/demo/track?docket=${docketNumber}`)).status()).toBe(404);
  await page.goto(`/track/${docketNumber}`);
  await expect(page.getByTestId("track-error")).toBeVisible({ timeout: 30_000 });
});

test("switching to Hindi changes the header, the portal, the questions and the login page (P-D7, AC-LANG-05)", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const origin = baseURL ?? "http://localhost:3000";
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin });
  await page.goto("/");
  const switcher = page.getByTestId("language-switcher").first();
  if (await switcher.isVisible()) await switcher.selectOption("hi");
  else {
    // On a phone the switcher sits in the menu.
    await page.getByTestId("menu-toggle").click();
    await page.getByTestId("language-switcher").last().selectOption("hi");
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "hi", { timeout: 20_000 });
  await expect(page.getByTestId("quick-exit")).toContainText(hi.public.header.quickExit);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await page.getByTestId("start").click();
  await expect(page.getByTestId("begin")).toContainText(hi.portal.begin.title);
  await page.getByTestId("continue").click();
  await page.getByTestId("choose-write").click();
  await expect(page.getByTestId("line-assistant").first()).toContainText(hi.operatorQuestions.opening.slice(0, 12), { timeout: 30_000 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(hi.login.title);
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: origin }]);
});

test("Quick exit leaves the site and Back does not return (P-D6)", async ({ page }) => {
  await page.route("https://www.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>neutral</title>neutral" }));
  await page.goto("about:blank");
  await page.goto("/");
  await page.getByTestId("quick-exit").click();
  await expect(page).toHaveURL(/^https:\/\/www\.google\.com/);
  await page.goBack();
  await expect(page).not.toHaveURL(/localhost:3000\/$/);
});

test("the old demo URLs redirect to /start for good (plan §8.4)", async ({ request }) => {
  for (const u of ["/demo", "/demo/text", "/demo/call", "/demo/recording"]) {
    const r = await request.get(u, { maxRedirects: 0 });
    expect(r.status(), u).toBe(308);
    expect(r.headers().location, u).toMatch(/\/start$/);
  }
});

test("the staff menu has no demo entry and analytics can include, exclude or isolate demo cases (M.7)", async ({ page }) => {
  await staffLogin(page, "NHAA_SUPERVISOR");
  await page.goto("/counsellor");
  await expect(page.getByRole("navigation", { name: "Staff" })).not.toContainText(/demo/i);
  for (const demo of ["include", "exclude", "only"]) expect((await page.request.get(`/api/v1/staff/analytics/summary?demo=${demo}`)).status()).toBe(200);
  expect((await page.request.get("/api/v1/staff/analytics/summary?demo=maybe")).status()).toBe(400);
});

test("a demo case in Pune reaches the district, police and welfare portals after approval (plan §8.4)", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin: baseURL ?? "http://localhost:3000" });
  await page.goto("/");
  const start = await page.request.post("/api/demo/interactions", { data: START });
  const { interactionId } = (await start.json()) as { interactionId: string };
  // A statement the rules read as a threat to life: OV-4, High, with a police-intervention proposal.
  await page.request.post(`/api/demo/interactions/${interactionId}/messages`, { data: { text: "They said if I do not withdraw the complaint I will not live long." } });
  const { docketNumber } = (await (await page.request.post(`/api/demo/interactions/${interactionId}/end`)).json()) as { docketNumber: string };

  await staffLogin(page, "DISTRICT_OFFICER");
  await page.goto("/district");
  await expect(page.getByText(docketNumber).first()).toBeVisible({ timeout: 60_000 });

  await staffLogin(page, "COUNSELLOR");
  const caseId = await withDb(async (db) => String((await db.collection("cases").findOne({ docketNumber }))?._id));
  const recs = (await (await page.request.get(`/api/v1/staff/recommendations?status=PROPOSED&limit=100`)).json()) as { items: { id: string; type: string; docketNumber: string }[] };
  const police = recs.items.find((r) => r.docketNumber === docketNumber && r.type === "POLICE_INTERVENTION");
  expect(police, "a police proposal for the case").toBeTruthy();
  const decision = await page.request.post(`/api/v1/staff/recommendations/${police!.id}/decision`, { data: { decision: "APPROVE" } });
  expect(decision.status()).toBe(200);

  await staffLogin(page, "POLICE_LIAISON");
  await page.goto("/police");
  const row = page.locator("[data-testid=referral-row]", { hasText: docketNumber });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("body")).not.toContainText(/not live long/); // never the narrative (rule 8)
  expect((await page.request.get(`/api/v1/staff/cases/${caseId}`)).status()).toBe(403);

  await page.context().clearCookies();
  await page.goto(`/track/${docketNumber}`);
  await expect(page.getByTestId("support-list")).toContainText(/police/i, { timeout: 30_000 });
});
