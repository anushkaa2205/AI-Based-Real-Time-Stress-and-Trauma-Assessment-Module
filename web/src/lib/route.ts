/**
 * Route helper (task 1.8). Every handler goes through the same steps
 * (CLAUDE.md "Coding conventions"):
 *   request id → CSRF origin check → authenticate → rate limit →
 *   authorise (core/policies) → validate (Zod contract) → handler → problem+json on error
 * Logs carry the request id, route and error code only, never bodies (NFR-REL-03).
 * Calling NHAA systems use `Authorization: ApiKey …` with scopes and a per-key rate limit
 * (task 8.4); there is no victim session (PRODUCT_VISION.md §5, task M.2).
 */
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { INTEGRATION_CONTRACT_VERSION } from "@/contracts/integration";
import { parseAuthorization, secretMatches, type Scope } from "@/core/integration/apikey";
import { access, type Access, type Action, type PolicyResource } from "@/core/policies/rbac";
import { ForbiddenError } from "@/core/policies/serializers";
import { db } from "@/lib/db";
import { ApiError, problemResponse } from "@/lib/problem";
import { LIMITS, checkRateLimit, mongoRateLimitStore, rateKey, rateLimitHeaders, type Limit } from "@/lib/ratelimit";
import { currentStaff, type StaffUser } from "@/lib/staff-session";
import { ApiClient } from "@/models";

export type { StaffUser };

type AuthMode = "staff" | "public" | "api";

export interface ApiCaller {
  id: string;
  name: string;
  scopes: string[];
  /** Task M.7: the portal's key; set when the key is created, never from a request */
  isPortal: boolean;
}
type Params = Record<string, string | string[] | undefined>;

export interface RouteContext<A extends AuthMode, B extends z.ZodType, Q extends z.ZodType> {
  req: NextRequest;
  requestId: string;
  params: Params;
  body: z.output<B>;
  query: z.output<Q>;
  user: A extends "staff" ? StaffUser : null;
  /** Integrating system (auth: "api") */
  client: A extends "api" ? ApiCaller : null;
  /** Resource-level check; throws 403 when not allowed. Returns the access level. */
  authorize(action: Action, resource?: PolicyResource): Access;
}

export interface RouteOptions<A extends AuthMode, B extends z.ZodType, Q extends z.ZodType> {
  auth: A;
  /** Permission needed to call this endpoint at all (list-level check). */
  action?: Action;
  /** API scope needed (auth: "api"). */
  scope?: Scope;
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

/** FR-API-02: key → client; unknown, inactive or wrong secret → 401 INVALID_API_KEY. */
async function loadApiClient(req: NextRequest): Promise<ApiCaller & { rateLimitPerMin: number }> {
  const parts = parseAuthorization(req.headers.get("authorization"));
  if (!parts) throw new ApiError("INVALID_API_KEY");
  await db();
  const c = await ApiClient.findOne({ keyPrefix: parts.prefix, isActive: true }).select("+keyHash name scopes rateLimitPerMin isPortal").lean();
  if (!c || !secretMatches(parts.secret, c.keyHash)) throw new ApiError("INVALID_API_KEY");
  return { id: String(c._id), name: c.name, scopes: c.scopes ?? [], isPortal: c.isPortal === true, rateLimitPerMin: c.rateLimitPerMin ?? 120 };
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
  const handle = async (req: NextRequest, segment: { params: Promise<Params> }): Promise<Response> => {
    const requestId = newRequestId();
    const instance = req.nextUrl.pathname;
    let headers: Record<string, string> = {};
    try {
      checkOrigin(req);

      const params = (await segment?.params) ?? {};
      const user = opts.auth === "staff" ? await loadStaffUser() : null;
      const client = opts.auth === "api" ? await loadApiClient(req) : null;
      if (client) {
        // Per-key limit (FR-API-02, AC-API-02), then the scope (403 SCOPE_MISSING).
        const result = await checkRateLimit(mongoRateLimitStore, rateKey("route", `api:${client.id}`), { limit: client.rateLimitPerMin, windowMs: 60_000 }, Date.now());
        headers = rateLimitHeaders(result);
        if (!result.allowed) throw new ApiError("RATE_LIMITED", undefined, { headers });
        if (opts.scope && !client.scopes.includes(opts.scope)) throw new ApiError("SCOPE_MISSING", `This key needs the ${opts.scope} scope`);
      }

      if (opts.rateLimit !== false && (opts.rateLimit || user)) {
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
        client: client ? { id: client.id, name: client.name, scopes: client.scopes, isPortal: client.isPortal } : null,
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
  if (opts.auth !== "api") return handle;
  // Task M.6 (gap V2): every integration response, errors included, states the contract version.
  return async (req: NextRequest, segment: { params: Promise<Params> }): Promise<Response> => {
    const res = await handle(req, segment);
    res.headers.set("X-Contract-Version", INTEGRATION_CONTRACT_VERSION);
    return res;
  };
}
