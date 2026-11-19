/**
 * the portal's way into the module (API_CONTRACTS §6.5, PRODUCT_VISION.md §6):
 * plain HTTP calls to `/api/v1/integration/*` with the portal's own API key, exactly as an
 * NHAA system would make them. Server-only: the key never reaches the browser.
 * Portal only; the module never imports this.
 */
import { env } from "@/lib/env";
import { ApiError } from "@/lib/problem";

/** The portal pages and routes exist only when switched on (FR-API-05: the module never needs them). */
export function portalEnabled(): boolean {
  const e = env();
  return e.PORTAL_ENABLED === "true" && !!e.PORTAL_API_KEY;
}

export function assertPortalEnabled(): void {
  if (!portalEnabled()) throw new ApiError("NOT_FOUND");
}

export interface CallInfo {
  requestId: string | null;
  ms: number;
}

export interface ModuleReply<T = unknown> {
  status: number;
  body: T;
  call: CallInfo;
}

/** One call to the integration API. `origin` is this app's own origin (from the incoming request). */
export async function callModule<T = unknown>(origin: string, path: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<ModuleReply<T>> {
  const headers: Record<string, string> = { authorization: `ApiKey ${env().PORTAL_API_KEY}` };
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) body = init.form;
  const t0 = Date.now();
  const res = await fetch(new URL(`/api/v1/integration${path}`, origin), { method: init.method ?? "POST", headers, body, cache: "no-store" });
  const ms = Date.now() - t0;
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed as T, call: { requestId: res.headers.get("x-request-id"), ms } };
}
