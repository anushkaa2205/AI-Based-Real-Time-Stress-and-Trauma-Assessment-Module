/**
 * Voice end to end (tasks 7.5, 7.10): AC-CH-02, AC-VOI-06, voice part of AC-SVI-02.
 * Needs the analysis service running (ANALYSIS_URL); skipped otherwise.
 * Audio is the synthetic text-to-speech fixture, cut into 5-second WAV windows.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { staffLogin, victimSession, withDb } from "./helpers";

test.describe.configure({ mode: "serial" });

const FIXTURE = resolve(__dirname, "../../../analysis-service/tests/fixtures/audio/pauses_en.wav");
const WINDOW_S = 5;

/** Splits a 16-bit mono PCM WAV into standalone WAV files of WINDOW_S seconds. */
function wavWindows(path: string): Buffer[] {
  const wav = readFileSync(path);
  let pos = 12;
  let fmt: Buffer | null = null;
  let data: Buffer | null = null;
  while (pos + 8 <= wav.length) {
    const id = wav.toString("ascii", pos, pos + 4);
    const size = wav.readUInt32LE(pos + 4);
    if (id === "fmt ") fmt = wav.subarray(pos + 8, pos + 8 + size);
    if (id === "data") data = wav.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("bad wav");
  const byteRate = fmt.readUInt32LE(8);
  const step = byteRate * WINDOW_S;
  const out: Buffer[] = [];
  for (let i = 0; i < data.length; i += step) {
    const pcm = data.subarray(i, Math.min(i + step, data.length));
    if (pcm.length < byteRate) break; // skip a tail under 1 s
    const h = Buffer.alloc(44);
    h.write("RIFF", 0);
    h.writeUInt32LE(36 + pcm.length, 4);
    h.write("WAVE", 8);
    h.write("fmt ", 12);
    h.writeUInt32LE(16, 16);
    fmt.copy(h, 20, 0, 16);
    h.write("data", 36);
    h.writeUInt32LE(pcm.length, 40);
    out.push(Buffer.concat([h, pcm]));
  }
  return out;
}

test.beforeAll(async () => {
  const url = process.env.ANALYSIS_URL;
  const ok = url ? await fetch(new URL("/v1/health", url), { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false) : false;
  test.skip(!ok, "analysis service not running");
});

test("a simulated voice call updates the operator console every window; no audio is kept (AC-CH-02, AC-VOI-06)", async ({ page, request }) => {
  test.setTimeout(180_000);
  const v = await victimSession(request);
  await v.call("/consent", { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: true, shareWithCounsellor: true, followUpContact: false });
  await v.call("/screeners", { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SAFE_NOW", value: 1 });

  await staffLogin(page, "OPERATOR");
  expect((await page.request.post(`/api/v1/staff/interactions/${v.interactionId}/claim`)).status()).toBe(200);
  await page.goto("/operator");
  const row = page.getByTestId("live-row").filter({ hasText: v.docketNumber });
  await row.getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("call-view")).toBeVisible();
  await page.waitForTimeout(1500); // let the real-time subscription settle

  const windows = wavWindows(FIXTURE);
  expect(windows.length).toBeGreaterThanOrEqual(4);
  const headers = v.headers;
  const timings: number[] = [];
  for (const [i, wav] of windows.entries()) {
    const t0 = Date.now();
    const r = await request.post(`/api/v1/victim/interactions/${v.interactionId}/audio`, {
      headers,
      multipart: { audio: { name: `w${i}.wav`, mimeType: "audio/wav", buffer: wav }, windowIndex: String(i), startMs: String(i * WINDOW_S * 1000) },
    });
    timings.push(Date.now() - t0);
    expect(r.status()).toBe(202);
    const body = await r.json();
    expect(body.analysed).toBe(true);
    // Victims never see scores (rule 1).
    expect(Object.keys(body).sort()).toEqual(["analysed", "emergency", "showEmergencyPanel", "transcript", "windowIndex"]);
  }
  console.log(`voice window ms: ${timings.join(", ")}`);
  // Voice part of AC-SVI-02: each window is scored and pushed within 5 s.
  for (const ms of timings) expect(ms).toBeLessThan(5_000);

  // The console shows the live transcript and voice strip without a refresh.
  await expect(page.getByTestId("live-transcript")).toContainText(/village|meeting|school/i, { timeout: 10_000 });
  await expect(page.getByTestId("voice-strip")).toBeVisible();

  // A retried window is answered without analysing it again.
  const again = await request.post(`/api/v1/victim/interactions/${v.interactionId}/audio`, {
    headers,
    multipart: { audio: { name: "w0.wav", mimeType: "audio/wav", buffer: windows[0]! }, windowIndex: "0", startMs: "0" },
  });
  expect(again.headers()["idempotent-replay"]).toBe("true");

  await v.call("/end", { reason: "COMPLETED" });
  await withDb(async (db) => {
    const iid = new (await import("mongoose")).Types.ObjectId(v.interactionId);
    const vw = await db.collection("voice_windows").find({ interactionId: iid }).toArray();
    expect(vw).toHaveLength(windows.length);
    // SVI recomputed once per voice window (AC-CH-02).
    expect(await db.collection("assessments").countDocuments({ interactionId: iid, trigger: "VOICE_WINDOW" })).toBe(windows.length);
    // AC-VOI-06: features only; no audio anywhere.
    for (const w of vw) expect(Object.keys(w).some((k) => /audio|wav|raw|blob/i.test(k))).toBe(false);
    expect(await db.collection("stored_audio").countDocuments({ interactionId: iid })).toBe(0);
    // FR-VOI-08: voice indicators carry no safety-override flags.
    const voice = await db.collection("indicators").find({ interactionId: iid, source: "VOICE" }).toArray();
    for (const i of voice) expect(i.flags ?? []).toEqual([]);
  });
});

test("voice without voice consent is refused before any analysis (FR-CON-02)", async ({ request }) => {
  const v = await victimSession(request);
  await v.call("/consent", { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: false, shareWithCounsellor: false, followUpContact: false });
  const r = await request.post(`/api/v1/victim/interactions/${v.interactionId}/audio`, {
    headers: v.headers,
    multipart: { audio: { name: "w0.wav", mimeType: "audio/wav", buffer: wavWindows(FIXTURE)[0]! }, windowIndex: "0", startMs: "0" },
  });
  expect(r.status()).toBe(409);
  expect((await r.json()).code).toBe("CONSENT_REQUIRED");
});
