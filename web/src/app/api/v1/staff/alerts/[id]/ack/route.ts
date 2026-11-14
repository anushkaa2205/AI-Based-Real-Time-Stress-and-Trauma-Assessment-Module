/**
 * POST /api/v1/staff/alerts/{id}/ack (task 5.6, FR-ALR-02, AC-ALR-02).
 * Records who acknowledged and when, and cancels further escalation.
 */
import { loadAlert } from "@/core/alerts/access";
import { record } from "@/core/audit/record";
import { ApiError } from "@/lib/problem";
import { ONCALL, SUPERVISORS } from "@/lib/realtime/channels";
import { publish } from "@/lib/realtime/publish";
import { route } from "@/lib/route";
import { Alert, Case, Job } from "@/models";

export const POST = route({ auth: "staff", action: "alert.read" }, async ({ user, params, authorize }) => {
  const { alert, resource } = await loadAlert(String(params.id));
  authorize("alert.read", resource);
  const now = new Date();
  // Atomic: only the first acknowledgement wins.
  const updated = await Alert.findOneAndUpdate(
    { _id: alert._id, status: "OPEN" },
    { $set: { status: "ACKNOWLEDGED", acknowledgedById: user.id, acknowledgedAt: now, escalateAt: null } },
    { returnDocument: "after" },
  );
  if (!updated) throw new ApiError("ALREADY_ACKNOWLEDGED");
  await Promise.all([
    Job.updateMany({ type: "alert.escalate", "payload.alertId": String(alert._id), doneAt: null }, { $set: { doneAt: now, cleanupAt: new Date(now.getTime() + 7 * 86_400_000) } }),
    Case.updateOne({ _id: alert.caseId }, { $set: { waitingSince: now } }),
    record({
      actorType: "USER",
      actorId: user.id,
      action: "alert.ack",
      entityType: "alert",
      entityId: String(alert._id),
      metadata: { level: alert.level, ackSeconds: Math.round((now.getTime() - new Date(alert.createdAt).getTime()) / 1000) },
    }),
  ]);
  const data = { alertId: String(alert._id), caseId: String(alert.caseId), acknowledgedBy: { id: user.id, name: user.name }, acknowledgedAt: now.toISOString() };
  await publish([ONCALL, SUPERVISORS].map((channel) => ({ channel, event: "alert.acknowledged" as const, data })));
  return { id: String(alert._id), status: "ACKNOWLEDGED", acknowledgedAt: now.toISOString(), acknowledgedBy: { id: user.id, name: user.name } };
});
