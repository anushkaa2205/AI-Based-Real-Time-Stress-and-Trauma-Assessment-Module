/** Demo layer helpers shared by `/api/demo/*` (API_CONTRACTS §6.5). The public route wrapper is in `./public`. */
import type { NextRequest } from "next/server";

/** This app's own origin, for calling the integration API over HTTP like any NHAA system. */
export function originOf(req: NextRequest): string {
  return req.nextUrl.origin;
}
