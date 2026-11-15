/** GET /api/v1/staff/admin/audit/verify (task 8.6, FR-AUD-03): checks the whole hash chain → `{ ok, checked, firstBrokenId? }`. */
import { record, verifyChain } from "@/core/audit/record";
import { route } from "@/lib/route";

export const GET = route({ auth: "staff", action: "audit.read" }, async ({ user }) => {
  const result = await verifyChain();
  await record({ actorType: "USER", actorId: user.id, action: "audit.verify", entityType: "audit", entityId: "chain", metadata: { ok: result.ok, checked: result.checked } });
  return result;
});
