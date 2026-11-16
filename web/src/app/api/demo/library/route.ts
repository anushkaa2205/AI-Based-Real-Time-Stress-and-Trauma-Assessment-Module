/** GET /api/demo/library (API_CONTRACTS §6.5, task M.14): the scenario library and which recordings exist. */
import { loadLibrary } from "@/core/demo/library";
import { demoRoute } from "@/core/demo/route";

export const GET = demoRoute({}, async () => ({ items: loadLibrary() }));
