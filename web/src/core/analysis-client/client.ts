/**
 * Typed client for the analysis service (task 4.6, NFR-REL-01, NFR-MNT-01).
 * Never throws: on timeout, error, bad output or an open circuit it returns
 * `{ degraded: true }` and the pipeline carries on with rules only.
 * Text sent here must already be redacted (NFR-SEC-05). Logs carry no text.
 */
import { env } from "@/lib/env";
import { CircuitBreaker } from "./breaker";
import { AnalyzeTextResponse, SummarizeResponse } from "./schema";
import { signedHeaders } from "./sign";

export const TEXT_TIMEOUT_MS = 2_500;
export const SUMMARY_TIMEOUT_MS = 6_000;

export type Analysis<T> = { degraded: false; result: T } | { degraded: true; reason: string };

const g = globalThis as unknown as { _analysisBreaker?: CircuitBreaker };
const breaker = (g._analysisBreaker ??= new CircuitBreaker());

export interface CallDeps {
  baseUrl: string;
  secret: string;
  fetchImpl: typeof fetch;
  now: () => number;
  breaker: CircuitBreaker;
  /** Overrides the per-call timeout (the evaluation runner waits longer) */
  timeoutMs?: number;
}

export function defaultDeps(): CallDeps {
  const e = env();
  return { baseUrl: e.ANALYSIS_URL, secret: e.ANALYSIS_HMAC_SECRET, fetchImpl: fetch, now: Date.now, breaker };
}

async function call<T>(
  path: string,
  payload: unknown,
  parse: (v: unknown) => T,
  timeoutMs: number,
  deps: CallDeps,
): Promise<Analysis<T>> {
  if (!deps.breaker.canCall(deps.now())) return { degraded: true, reason: "circuit-open" };
  const body = JSON.stringify(payload);
  try {
    const res = await deps.fetchImpl(new URL(path, deps.baseUrl), {
      method: "POST",
      headers: signedHeaders(deps.secret, body, deps.now()),
      body,
      signal: AbortSignal.timeout(deps.timeoutMs ?? timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      deps.breaker.failure(deps.now());
      return { degraded: true, reason: `http-${res.status}` };
    }
    const result = parse(await res.json());
    deps.breaker.success();
    return { degraded: false, result };
  } catch (err) {
    deps.breaker.failure(deps.now());
    const name = (err as Error)?.name ?? "Error";
    return { degraded: true, reason: name === "TimeoutError" ? "timeout" : name === "ZodError" ? "invalid-output" : "unreachable" };
  }
}

export interface AnalyzeTextRequest {
  requestId: string;
  /** Redacted text only */
  text: string;
  languageHint?: string;
  context?: { isSexualOffence?: boolean; isMinor?: boolean };
}

export function analyzeText(req: AnalyzeTextRequest, deps: CallDeps = defaultDeps()): Promise<Analysis<AnalyzeTextResponse>> {
  return call("/v1/analyze/text", { ...req, tasks: ["language", "translation", "indicators", "emotion"] }, (v) => AnalyzeTextResponse.parse(v), TEXT_TIMEOUT_MS, deps);
}

export function summarizeCase(
  req: { requestId: string; messages: { sender: string; text: string }[]; language: string },
  deps: CallDeps = defaultDeps(),
): Promise<Analysis<SummarizeResponse>> {
  return call("/v1/summarize", req, (v) => SummarizeResponse.parse(v), SUMMARY_TIMEOUT_MS, deps);
}
