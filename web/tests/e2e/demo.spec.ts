/**
 * The public demo (NIVARA_FLOW_AND_UI_PLAN.md §5–§7, tasks N.4, N.7, N.8, N.11). Needs DEMO_ENABLED=true
 * and DEMO_API_KEY (`npm run api:client -- --demo`, with the status:read scope); skipped otherwise.
 * All text is synthetic. Recorded audio was removed from the demo layer in Phase P (P.2).
 */
import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { dropIntegrationKeys, freshIp, integrationSession, staffLogin, withDb } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(dropIntegrationKeys);

const CONSENT = { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: true, shareWithCounsellor: true, followUpContact: false, audioRetention: false };
const START = { mode: "LIVE_TEXT", language: "en", consent: CONSENT, districtCode: "MH-PUN" };

test.beforeAll(async ({ request }) => {
  test.skip(process.env.DEMO_ENABLED !== "true", "demo input layer switched off");
  expect((await request.get("/api/demo/track?docket=bad")).status()).toBe(400); // demo routes are on
});

test("signed out, a visitor files a case by typing, gets only a docket number, and can track it (N.4, N.7, N.8)", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin: baseURL ?? "http://localhost:3000" });
  await page.goto("/");
  await expect(page.getByTestId("demo-starter")).toBeVisible();
  await expect(page.getByTestId("nav-staff-login")).toBeVisible();
  await page.getByTestId("start-text").click();
  await expect(page).toHaveURL(/\/demo\/text$/);
  await expect(page.getByTestId("demo-notice")).toBeVisible();
  await page.getByTestId("start").click();

  // NHAA's chatbot asks; the person answers "Yes": read with the question, this fires OV-2, Critical (M.9).
  await page.getByTestId("q-accusedNearby").click();
  await expect(page.getByTestId("line-operator")).toContainText("Received", { timeout: 30_000 });
  await page.getByTestId("draft").fill("Yes");
  await page.getByTestId("send").click();
  await expect(page.getByTestId("line-victim")).toContainText("Received", { timeout: 30_000 });
  // The one risk signal a person may see (rule 1): the scripted emergency options, nothing else.
  await expect(page.getByTestId("emergency-panel")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-band]")).toHaveCount(0);
  await expect(page.getByText(/SVI|Critical|indicator/i)).toHaveCount(0);

  await page.getByTestId("finish").click();
  const docket = ((await page.getByTestId("docket").textContent({ timeout: 30_000 })) ?? "").trim();
  expect(docket).toMatch(/^NHAA-\d{4}-MH-\d{6}$/); // the district's state code (plan §8.4)

  await page.getByTestId("track-this").click();
  await expect(page).toHaveURL(new RegExp(`/track/${docket}$`));
  const result = page.getByTestId("track-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute("data-status", "NEW");
  await expect(result.getByTestId("no-support")).toBeVisible();
  await expect(result).not.toContainText(/SVI|band|critical/i);

  await withDb(async (db) => {
    const c = await db.collection("cases").findOne({ docketNumber: docket });
    expect(c?.isDemo).toBe(true);
    expect(c?.currentBand).toBe("CRITICAL");
    const i = await db.collection("interactions").findOne({ caseId: c?._id });
    expect(i?.channel).toBe("CHATBOT");
    expect(i?.status).toBe("ENDED");
    expect(await db.collection("messages").countDocuments({ interactionId: i?._id, sender: "OPERATOR" })).toBe(1);
  });

  // Staff: the case is in the counsellor queue, most urgent first, marked Demo; and in the district, police and welfare portals.
  await staffLogin(page, "COUNSELLOR");
  await page.goto("/counsellor");
  const row = page.locator("[data-testid=queue-row]", { hasText: docket });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute("data-band", "CRITICAL");
  await expect(row.getByTestId("demo-mark")).toBeVisible();
  await row.getByRole("link", { name: docket }).click();
  await expect(page.getByRole("heading", { name: docket })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("svi")).not.toHaveText("–");
  await expect(page.getByTestId("indicator").first()).toBeVisible();
});

test("demo responses never carry the assessment, request ids or timings; the library and recording routes are gone (plan §7, P.2)", async ({ page, baseURL }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin: baseURL ?? "http://localhost:3000" });
  await page.goto("/");
  const start = await page.request.post("/api/demo/interactions", { data: START });
  expect(start.status()).toBe(201);
  const s = (await start.json()) as Record<string, unknown>;
  expect(Object.keys(s)).toEqual(["interactionId", "question"]);
  const id = String(s.interactionId);
  const m = await page.request.post(`/api/demo/interactions/${id}/messages`, { data: { text: "They said they will come back tonight." } });
  expect(m.status()).toBe(200);
  expect(Object.keys((await m.json()) as object).sort()).toEqual(["emergency", "ok", "question", "showEmergencyPanel"]);
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

  // Another browser (no cookie) gets 404, so it cannot even learn the case exists.
  const other = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": freshIp(), origin } });
  expect((await other.request.post(`${origin}/api/demo/interactions/${interactionId}/messages`, { data: { sender: "VICTIM", text: "hello" } })).status()).toBe(404);
  expect((await other.request.post(`${origin}/api/demo/interactions/${interactionId}/end`)).status()).toBe(404);
  await other.close();

  // Without a matching Origin, a POST is refused before anything else happens.
  const crossSite = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": freshIp(), origin: "https://evil.example" } });
  expect((await crossSite.request.post(`${origin}/api/demo/interactions`, { data: START })).status()).toBe(403);
  await crossSite.close();

  expect((await page.request.post(`/api/demo/interactions/${interactionId}/end`)).status()).toBe(200);

  // A normal integration key cannot ask for the demo tag.
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
  await page.request.post(`/api/demo/interactions/${interactionId}/messages`, { data: { sender: "VICTIM", text: "They said if I do not withdraw the complaint I will not live long." } });
  const { docketNumber } = (await (await page.request.post(`/api/demo/interactions/${interactionId}/end`)).json()) as { docketNumber: string };

  await staffLogin(page, "DISTRICT_OFFICER");
  await page.goto("/district");
  await expect(page.getByText(docketNumber).first()).toBeVisible({ timeout: 60_000 });

  // The counsellor approves the police proposal; the police liaison then sees the referral and nothing else.
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

  // Tracking now shows the support arranged.
  await page.context().clearCookies();
  await page.goto(`/track/${docketNumber}`);
  await expect(page.getByTestId("support-list")).toContainText(/police/i, { timeout: 30_000 });
});
