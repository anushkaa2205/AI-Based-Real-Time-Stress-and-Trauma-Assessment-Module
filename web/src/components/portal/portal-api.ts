"use client";

/**
 * The portal's calls to the portal relay (`/api/portal/*`, API_CONTRACTS §6.5). The page never learns
 * anything about the assessment: only receipts, the assistant's next question (text only), the
 * person's own heard words, the emergency panel and, at the end, the docket number (rule 1).
 */
export async function portalFetch<T>(url: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T | null; code: string | null }> {
  const res = await fetch(url, { credentials: "same-origin", ...init }).catch(() => null);
  if (!res) return { ok: false, status: 0, data: null, code: "ANALYSIS_DEGRADED" };
  let data: (T & { code?: string }) | null = null;
  try {
    data = (await res.json()) as T & { code?: string };
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data: res.ok ? data : null, code: res.ok ? null : (data?.code ?? "ANALYSIS_DEGRADED") };
}

export function postJson<T>(url: string, body?: unknown) {
  return portalFetch<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

/** Error codes the portal has scripted wording for (`portal.errors.*`). */
export const KNOWN_ERRORS = ["LINE_BUSY", "RATE_LIMITED", "CONSENT_REQUIRED", "INTERACTION_ENDED", "NOT_FOUND", "ANALYSIS_DEGRADED"] as const;

export function errorKey(code: string | null): (typeof KNOWN_ERRORS)[number] {
  return (KNOWN_ERRORS as readonly string[]).includes(code ?? "") ? (code as (typeof KNOWN_ERRORS)[number]) : "ANALYSIS_DEGRADED";
}
