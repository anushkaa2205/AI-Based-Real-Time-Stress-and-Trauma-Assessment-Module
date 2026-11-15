/** GET /api/docs/openapi.json (task 8.5): the OpenAPI 3.1 document, generated from the Zod contracts. */
import { openApiDocument } from "@/contracts/openapi";

export const dynamic = "force-static";

export function GET() {
  return Response.json(openApiDocument(), { headers: { "cache-control": "public, max-age=300" } });
}
