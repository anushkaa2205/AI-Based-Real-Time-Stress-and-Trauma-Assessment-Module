/**
 * Route wrapper for `/api/demo/*` (API_CONTRACTS §6.5). When the demo is switched off every
 * route answers 404 before anything else happens; when on, the caller must be signed-in staff
 * allowed `demo.use` (a supervisor). Demo layer only.
 */
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { ApiError, problemResponse } from "@/lib/problem";
import { newRequestId, route, type RouteContext, type RouteOptions } from "@/lib/route";
import { demoEnabled } from "./client";

type Params = Record<string, string | string[] | undefined>;

export function demoRoute<B extends z.ZodType = z.ZodUndefined, Q extends z.ZodType = z.ZodUndefined>(
  opts: Omit<RouteOptions<"staff", B, Q>, "auth" | "action" | "scope">,
  handler: (ctx: RouteContext<"staff", B, Q>) => Promise<unknown>,
) {
  const inner = route<"staff", B, Q>({ ...opts, auth: "staff", action: "demo.use" }, handler);
  return async (req: NextRequest, segment: { params: Promise<Params> }): Promise<Response> => {
    if (!demoEnabled()) return problemResponse(new ApiError("NOT_FOUND"), req.nextUrl.pathname, newRequestId());
    return inner(req, segment);
  };
}

/** This app's own origin, for calling the integration API over HTTP like any NHAA system. */
export function originOf(req: NextRequest): string {
  return req.nextUrl.origin;
}
