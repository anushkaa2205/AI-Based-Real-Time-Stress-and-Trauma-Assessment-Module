/**
 * Builds the policy resource for a case (task 5.3): who handled it, where it is,
 * whether the victim allowed sharing with a counsellor, whether it escalated.
 * Used by every staff endpoint and real-time channel check (core/policies).
 */
import type { PolicyResource } from "@/core/policies/rbac";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/problem";
import { Alert, Case, Interaction } from "@/models";

const ID = (v: unknown) => (v ? String(v) : null);

/** District officers receive alerts at escalation level 2; that also counts as "escalated" for state view. */
export const ESCALATED_LEVEL = 2;

export async function loadCaseResource(caseId: string) {
  if (!/^[a-f0-9]{24}$/.test(caseId)) throw new ApiError("NOT_FOUND");
  await db();
  const [caseDoc, interactions, escalated] = await Promise.all([
    Case.findById(caseId).lean(),
    Interaction.find({ caseId }).sort({ startedAt: 1 }).select("operatorId consents channel uiLanguage startedAt endedAt status mode context").lean(),
    Alert.exists({ caseId, escalationLevel: { $gte: ESCALATED_LEVEL } }),
  ]);
  if (!caseDoc) throw new ApiError("NOT_FOUND");
  const latestConsent = interactions
    .flatMap((i) => i.consents ?? [])
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .at(-1);
  const resource: PolicyResource = {
    districtId: ID(caseDoc.districtId),
    stateId: ID(caseDoc.stateId),
    assignedCounsellorId: ID(caseDoc.assignedCounsellorId),
    operatorIds: interactions.map((i) => ID(i.operatorId)).filter((x): x is string => !!x),
    escalated: !!escalated,
    shareWithCounsellor: !!latestConsent && latestConsent.action !== "WITHDRAWN" && latestConsent.shareWithCounsellor === true,
  };
  return { caseDoc, interactions, resource, latestConsent };
}

/** The case resource for an interaction id. */
export async function loadInteractionResource(interactionId: string) {
  if (!/^[a-f0-9]{24}$/.test(interactionId)) throw new ApiError("NOT_FOUND");
  await db();
  const interaction = await Interaction.findById(interactionId).select("caseId").lean();
  if (!interaction) throw new ApiError("NOT_FOUND");
  return loadCaseResource(String(interaction.caseId));
}
