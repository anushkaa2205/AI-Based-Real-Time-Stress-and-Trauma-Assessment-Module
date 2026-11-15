/**
 * POST /api/v1/staff/admin/scoring-configs/{id}/simulate (task 8.6, §5.9): run the evaluation
 * set with this version (rules only, deterministic) → accuracy, recalls, confusion matrix.
 * Nothing is written.
 */
import { loadConfig } from "@/core/admin/configs";
import { loadScenarios, simulate } from "@/core/admin/simulate";
import { route } from "@/lib/route";

export const POST = route({ auth: "staff", action: "scoringConfig.read" }, async ({ params }) => simulate(loadScenarios(), await loadConfig(String(params.id))));
