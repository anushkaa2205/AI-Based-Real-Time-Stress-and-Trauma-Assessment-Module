/** POST /api/v1/staff/alerts/{id}/resolve (task 5.6). The note stays out of the audit log. */
import { ResolveRequest } from "@/contracts/staff";
import { loadAlert } from "@/core/alerts/access";
import { record } from "@/core/audit/record";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";
import { Job } from "@/models";

export const POST = route({ auth: "staff", action: "alert.read", body: ResolveRequest }, async ({ user, params, authorize }) => {
  const { alert, resource } = await loadAlert(String(params.id));
  authorize("alert.read", resource);
  if (alert.status === "RESOLVED") throw new ApiError("INVALID_TRANSITION", "Alert is already resolved");
  const now = new Date();
  alert.status = "RESOLVED";
  alert.resolvedAt = now;
  if (!alert.acknowledgedAt) {
    alert.acknowledgedAt = now;
    alert.acknowledgedById = user.id as never;
  }
  alert.escalateAt = undefined;
  await alert.save();
  await Job.updateMany({ type: "alert.escalate", "payload.alertId": String(alert._id), doneAt: null }, { $set: { doneAt: now } });
  await record({ actorType: "USER", actorId: user.id, action: "alert.resolve", entityType: "alert", entityId: String(alert._id) });
  return { id: String(alert._id), status: "RESOLVED", resolvedAt: now.toISOString() };
});
