/**
 * Demo mode 2, live microphone (task M.12). Edge plays the synthetic TTS fixture as its microphone
 * (`--use-file-for-fake-audio-capture`), so the real recorder, MediaRecorder and /audio path run.
 * Needs DEMO_ENABLED and the analysis service; skipped otherwise. Synthetic audio only.
 */
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import mongoose from "mongoose";
import { staffLogin, withDb } from "./helpers";

const VOICE = resolve(__dirname, "../../../analysis-service/tests/fixtures/audio/pauses_en.wav");
const CONSENT = { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: true, shareWithCounsellor: true, followUpContact: false, audioRetention: false };

test.describe.configure({ mode: "serial" });
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${VOICE}`] },
  permissions: ["microphone"],
});

test.beforeAll(async () => {
  test.skip(process.env.DEMO_ENABLED !== "true", "demo input layer switched off");
  const url = process.env.ANALYSIS_URL;
  const ok = url ? await fetch(new URL("/v1/health", url), { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false) : false;
  test.skip(!ok, "analysis service not running");
});

test("live microphone: windows go to /audio as the caller's channel while the presenter speaks (M.12)", async ({ page }) => {
  test.setTimeout(180_000);
  await staffLogin(page, "NHAA_SUPERVISOR");
  await page.goto("/demo/live-call");
  await page.getByTestId("start-call").click();
  await page.getByTestId("voice-start").click({ timeout: 30_000 });
  await expect(page.getByTestId("voice-recorder")).toBeVisible();
  await page.waitForTimeout(16_000); // three 5 s windows
  await page.getByTestId("voice-stop").click();

  const timeline = page.getByTestId("timeline");
  await expect(timeline).toContainText("Window 1", { timeout: 60_000 });
  await expect(timeline).toContainText("202");
  await expect(timeline).toContainText("Call ended", { timeout: 90_000 }); // Stop waits for every window, then ends the call
  await expect(page.getByTestId("call-transcript")).toContainText(/village|meeting|school|families|water/i, { timeout: 30_000 });

  const docket = (await page.getByTestId("case-link").textContent())?.trim() ?? "";
  await withDb(async (db) => {
    const c = await db.collection("cases").findOne({ docketNumber: docket });
    expect(c?.isDemo).toBe(true);
    const i = await db.collection("interactions").findOne({ caseId: c?._id });
    expect(i?.channel).toBe("VOICE_CALL");
    const ws = await db.collection("voice_windows").find({ interactionId: i?._id }).toArray();
    expect(ws.length).toBeGreaterThanOrEqual(2);
    for (const w of ws) expect(w).toMatchObject({ audioSource: "CALLER_ONLY", inputMethod: "LIVE_AUDIO" });
    expect(await db.collection("stored_audio").countDocuments({ interactionId: i?._id })).toBe(0);
  });
});

test("one live microphone call at a time: starting another ends the older one (M.12, free tier)", async ({ page }) => {
  await staffLogin(page, "NHAA_SUPERVISOR");
  const start = async () => (await (await page.request.post("/api/demo/interactions", { data: { mode: "LIVE_AUDIO", language: "en", consent: CONSENT } })).json()) as { interactionId: string };
  const first = await start();
  const second = await start();
  await withDb(async (db) => {
    const get = (id: string) => db.collection("interactions").findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect((await get(first.interactionId))?.status).toBe("ENDED");
    expect((await get(second.interactionId))?.status).toBe("ACTIVE");
  });
  expect((await page.request.post(`/api/demo/interactions/${second.interactionId}/end`)).status()).toBe(200);
});
