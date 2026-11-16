/**
 * Case status for the calling system (Phase N, task N.3, NIVARA_FLOW_AND_UI_PLAN.md §8.2):
 * where the case stands and which support has been arranged. Nothing diagnostic: no score,
 * band, urgency, indicators or staff details ever leave through this path (CLAUDE.md rule 1).
 * Only cases that this client's own interactions created are visible; anything else is 404.
 */
import { DOCKET_PATTERN } from "@/core/cases/docket";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/problem";
import { Case, Interaction, Recommendation, type CaseStatus, type SupportType } from "@/models";

/** Recommendation statuses that mean the support has really been arranged (human-approved or the audited auto-trigger). */
export const ARRANGED_STATUSES = ["APPROVED", "AUTO_TRIGGERED"] as const;

export interface CaseStatusView {
  docketNumber: string;
  status: CaseStatus;
  registeredAt: string;
  updatedAt: string;
  support: SupportType[];
}

/** Pure shaping, so the exact key set is testable without a database. */
export function caseStatusView(
  c: { docketNumber: string; status: CaseStatus; createdAt: Date; updatedAt: Date },
  recommendations: { type: SupportType; status: string }[],
): CaseStatusView {
  const support = [...new Set(recommendations.filter((r) => (ARRANGED_STATUSES as readonly string[]).includes(r.status)).map((r) => r.type))];
  return { docketNumber: c.docketNumber, status: c.status, registeredAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), support };
}

export async function loadCaseStatus(docketNumber: string, clientId: string): Promise<CaseStatusView> {
  if (!DOCKET_PATTERN.test(docketNumber)) throw new ApiError("NOT_FOUND");
  await db();
  const c = await Case.findOne({ docketNumber }).select("docketNumber status createdAt updatedAt").lean();
  if (!c) throw new ApiError("NOT_FOUND");
  const owned = await Interaction.exists({ caseId: c._id, apiClientId: clientId });
  if (!owned) throw new ApiError("NOT_FOUND");
  const recs = await Recommendation.find({ caseId: c._id, status: { $in: ARRANGED_STATUSES } }).select("type status").lean();
  return caseStatusView(
    { docketNumber: c.docketNumber, status: c.status as CaseStatus, createdAt: c.createdAt as Date, updatedAt: c.updatedAt as Date },
    recs.map((r) => ({ type: r.type as SupportType, status: r.status as string })),
  );
}
