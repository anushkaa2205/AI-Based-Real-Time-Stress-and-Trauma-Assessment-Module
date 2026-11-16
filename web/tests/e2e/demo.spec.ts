/**
 * Demo input layer (PRODUCT_VISION.md §6–§7, tasks M.7, M.8, M.11, M.14). Needs DEMO_ENABLED=true and
 * DEMO_API_KEY (`npm run api:client -- --demo`); skipped otherwise. The recorded-audio test also needs
 * the analysis service. All text and audio are synthetic: the audio is the two-voice TTS test fixture.
 */
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { dropIntegrationKeys, integrationSession, staffLogin, withDb } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(dropIntegrationKeys);

const TWO_VOICES = resolve(__dirname, "../../../analysis-service/tests/fixtures/audio/two_voices_en.wav");
const CONSENT = { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: true, shareWithCounsellor: true, followUpContact: false, audioRetention: false };

test.beforeAll(async ({ request }) => {
  test.skip(process.env.DEMO_ENABLED !== "true", "demo input layer switched off");
  // Signed out, the demo routes answer 404 when off and 401 when on; either way nothing leaks.
  expect([401, 404]).toContain((await request.get("/api/demo/library")).status());
});

test("the demo calls the module through the integration API; its cases are tagged demo on the server (M.7, M.11)", async ({ page }) => {
  test.setTimeout(120_000);
  await staffLogin(page, "NHAA_SUPERVISOR");
  const start = await page.request.post("/api/demo/interactions", { data: { mode: "LIVE_TEXT", language: "en", consent: CONSENT } });
  expect(start.status()).toBe(201);
  const s = (await start.json()) as { interactionId: string; caseId: string; docketNumber: string; channel: string; call: { requestId: string } };
  expect(s.channel).toBe("CHATBOT");
  expect(s.call.requestId).toMatch(/^req_/); // the module's own request id came back

  // NHAA's chatbot asks; the person answers "Yes": read with the question, this fires OV-2, Critical (M.9).
  const q = await page.request.post(`/api/demo/interactions/${s.interactionId}/messages`, { data: { sender: "OPERATOR", text: "Is the person who harmed you near you right now?" } });
  expect((await q.json()).status).toBe(201);
  const a = await page.request.post(`/api/demo/interactions/${s.interactionId}/messages`, { data: { sender: "VICTIM", text: "Yes" } });
  const reply = (await a.json()) as { status: number; body: Record<string, unknown> };
  expect(reply.status).toBe(201);
  expect(reply.body.showEmergencyPanel).toBe(true);
  // What the calling system gets back carries no score (rule 1).
  expect(Object.keys(reply.body).sort()).toEqual(["emergency", "messageId", "showEmergencyPanel"]);

  await withDb(async (db) => {
    const iid = new mongoose.Types.ObjectId(s.interactionId);
    const i = await db.collection("interactions").findOne({ _id: iid });
    expect(i?.isDemo).toBe(true);
    expect(i?.channel).toBe("CHATBOT");
    expect((await db.collection("cases").findOne({ _id: i?.caseId }))?.isDemo).toBe(true);
    const ops = await db.collection("messages").countDocuments({ interactionId: iid, sender: "OPERATOR" });
    expect(ops).toBe(1);
  });

  // The case shows the Demo mark on the staff case page.
  await page.goto(`/counsellor/case/${s.caseId}`);
  await expect(page.getByRole("heading", { name: s.docketNumber })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("demo-mark").first()).toBeVisible();
  // And in the staff API, with the band the module set.
  const detail = (await (await page.request.get(`/api/v1/staff/cases/${s.caseId}`)).json()) as { isDemo?: boolean; band: string };
  expect(detail.isDemo).toBe(true);
  expect(detail.band).toBe("CRITICAL");

  expect((await page.request.post(`/api/demo/interactions/${s.interactionId}/end`)).status()).toBe(200);
});

test("only supervisors may use the demo, and a request body cannot set the demo tag (M.7)", async ({ page, request }) => {
  await staffLogin(page, "COUNSELLOR");
  expect((await page.request.get("/api/demo/library")).status()).toBe(403);
  expect((await page.request.post("/api/demo/interactions", { data: { mode: "LIVE_TEXT", language: "en", consent: CONSENT } })).status()).toBe(403);
  const pageRes = await page.goto("/demo");
  expect(pageRes?.status()).toBe(403);

  // A normal integration key cannot ask for the demo tag.
  const v = await integrationSession(request);
  const start = await request.post("/api/v1/integration/interactions", { headers: v.headers, data: { channel: "CHATBOT", language: "en", consent: CONSENT, isDemo: true } });
  expect(start.status()).toBe(201);
  const { interactionId } = (await start.json()) as { interactionId: string };
  await withDb(async (db) => {
    const i = await db.collection("interactions").findOne({ _id: new mongoose.Types.ObjectId(interactionId) });
    expect(i?.isDemo ?? false).toBe(false);
    expect((await db.collection("cases").findOne({ _id: i?.caseId }))?.isDemo ?? false).toBe(false);
  });
});

test("analytics can include, exclude or isolate demo cases (M.7)", async ({ page }) => {
  await staffLogin(page, "NHAA_SUPERVISOR");
  for (const demo of ["include", "exclude", "only"]) expect((await page.request.get(`/api/v1/staff/analytics/summary?demo=${demo}`)).status()).toBe(200);
  expect((await page.request.get("/api/v1/staff/analytics/summary?demo=maybe")).status()).toBe(400);
});

test("live text page: a scenario replayed line by line gives a result next to the scenario's expected label (M.11)", async ({ page }) => {
  test.setTimeout(180_000);
  await staffLogin(page, "NHAA_SUPERVISOR");
  await page.goto("/demo/text");
  await expect(page.getByText("Demonstration · synthetic data only")).toBeVisible();
  await page.getByTestId("scenario-select").selectOption("S049");
  await expect(page.getByTestId("expected")).toContainText("high");
  await page.getByTestId("start").click();
  const next = page.getByTestId("script-next");
  await expect(next).toContainText("line 1/3", { timeout: 30_000 });
  for (const n of [2, 3]) {
    await next.getByRole("button", { name: "Send this line" }).click();
    await expect(next).toContainText(`line ${n}/3`, { timeout: 30_000 });
  }
  await next.getByRole("button", { name: "Send this line" }).click();
  await expect(page.getByTestId("msg-person")).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId("msg-chatbot")).toContainText("stored, not scored");

  const results = page.getByTestId("results-panel");
  await expect(results.getByTestId("overrides")).toContainText("OV-4", { timeout: 45_000 });
  await expect(results.locator("[data-band]").first()).toHaveAttribute("data-band", "HIGH");
  await expect(results.getByTestId("indicators")).toContainText("will not live long"); // exact quote from the message (rule 12)
  await expect(results.getByTestId("recommendations")).toContainText("Police intervention");
  await expect(results.getByTestId("expected")).toContainText("module agrees");
  await page.getByTestId("end").click();
  await expect(page.getByText("Conversation ended")).toBeVisible({ timeout: 30_000 });
});

test("recorded audio page: an uploaded two-voice WAV is cut into windows and played through /audio (M.8, M.14)", async ({ page }) => {
  test.setTimeout(360_000);
  const url = process.env.ANALYSIS_URL;
  const ok = url ? await fetch(new URL("/v1/health", url), { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false) : false;
  test.skip(!ok, "analysis service not running");

  await staffLogin(page, "NHAA_SUPERVISOR");
  await page.goto("/demo/recorded");
  await expect(page.getByTestId("library-item")).toHaveCount(10);
  await page.getByTestId("upload-file").setInputFiles(TWO_VOICES);
  await page.getByTestId("upload-play").click();

  await expect(page.getByText("All windows sent")).toBeVisible({ timeout: 300_000 });
  await expect(page.getByTestId("window-rows").locator("li")).toHaveCount(6); // 27.8 s → 5 + 5 + 5 + 5 + 5 + 2.8 s
  const transcript = page.getByTestId("speaker-transcript");
  await expect(transcript).toContainText(/at home with my sister/i, { timeout: 30_000 });
  await expect(transcript.locator("li", { hasText: /are you safe right now/i })).toContainText("Operator");
  // The page reports honestly how many windows the module analysed (a slow network can time one out).
  await expect(page.getByTestId("timeline")).toContainText(/[1-6] of 6 windows analysed/);
  const analysed = Number(/([1-6]) of 6 windows analysed/.exec((await page.getByTestId("timeline").textContent()) ?? "")?.[1]);

  const docket = (await page.getByTestId("case-link").textContent())?.trim() ?? "";
  await withDb(async (db) => {
    const c = await db.collection("cases").findOne({ docketNumber: docket });
    expect(c?.isDemo).toBe(true);
    const i = await db.collection("interactions").findOne({ caseId: c?._id });
    expect(i?.channel).toBe("VOICE_CALL");
    expect(await db.collection("voice_windows").countDocuments({ interactionId: i?._id })).toBe(analysed); // what the page said
    expect(await db.collection("stored_audio").countDocuments({ interactionId: i?._id })).toBe(0); // no audio kept
  });
  await page.getByTestId("end").click();
});
