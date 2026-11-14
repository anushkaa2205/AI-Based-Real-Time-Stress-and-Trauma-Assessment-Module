/** Loads an alert with the policy resource needed to act on it (task 5.6). */
import type { PolicyResource } from "@/core/policies/rbac";
import { ApiError } from "@/lib/problem";
import { Alert, Case } from "@/models";

export async function loadAlert(id: string) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ApiError("NOT_FOUND");
  const alert = await Alert.findById(id);
  if (!alert) throw new ApiError("NOT_FOUND");
  const caseDoc = await Case.findById(alert.caseId).select("districtId stateId docketNumber").lean();
  const resource: PolicyResource = {
    districtId: caseDoc?.districtId ? String(caseDoc.districtId) : null,
    stateId: caseDoc?.stateId ? String(caseDoc.stateId) : null,
    alertEscalationLevel: alert.escalationLevel ?? 0,
  };
  return { alert, caseDoc, resource };
}
