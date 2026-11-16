/**
 * GET /api/v1/integration/cases/{docket}/status (task N.3, API_CONTRACTS §6.6). Where a case
 * stands and which support has been arranged, for systems holding the `status:read` scope.
 * Only cases this client created; never anything diagnostic (rule 1).
 */
import { loadCaseStatus } from "@/core/integration/status";
import { route } from "@/lib/route";

export const GET = route({ auth: "api", scope: "status:read" }, async ({ client, params }) => loadCaseStatus(String(params.docket), client.id));
