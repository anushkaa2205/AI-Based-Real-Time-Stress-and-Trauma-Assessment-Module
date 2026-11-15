/**
 * `npm run measure:latency -- [--base http://localhost:3001] [--runs 50]` (task 9.1, AC-SVI-02, NFR-PERF-01).
 * Sends synthetic victim messages through the full pipeline (lexicon + AI + scoring + transaction)
 * and reports p50/p95/max of the time until the response (the SVI is committed before it returns).
 * Run against a PRODUCTION build (`npm run build && npm run start -- -p 3001`) with the analysis
 * service up. Writes evaluation/reports/latency.json. Prints timings only.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const BASE = arg("base") ?? "http://localhost:3001";
const RUNS = Math.max(5, Math.min(200, Number(arg("runs") ?? 50)));
const SPACING_MS = 2_500; // stay inside the free LLM tier's per-minute limits

// Synthetic, non-graphic sentences; a counter makes each one unique so no cache is hit.
const TEMPLATES = [
  "Since the complaint the neighbours do not speak to us and I feel alone ({n}).",
  "I keep worrying about my children walking to school ({n}).",
  "The hearing was postponed again and I feel tired of waiting ({n}).",
  "Some people in the village told us to keep quiet about the case ({n}).",
  "I cannot sleep well these days and I feel nervous all the time ({n}).",
];

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};

async function session() {
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  const h = { "content-type": "application/json", "x-forwarded-for": ip };
  const start = await fetch(`${BASE}/api/v1/victim/interactions`, { method: "POST", headers: h, body: JSON.stringify({ channel: "CHATBOT", language: "en", districtCode: "MH-PUN" }) });
  const cookie = start.headers.get("set-cookie")?.split(";")[0] ?? "";
  const { interactionId } = (await start.json()) as { interactionId: string };
  const headers = { ...h, cookie };
  const post = (path: string, body: unknown) => fetch(`${BASE}/api/v1/victim/interactions/${interactionId}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  await post("/consent", { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: false, shareWithCounsellor: true, followUpContact: false });
  await post("/screeners", { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SAFE_NOW", value: 1 });
  return post;
}

async function main() {
  const times: number[] = [];
  let failures = 0;
  // A few messages per session, like a real conversation (the per-session rate limit is 30/min).
  let post = await session();
  for (let i = 0; i < RUNS; i++) {
    if (i > 0 && i % 4 === 0) post = await session();
    const text = TEMPLATES[i % TEMPLATES.length]!.replace("{n}", String(Date.now() % 100000));
    const t0 = performance.now();
    const r = await post("/messages", { text, promptKey: "flow.narrative.open" });
    const ms = performance.now() - t0;
    if (r.ok) times.push(ms);
    else failures++;
    await new Promise((res) => setTimeout(res, SPACING_MS));
  }
  const out = {
    measuredAt: new Date().toISOString(),
    base: BASE,
    runs: RUNS,
    failures,
    p50Ms: Math.round(pct(times, 50)),
    p95Ms: Math.round(pct(times, 95)),
    maxMs: Math.round(Math.max(...times)),
    targetP95Ms: 3000,
  };
  writeFileSync(resolve(__dirname, "../../evaluation/reports/latency.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`text turn latency over ${times.length} runs: p50 ${out.p50Ms} ms, p95 ${out.p95Ms} ms, max ${out.maxMs} ms (target p95 < 3000 ms), failures ${failures}`);
}

main().catch((e) => {
  console.error(`measurement failed: ${(e as Error).message}`);
  process.exit(1);
});
