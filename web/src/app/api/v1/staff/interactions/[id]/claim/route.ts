/**
 * POST /api/v1/staff/interactions/{id}/claim: an on-duty operator takes a live session (task 7.5).
 * It then counts as one of the operator's own calls (matrix §4). Not in API_CONTRACTS yet (logged).
 */
import { record } from "@/core/audit/record";
import { ApiError } from "@/lib/problem";
import { route } from "@/lib/route";
import { Interaction } from "@/models";

export const POST = route({ auth: "staff", action: "case.list" }, async ({ user, params }) => {
  if (user.role !== "OPERATOR" && user.role !== "NHAA_SUPERVISOR") throw new ApiError("FORBIDDEN");
  if (user.role === "OPERATOR" && !user.isOnDuty) throw new ApiError("FORBIDDEN", "Go on duty to take a call");
  const id = String(params.id);
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ApiError("NOT_FOUND");
  const updated = await Interaction.findOneAndUpdate(
    { _id: id, status: "ACTIVE", $or: [{ operatorId: null }, { operatorId: { $exists: false } }, { operatorId: user.id }] },
    { $set: { operatorId: user.id } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) {
    const exists = await Interaction.exists({ _id: id });
    throw exists ? new ApiError("INVALID_TRANSITION", "Another operator has this call, or it has ended") : new ApiError("NOT_FOUND");
  }
  await record({ actorType: "USER", actorId: user.id, action: "interaction.claim", entityType: "interaction", entityId: id });
  return { id, operatorId: user.id };
});
