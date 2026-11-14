/** PATCH /api/v1/staff/me/duty: on-duty flag for alert routing (FR-ALR-01, task 1.11). */
import { DutyRequest } from "@/contracts/staff";
import { record } from "@/core/audit/record";
import { route } from "@/lib/route";
import { User } from "@/models/user";

export const PATCH = route({ auth: "staff", action: "staff.self", body: DutyRequest }, async ({ user, body }) => {
  await User.updateOne({ _id: user.id }, { $set: { isOnDuty: body.isOnDuty } });
  await record({
    actorType: "USER",
    actorId: user.id,
    action: "staff.duty",
    entityType: "user",
    entityId: user.id,
    metadata: { isOnDuty: body.isOnDuty },
  });
  return { isOnDuty: body.isOnDuty };
});
