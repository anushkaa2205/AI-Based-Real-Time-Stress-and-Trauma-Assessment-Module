/**
 * Route helper (task 1.8). Every handler goes through the same steps
 * (CLAUDE.md "Coding conventions"):
 *   request id → CSRF origin check → authenticate → rate limit →
 *   authorise (core/policies) → validate (Zod contract) → handler → problem+json on error
 * Logs carry the request id, route and error code only, never bodies (NFR-REL-03).
 * Victim sessions (task 3.2) are bound to the interaction in the URL; API-key
 * authentication is added in task 8.4.
 */
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { access, type Access, type Action, type PolicyResource } from "@/core/policies/rbac";
import { ForbiddenError } from "@/core/policies/serializers";
import { db } from "@/lib/db";
import { ApiError, problemResponse } from "@/lib/problem";
import { LIMITS, checkRateLimit, mongoRateLimitStore, rateKey, rateLimitHeaders, type Limit } from "@/lib/ratelimit";
import { currentStaff, type StaffUser } from "@/lib/staff-session";
import { loadVictimSession, type VictimSession } from "@/lib/victim-session";

export type { StaffUser };

type AuthMode = "staff" | "public" | "victim";
type Params = Record<string, string | string[] | undefined>;

export interface RouteContext<A extends AuthMode, B extends z.ZodType, Q extends z.ZodType> {
  req: NextRequest;
  requestId: string;
  params: Params;
  body: z.output<B>;
  query: z.output<Q>;
  user: A extends "staff" ? StaffUser : null;
  /** Victim session bound to the interaction in the URL (auth: "victim") */
  victim: A extends "victim" ? VictimSession : null;
  /** Resource-level check; throws 403 when not allowed. Returns the access level. */
  authorize(action: Action, resource?: PolicyResource): Access;
}

export interface RouteOptions<A extends AuthMode, B extends z.ZodType, Q extends z.ZodType> {
  auth: A;
  /** Permission needed to call this endpoint at all (list-level check). */
  action?: Action;
  body?: B;
  query?: Q;
  /** Overrides the default limit (staff: 300/min per user). */
  rateLimit?: { limit: Limit; key: (req: NextRequest, user: StaffUser | null) => string } | false;
}

const MAX_BODY_BYTES = 64 * 1024;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function newRequestId(): string {
  return `req_${randomBytes(9).toString("base64url")}`;
}

function zodErrors(err: z.ZodError) {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

/** CSRF defence in depth on top of SameSite cookies: browsers send Origin on unsafe requests. */
function checkOrigin(req: NextRequest) {
  if (!UNSAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser client
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError("FORBIDDEN", "Cross-site request blocked");
  }
  if (!host || originHost !== host) throw new ApiError("FORBIDDEN", "Cross-site request blocked");
}

async function loadStaffUser(): Promise<StaffUser> {
  const user = await currentStaff();
  if (!user) throw new ApiError("UNAUTHENTICATED");
  return user;
}

async function readBody(req: NextRequest, schema: z.ZodType): Promise<unknown> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE");
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE");
  let json: unknown;
  try {
    json = raw.length ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError("VALIDATION_FAILED", "Body must be valid JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError("VALIDATION_FAILED", undefined, { errors: zodErrors(parsed.error) });
  return parsed.data;
}

function readQuery(req: NextRequest, schema: z.ZodType): unknown {
  const obj: Record<string, string | string[]> = {};
  for (const key of new Set(req.nextUrl.searchParams.keys())) {
    const all = req.nextUrl.searchParams.getAll(key);
    obj[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  const parsed = schema.safeParse(obj);
  if (!parsed.success) throw new ApiError("VALIDATION_FAILED", undefined, { errors: zodErrors(parsed.error) });
  return parsed.data;
}

function toResponse(result: unknown, requestId: string, extraHeaders: Record<string, string>): Response {
  const res = result instanceof Response ? result : Response.json(result ?? null);
  res.headers.set("X-Request-Id", requestId);
  for (const [k, v] of Object.entries(extraHeaders)) res.headers.set(k, v);
  return res;
}

export function route<A extends AuthMode, B extends z.ZodType = z.ZodUndefined, Q extends z.ZodType = z.ZodUndefined>(
  opts: RouteOptions<A, B, Q>,
  handler: (ctx: RouteContext<A, B, Q>) => Promise<unknown>,
) {
  return async (req: NextRequest, segment: { params: Promise<Params> }): Promise<Response> => {
    const requestId = newRequestId();
    const instance = req.nextUrl.pathname;
    let headers: Record<string, string> = {};
    try {
      checkOrigin(req);

      const params = (await segment?.params) ?? {};
      const user = opts.auth === "staff" ? await loadStaffUser() : null;

      // Victim routes: the session check and the per-session counter are independent, so they
      // run in parallel (one database round trip instead of two). The counter is keyed by the
      // interaction in the URL; a request with a bad token still fails the session check.
      let victim: VictimSession | null = null;
      let victimCount: Promise<Awaited<ReturnType<typeof checkRateLimit>>> | null = null;
      if (opts.auth === "victim") {
        await db();
        if (opts.rateLimit !== false && !opts.rateLimit) {
          victimCount = checkRateLimit(mongoRateLimitStore, rateKey("route", `victim:${String(params.id)}`), LIMITS.victimSession, Date.now());
        }
        [victim] = await Promise.all([loadVictimSession(req, params.id), victimCount]);
      }

      if (victimCount) {
        const result = await victimCount;
        headers = rateLimitHeaders(result);
        if (!result.allowed) throw new ApiError("RATE_LIMITED", undefined, { headers });
      } else if (opts.rateLimit !== false && (opts.rateLimit || user || victim)) {
        const rl = opts.rateLimit || { limit: LIMITS.staff, key: (_r: NextRequest, u: StaffUser | null) => `staff:${u?.id}` };
        await db();
        const result = await checkRateLimit(mongoRateLimitStore, rateKey("route", rl.key(req, user)), rl.limit, Date.now());
        headers = rateLimitHeaders(result);
        if (!result.allowed) throw new ApiError("RATE_LIMITED", undefined, { headers });
      }

      if (opts.action && (!user || !access(user, opts.action))) throw new ApiError("FORBIDDEN");

      const body = opts.body ? await readBody(req, opts.body) : undefined;
      const query = opts.query ? readQuery(req, opts.query) : undefined;

      const ctx = {
        req,
        requestId,
        params,
        body,
        query,
        user,
        victim,
        authorize(action: Action, resource?: PolicyResource): Access {
          const level = user ? access(user, action, resource) : null;
          if (!level) throw new ApiError("FORBIDDEN");
          return level;
        },
      } as RouteContext<A, B, Q>;

      return toResponse(await handler(ctx), requestId, headers);
    } catch (err) {
      const apiErr =
        err instanceof ApiError
          ? err
          : err instanceof ForbiddenError
            ? new ApiError("FORBIDDEN")
            : err instanceof z.ZodError
              ? new ApiError("VALIDATION_FAILED", undefined, { errors: zodErrors(err) })
              : null;
      if (apiErr) {
        if (apiErr.status >= 500) console.error(`[${requestId}] ${req.method} ${instance} -> ${apiErr.code}`);
        const res = problemResponse(apiErr, instance, requestId);
        for (const [k, v] of Object.entries(headers)) if (!res.headers.has(k)) res.headers.set(k, v);
        return res;
      }
      // Unknown error: log the type only; messages can carry data.
      console.error(`[${requestId}] ${req.method} ${instance} -> INTERNAL ${(err as Error)?.name ?? "Error"}`);
      // Development only: code locations (stack frames without the message, which can carry data).
      if (process.env.NODE_ENV === "development") {
        const frames = ((err as Error)?.stack ?? "").split("\n").filter((l) => l.trim().startsWith("at ")).slice(0, 6);
        console.error(frames.join("\n"));
      }
      return problemResponse(new ApiError("INTERNAL"), instance, requestId);
    }
  };
}
