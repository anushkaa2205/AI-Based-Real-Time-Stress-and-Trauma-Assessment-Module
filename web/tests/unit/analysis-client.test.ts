/** Analysis client, breaker, signing and guardrails (tasks 4.1, 4.6, 4.7). Synthetic text only. */
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "@/core/analysis-client/breaker";
import { analyzeText, type CallDeps } from "@/core/analysis-client/client";
import { checkAnalysis, locate } from "@/core/analysis-client/guardrails";
import type { AnalyzeTextResponse } from "@/core/analysis-client/schema";
import { signBody, signedHeaders } from "@/core/analysis-client/sign";
import { redact } from "@/core/privacy/redact";

const HINDI = "वो लोग घर के बाहर खड़े हैं, कह रहे हैं केस वापस लो";

const response = (indicators: AnalyzeTextResponse["indicators"]): AnalyzeTextResponse => ({
  language: { code: "hi", confidence: 0.97, script: "Deva" },
  translation: { en: "Those people are standing outside the house" },
  indicators,
  immediateDanger: { detected: false, confidence: 0, evidence: null },
  emotion: { label: "fear", confidence: 0.8, distribution: { fear: 0.8 } },
  modelVersion: { nlp: "groq:test@prompt-v1" },
});

const ind = (quote: string, start: number, extra: Partial<AnalyzeTextResponse["indicators"][number]> = {}) => ({
  dimension: "INTIMIDATION",
  score: 0.9,
  confidence: 0.8,
  negated: false,
  flags: [] as string[],
  evidence: { quote, start, end: start + quote.length },
  rationale: "test",
  ...extra,
});

describe("request signing matches the Python service (task 4.1)", () => {
  it("uses HMAC-SHA256 over `timestamp.body`", () => {
    const expected = createHmac("sha256", "vector-secret").update('1700000000.{"a":1}').digest("hex");
    expect(signBody("vector-secret", "1700000000", '{"a":1}')).toBe(`sha256=${expected}`);
  });

  it("puts the timestamp in seconds", () => {
    const h = signedHeaders("s", "{}", 1_700_000_000_123);
    expect(h["x-timestamp"]).toBe("1700000000");
    expect(h["x-signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
  });
});

describe("guardrails (task 4.7, AC-NLP-05, rule 12)", () => {
  it("keeps evidence that is word-for-word in the original, at the right span", () => {
    const q = "केस वापस लो";
    const r = checkAnalysis(response([ind(q, HINDI.indexOf(q), { flags: ["PRESSURE_TO_WITHDRAW"] })]), HINDI, HINDI);
    expect(r.indicators).toHaveLength(1);
    const e = r.indicators[0]!.evidence;
    expect(HINDI.slice(e.start, e.end)).toBe(q);
    expect(r.indicators[0]!.flags).toEqual(["PRESSURE_TO_WITHDRAW"]);
    expect(r.indicators[0]!.source).toBe("TEXT_NLP");
  });

  it("drops invented quotes, unknown dimensions and placeholder quotes", () => {
    const r = checkAnalysis(
      response([
        ind("withdraw the case", 0),
        ind("घर के बाहर", 7, { dimension: "NOT_A_DIMENSION" }),
        ind("[PHONE]", 0),
      ]),
      HINDI,
      HINDI,
    );
    expect(r.indicators).toEqual([]);
    expect(r.dropped).toBe(3);
  });

  it("re-finds spans in the original when the service saw redacted text", () => {
    const original = "Call 9876543210, they said they will kill my family";
    const { text: redacted } = redact(original);
    const quote = "they will kill my family";
    const r = checkAnalysis(response([ind(quote, redacted.indexOf(quote))]), original, redacted);
    expect(r.indicators).toHaveLength(1);
    const e = r.indicators[0]!.evidence;
    expect(original.slice(e.start, e.end)).toBe(quote);
  });

  it("does not trust a reported span that points at different text", () => {
    expect(locate(HINDI, "केस वापस लो", { start: 0, end: 11 })).toEqual({ start: HINDI.indexOf("केस वापस लो"), end: HINDI.indexOf("केस वापस लो") + 11 });
  });

  it("clamps scores and filters unknown flags", () => {
    const q = "घर के बाहर खड़े हैं";
    const r = checkAnalysis(response([ind(q, HINDI.indexOf(q), { score: 1.6, confidence: -2, flags: ["MADE_UP", "ACCUSED_PRESENT"] })]), HINDI, HINDI);
    expect(r.indicators[0]).toMatchObject({ score: 1, confidence: 0, flags: ["ACCUSED_PRESENT"] });
  });
});

describe("circuit breaker (task 4.6)", () => {
  it("opens after 3 failures and closes after a successful trial", () => {
    const b = new CircuitBreaker(3, 30_000);
    b.failure(0);
    b.failure(1);
    expect(b.canCall(2)).toBe(true);
    b.failure(2);
    expect(b.state).toBe("open");
    expect(b.canCall(10_000)).toBe(false);
    expect(b.canCall(30_002)).toBe(true); // trial call allowed
    b.success();
    expect(b.state).toBe("closed");
  });
});

describe("analysis client never throws (task 4.6, NFR-REL-01)", () => {
  const deps = (fetchImpl: typeof fetch, breaker = new CircuitBreaker()): CallDeps => ({
    baseUrl: "http://analysis.test",
    secret: "s",
    fetchImpl,
    now: () => 1_700_000_000_000,
    breaker,
  });
  const req = { requestId: "r1", text: HINDI };

  it("returns the parsed result and signs the request", async () => {
    const fetchImpl = vi.fn(async () => Response.json(response([]))) as unknown as typeof fetch;
    const r = await analyzeText(req, deps(fetchImpl));
    expect(r.degraded).toBe(false);
    const init = (fetchImpl as unknown as { mock: { calls: [URL, RequestInit][] } }).mock.calls[0]![1];
    expect((init.headers as Record<string, string>)["x-signature"]).toMatch(/^sha256=/);
  });

  it.each([
    ["http error", async () => new Response("{}", { status: 503 }), "http-503"],
    ["bad output", async () => Response.json({ nope: true }), "invalid-output"],
    ["network error", async () => Promise.reject(new TypeError("fetch failed")), "unreachable"],
    [
      "timeout",
      async () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })),
      "timeout",
    ],
  ])("degrades on %s", async (_n, impl, reason) => {
    const r = await analyzeText(req, deps(impl as unknown as typeof fetch));
    expect(r).toEqual({ degraded: true, reason });
  });

  it("does not call at all while the circuit is open", async () => {
    const b = new CircuitBreaker(1, 60_000);
    b.failure(1_700_000_000_000);
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await analyzeText(req, deps(fetchImpl, b))).toEqual({ degraded: true, reason: "circuit-open" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
