/**
 * Speak on the portal (Phase P, tasks P.4, P.7, P.9; earlier M.12, N.7). Edge plays the synthetic TTS
 * fixture as its microphone (`--use-file-for-fake-audio-capture`), so the real recorder, MediaRecorder
 * and /audio path run, turn by turn. Public: no sign-in. Needs PORTAL_ENABLED and the analysis service;
 * skipped otherwise. Synthetic audio only.
 */
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { freshIp, staffLogin, withDb } from "./helpers";

const VOICE = resolve(__dirname, "../../../analysis-service/tests/fixtures/audio/pauses_en.wav");
const CONSENT = { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: true, shareWithCounsellor: true, followUpContact: false, audioRetention: false };
const START = { mode: "LIVE_AUDIO", language: "en", consent: CONSENT, districtCode: "MH-PUN" };

test.describe.configure({ mode: "serial" });
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${VOICE}`] },
  permissions: ["microphone"],
});

test.beforeAll(async () => {
  test.skip(process.env.PORTAL_ENABLED !== "true", "Nivara portal switched off");
});

test("speak turn by turn: windows go to /audio as the caller's channel, We heard shows the person's own words, then the next question (P.7)", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const url = process.env.ANALYSIS_URL;
  const ok = url ? await fetch(new URL("/v1/health", url), { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false) : false;
  test.skip(!ok, "analysis service not running");
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin: baseURL ?? "http://localhost:3000" });
  await page.goto("/start");
  await page.getByTestId("continue").click();
  await page.getByTestId("choose-speak").click();
  await expect(page).toHaveURL(/\/start\/speak$/);
  await expect(page.getByTestId("line-assistant").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("voice-start").click({ timeout: 30_000 });
  await expect(page.getByTestId("voice-recorder")).toBeVisible();
  await page.waitForTimeout(11_000); // two 5 s windows
  await page.getByTestId("voice-stop").click(); // Done

  await expect(page.getByTestId("line-person")).toHaveCount(1, { timeout: 120_000 });
  await expect(page.getByTestId("line-assistant")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.locator("[data-band]")).toHaveCount(0);

  await page.getByTestId("finish").click();
  await expect(page.getByTestId("review")).toBeVisible();
  await page.getByTestId("submit").click();
  const docket = ((await page.getByTestId("docket").textContent({ timeout: 60_000 })) ?? "").trim();
  expect(docket).toMatch(/^NHAA-/);
  await withDb(async (db) => {
    const c = await db.collection("cases").findOne({ docketNumber: docket });
    expect(c?.isPortal).toBe(true);
    const i = await db.collection("interactions").findOne({ caseId: c?._id });
    expect(i?.channel).toBe("VOICE_CALL");
    const ws = await db.collection("voice_windows").find({ interactionId: i?._id }).toArray();
    expect(ws.length).toBeGreaterThanOrEqual(1);
    for (const w of ws) expect(w).toMatchObject({ audioSource: "CALLER_ONLY", inputMethod: "LIVE_AUDIO" });
    expect(await db.collection("messages").countDocuments({ interactionId: i?._id, sender: "OPERATOR" })).toBeGreaterThanOrEqual(2);
    expect(await db.collection("stored_audio").countDocuments({ interactionId: i?._id })).toBe(0);
  });
});

test("one live call at a time, kept alive by any activity for 60 s; a supervisor may take it over (plan §7)", async ({ page, browser, baseURL }) => {
  const origin = baseURL ?? "http://localhost:3000";
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin });
  await page.goto("/");
  const opened = await page.request.post("/api/portal/interactions", { data: START });
  expect(opened.status()).toBe(201); // otherwise the checks below would test an empty line
  const first = (await opened.json()) as { interactionId: string };
  const setIdle = (ms: number) => withDb((db) => db.collection("interactions").updateOne({ _id: new mongoose.Types.ObjectId(first.interactionId) }, { $set: { updatedAt: new Date(Date.now() - ms) } }));

  // 45 s since the last activity (the person is reading a question): still busy.
  await setIdle(45_000);
  const other = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": freshIp(), origin } });
  const busy = await other.request.post(`${origin}/api/portal/interactions`, { data: START });
  expect(busy.status()).toBe(409);
  expect(((await busy.json()) as { code: string }).code).toBe("LINE_BUSY");

  // A next-question request is activity: it keeps the call alive.
  await setIdle(59_000);
  expect((await page.request.post(`/api/portal/interactions/${first.interactionId}/next-question`)).status()).toBe(200);
  expect((await other.request.post(`${origin}/api/portal/interactions`, { data: START })).status()).toBe(409);
  await other.close();

  // A supervisor takes the line over: the older call is ended.
  const sup = await browser.newPage();
  await sup.context().setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin });
  await staffLogin(sup, "NHAA_SUPERVISOR");
  const taken = (await (await sup.request.post("/api/portal/interactions", { data: { ...START, takeover: true } })).json()) as { interactionId: string };
  await withDb(async (db) => {
    const get = (id: string) => db.collection("interactions").findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect((await get(first.interactionId))?.status).not.toBe("ACTIVE");
    expect((await get(taken.interactionId))?.status).toBe("ACTIVE");
  });
  expect((await sup.request.post(`/api/portal/interactions/${taken.interactionId}/end`)).status()).toBe(200);
  await sup.close();
});
