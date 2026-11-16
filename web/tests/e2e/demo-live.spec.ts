/**
 * Demo input 2, speak (tasks M.12, N.7). Edge plays the synthetic TTS fixture as its microphone
 * (`--use-file-for-fake-audio-capture`), so the real recorder, MediaRecorder and /audio path run.
 * Public: no sign-in. Needs DEMO_ENABLED and the analysis service; skipped otherwise. Synthetic audio only.
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
  test.skip(process.env.DEMO_ENABLED !== "true", "demo input layer switched off");
  const url = process.env.ANALYSIS_URL;
  const ok = url ? await fetch(new URL("/v1/health", url), { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false) : false;
  test.skip(!ok, "analysis service not running");
});

test("speak: windows go to /audio as the caller's channel while the visitor talks; no transcript on the page (M.12, N.7)", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin: baseURL ?? "http://localhost:3000" });
  await page.goto("/demo/call");
  await page.getByTestId("start").click();
  await page.getByTestId("voice-start").click({ timeout: 30_000 });
  await expect(page.getByTestId("voice-recorder")).toBeVisible();
  await page.waitForTimeout(16_000); // three 5 s windows
  await page.getByTestId("voice-stop").click();

  // Stop waits for every window, then registers the case: the docket appears, never a transcript.
  const docket = ((await page.getByTestId("docket").textContent({ timeout: 120_000 })) ?? "").trim();
  expect(docket).toMatch(/^NHAA-/);
  await expect(page.getByText(/village|meeting|school|families|water/i)).toHaveCount(0);
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

test("one live call at a time: a newcomer is told the line is busy; an idle call frees it; a supervisor may take it over (plan §7)", async ({ page, browser, baseURL }) => {
  const origin = baseURL ?? "http://localhost:3000";
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin });
  await page.goto("/");
  const first = (await (await page.request.post("/api/demo/interactions", { data: START })).json()) as { interactionId: string };
  // Touch the call so it counts as live (an audio window would do the same).
  await withDb((db) => db.collection("interactions").updateOne({ _id: new mongoose.Types.ObjectId(first.interactionId) }, { $set: { updatedAt: new Date() } }));

  const other = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": freshIp(), origin } });
  const busy = await other.request.post(`${origin}/api/demo/interactions`, { data: START });
  expect(busy.status()).toBe(409);
  expect(((await busy.json()) as { code: string }).code).toBe("LINE_BUSY");
  await other.close();

  // A supervisor takes the line over: the older call is ended.
  const sup = await browser.newPage();
  await sup.setExtraHTTPHeaders({ "x-forwarded-for": freshIp(), origin });
  await staffLogin(sup, "NHAA_SUPERVISOR");
  const taken = (await (await sup.request.post("/api/demo/interactions", { data: { ...START, takeover: true } })).json()) as { interactionId: string };
  await withDb(async (db) => {
    const get = (id: string) => db.collection("interactions").findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect((await get(first.interactionId))?.status).not.toBe("ACTIVE");
    expect((await get(taken.interactionId))?.status).toBe("ACTIVE");
  });
  expect((await sup.request.post(`/api/demo/interactions/${taken.interactionId}/end`)).status()).toBe(200);
  await sup.close();
});
