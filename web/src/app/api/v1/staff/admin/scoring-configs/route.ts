/**
 * GET  /api/v1/staff/admin/scoring-configs: versions (system admin, auditor read-only).
 * POST /api/v1/staff/admin/scoring-configs: new inactive version; invalid weights or
 * thresholds → 422 INVALID_CONFIG (task 8.6, FR-SVI-06, API_CONTRACTS §5.9).
 */
import { z } from "zod";
import { createConfig, listConfigs } from "@/core/admin/configs";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "scoringConfig.read" }, async () => ({ items: await listConfigs() }));

export const POST = route({ auth: "staff", action: "scoringConfig.write", body: z.record(z.string(), z.unknown()) }, async ({ user, body }) =>
  Response.json(await createConfig(user.id, body), { status: 201 }),
);
