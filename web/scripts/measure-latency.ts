/**
 * `npm run measure:latency -- [--base http://localhost:3001] [--runs 50]` (task 9.1, AC-SVI-02, NFR-PERF-01).
 * Sends synthetic messages from the person through the integration API and the full pipeline (lexicon + AI + scoring + transaction)
 * and reports p50/p95/max of the time until the response (the SVI is committed before it returns).
 * Run against a PRODUCTION build (`npm run build && npm run start -- -p 3001`) with the analysis
 * service up. Needs an integration API key (see scripts/integration-key.ts). Writes
 * evaluation/reports/latency.json. Prints timings only.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiKey } from "./integration-key";

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
  const headers = { "content-type": "application/json", authorization: `ApiKey ${apiKey()}` };
  const consent = { noticeVersion: "2026-11-v1", language: "en", textAnalysis: true, voiceAnalysis: false, shareWithCounsellor: true, followUpContact: false };
  const start = await fetch(`${BASE}/api/v1/integration/interactions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ channel: "CHATBOT", language: "en", districtCode: "MH-PUN", consent }),
  });
  const { interactionId } = (await start.json()) as { interactionId: string };
  const post = (path: string, body: unknown) =>
    fetch(`${BASE}/api/v1/integration/interactions/${interactionId}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return post;
}

async function main() {
  const times: number[] = [];
  let failures = 0;
  // A few messages per interaction, like a real conversation (the key's own rate limit applies).
  let post = await session();
  for (let i = 0; i < RUNS; i++) {
    if (i > 0 && i % 4 === 0) post = await session();
    const text = TEMPLATES[i % TEMPLATES.length]!.replace("{n}", String(Date.now() % 100000));
    const t0 = performance.now();
    const r = await post("/messages", { text, sender: "VICTIM" });
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
