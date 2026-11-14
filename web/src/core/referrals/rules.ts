/**
 * Referral and recommendation-decision rules (tasks 6.1, 6.3; FR-REC-05/07/08, C-ETH-02).
 * Pure: no database, no network, no clock. Inputs in, result out.
 */
import { dueAt } from "@/core/recommendations/evaluate";
import type { ReferralStatus, SupportType, Urgency } from "@/models/enums";

/** Referral text is all police and welfare ever see; longer text tends to carry clinical detail (§5.5). */
export const REFERRAL_TEXT_MAX = 300;

/**
 * Default action text per support type: what to do, never why in clinical terms.
 * Used when the approver leaves the action blank.
 */
export const DEFAULT_ACTION: Record<SupportType, string> = {
  COUNSELLING: "Counselling session with the complainant",
  LEGAL_AID: "Legal aid: help registering the complaint and explaining rights",
  MEDICAL_ASSISTANCE: "Arrange a medical examination or treatment",
  POLICE_INTERVENTION: "Protection visit or patrolling near the complainant",
  WITNESS_PROTECTION: "Assess and arrange witness protection",
  EMERGENCY_SUPPORT: "Immediate call back to the complainant",
  REHABILITATION_RELIEF: "Rehabilitation and relief support",
  INFORMATION: "Share information on rights and support services",
};

export type DecisionKind = "APPROVE" | "REJECT" | "POST_REVIEW";
export type RecommendationStatus = "PROPOSED" | "APPROVED" | "REJECTED" | "AUTO_TRIGGERED" | "SUPERSEDED";

export type DecisionCheck =
  | { ok: true; nextStatus: RecommendationStatus; createsReferral: boolean }
  | { ok: false; code: "INVALID_TRANSITION" | "REASON_REQUIRED"; detail: string };

/**
 * FR-REC-05: proposals need a human decision; auto-triggered emergency support is
 * reviewed afterwards. Rejecting needs a reason. Only approval creates a referral (FR-REC-07).
 */
export function checkDecision(
  rec: { status: RecommendationStatus; postReviewed: boolean },
  decision: DecisionKind,
  reason: string | undefined,
): DecisionCheck {
  if (decision === "POST_REVIEW") {
    if (rec.status !== "AUTO_TRIGGERED") return { ok: false, code: "INVALID_TRANSITION", detail: "Only automatic recommendations are reviewed afterwards" };
    if (rec.postReviewed) return { ok: false, code: "INVALID_TRANSITION", detail: "Already reviewed" };
    return { ok: true, nextStatus: "AUTO_TRIGGERED", createsReferral: false };
  }
  if (rec.status !== "PROPOSED") return { ok: false, code: "INVALID_TRANSITION", detail: `This recommendation is already ${rec.status.toLowerCase()}` };
  if (decision === "REJECT") {
    if ((reason ?? "").trim().length < 5) return { ok: false, code: "REASON_REQUIRED", detail: "Give a reason of at least 5 characters" };
    return { ok: true, nextStatus: "REJECTED", createsReferral: false };
  }
  return { ok: true, nextStatus: "APPROVED", createsReferral: true };
}

export type ReferralTextCheck = { ok: true; actionRequested: string; locationHint?: string } | { ok: false; detail: string };

/** Fills the default action and enforces the 300-character limit on what external roles see. */
export function checkReferralText(type: SupportType, input: { actionRequested?: string; locationHint?: string } | undefined): ReferralTextCheck {
  const actionRequested = input?.actionRequested?.trim() || DEFAULT_ACTION[type];
  const locationHint = input?.locationHint?.trim() || undefined;
  if (actionRequested.length > REFERRAL_TEXT_MAX)
    return { ok: false, detail: `The action text is ${actionRequested.length} characters; keep it under ${REFERRAL_TEXT_MAX} and leave out clinical detail` };
  if (locationHint && locationHint.length > REFERRAL_TEXT_MAX)
    return { ok: false, detail: `The location hint must be under ${REFERRAL_TEXT_MAX} characters (village or ward, never a full address)` };
  return locationHint ? { ok: true, actionRequested, locationHint } : { ok: true, actionRequested };
}

/** How the stakeholder gets in touch: always through the NHAA desk, never the victim's own number. */
export function contactRoute(docketNumber: string): string {
  return `Via NHAA 14566 desk, quote ${docketNumber}`;
}

const OPEN: readonly ReferralStatus[] = ["PENDING", "ACCEPTED", "IN_PROGRESS"];
const NEXT: Record<ReferralStatus, ReferralStatus | null> = {
  PENDING: "ACCEPTED",
  ACCEPTED: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: null,
  DECLINED: null,
};

export type TransitionCheck = { ok: true } | { ok: false; code: "INVALID_TRANSITION" | "REASON_REQUIRED"; detail: string };

/** FR-REC-08, §5.5: PENDING → ACCEPTED → IN_PROGRESS → DONE; any open status → DECLINED with a reason. */
export function checkReferralTransition(from: ReferralStatus, to: ReferralStatus, declinedReason?: string): TransitionCheck {
  if (to === "DECLINED") {
    if (!OPEN.includes(from)) return { ok: false, code: "INVALID_TRANSITION", detail: `A ${from.toLowerCase()} referral cannot be declined` };
    if ((declinedReason ?? "").trim().length < 5) return { ok: false, code: "REASON_REQUIRED", detail: "Give a reason for declining (at least 5 characters)" };
    return { ok: true };
  }
  if (NEXT[from] !== to) return { ok: false, code: "INVALID_TRANSITION", detail: `Cannot move from ${from} to ${to}` };
  return { ok: true };
}

export function isOpenReferral(status: ReferralStatus): boolean {
  return OPEN.includes(status);
}

/** Overdue = past its due time and still open (district "missed deadlines", FR-DSH-03). */
export function isOverdue(r: { status: ReferralStatus; dueAt?: Date | null }, now: Date): boolean {
  return !!r.dueAt && isOpenReferral(r.status) && r.dueAt.getTime() < now.getTime();
}

/** The recommendation's due time if still ahead, else a fresh one from the same SLA table (Appendix C). */
export function referralDueAt(urgency: Urgency, recommendationDueAt: Date | null | undefined, now: Date): Date | undefined {
  if (recommendationDueAt && recommendationDueAt.getTime() > now.getTime()) return recommendationDueAt;
  return dueAt(urgency, now.getTime()) ?? undefined;
}
