/**
 * the public portal's route wrapper (NIVARA_FLOW_AND_UI_PLAN.md §7, task N.4). Portal only; the
 * module never imports this. Anyone may file a portal case, so every `/api/portal/*` route goes
 * through the same checks:
 *   kill switch → same-site origin → per-visitor limit (by IP) → the browser's own cases only
 */
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { env } from "@/lib/env";
import { ApiError, problemResponse } from "@/lib/problem";
import { checkRateLimit, clientIp, mongoRateLimitStore, rateKey } from "@/lib/ratelimit";
import { newRequestId, route, type RouteContext, type RouteOptions } from "@/lib/route";
import { portalEnabled } from "./client";
import { PORTAL_LIMITS, OWN_COOKIE, OWN_MAX_AGE_SEC, decodeOwned, encodeOwned, ownKey, sameSite } from "./guard";

export { PORTAL_LIMITS, LIVE_IDLE_MS, MAX_CASE_MS, MAX_LIVE_CALL_MS, MAX_MESSAGES_PER_CASE, caseExpired, lineIsBusy, speechLeft } from "./guard";

type Params = Record<string, string | string[] | undefined>;

/* ---------- request-side helpers ---------- */

function key(): Buffer {
  return ownKey(env().AUTH_SECRET);
}

export function ownedIds(req: NextRequest): string[] {
  return decodeOwned(req.cookies.get(OWN_COOKIE)?.value, key());
}

/** Throws 404 unless this browser started the interaction: it cannot even learn that others exist. */
export function assertOwned(req: NextRequest, interactionId: string): void {
  if (!/^[a-f0-9]{24}$/.test(interactionId) || !ownedIds(req).includes(interactionId)) throw new ApiError("NOT_FOUND");
}

/** Adds a case to the browser's own list. Call on the response that returns a new interaction. */
export function rememberOwned(req: NextRequest, res: Response, interactionId: string): Response {
  const ids = [...ownedIds(req).filter((id) => id !== interactionId), interactionId];
  const secure = req.nextUrl.protocol === "https:";
  res.headers.append(
    "set-cookie",
    `${OWN_COOKIE}=${encodeOwned(ids, key())}; Path=/api/portal; Max-Age=${OWN_MAX_AGE_SEC}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
  );
  return res;
}

/** The daily cap across all visitors (§7). */
export async function checkDailyCap(nowMs: number): Promise<boolean> {
  const r = await checkRateLimit(mongoRateLimitStore, rateKey("portal-day", "all"), PORTAL_LIMITS.daily, nowMs);
  return r.allowed;
}

export interface PublicPortalOptions<B extends z.ZodType, Q extends z.ZodType> {
  body?: B;
  query?: Q;
  /** Which per-visitor limit applies */
  limit: keyof typeof PORTAL_LIMITS;
  /** Set when the route is `/api/portal/interactions/{id}/…`: the id must be one of this browser's cases */
  owned?: boolean;
}

/**
 * Route wrapper for the public portal. Off → 404 before anything else. Unsafe methods must come
 * from this site. Every route is limited per visitor by IP (hashed in storage).
 */
export function publicPortalRoute<B extends z.ZodType = z.ZodUndefined, Q extends z.ZodType = z.ZodUndefined>(
  opts: PublicPortalOptions<B, Q>,
  handler: (ctx: RouteContext<"public", B, Q>) => Promise<unknown>,
) {
  const base: RouteOptions<"public", B, Q> = {
    auth: "public",
    body: opts.body,
    query: opts.query,
    rateLimit: { limit: PORTAL_LIMITS[opts.limit], key: (req) => `portal:${opts.limit}:${clientIp(req.headers)}` },
  };
  const inner = route<"public", B, Q>(base, async (ctx) => {
    if (opts.owned) assertOwned(ctx.req, String(ctx.params.id));
    return handler(ctx);
  });
  return async (req: NextRequest, segment: { params: Promise<Params> }): Promise<Response> => {
    if (!portalEnabled()) return problemResponse(new ApiError("NOT_FOUND"), req.nextUrl.pathname, newRequestId());
    if (req.method !== "GET" && req.method !== "HEAD" && !sameSite(req.headers)) {
      return problemResponse(new ApiError("FORBIDDEN", "Cross-site request blocked"), req.nextUrl.pathname, newRequestId());
    }
    return inner(req, segment);
  };
}
