import { describe, expect, it } from "vitest";
import type { AssessmentDto, CaseDetailDto, CaseQueueItem, ReferralDto } from "@/contracts/staff";
import { ACTIONS, access, can, listScope, type Action, type PolicyResource, type PolicyUser } from "@/core/policies/rbac";
import {
  ForbiddenError,
  serializeAssessment,
  serializeCaseDetail,
  serializeCaseQueueItem,
  serializeReferral,
} from "@/core/policies/serializers";
import { ROLES, type Role } from "@/models/enums";

/**
 * API_CONTRACTS.md §4, transcribed independently of rbac.ts.
 * F = always full (✅) · C = full only in scope / when conditions hold (🔸, own calls, assigned, consent)
 * R = reduced fields, only in scope (🔸🔒) · - = forbidden
 * Column order: OPERATOR NHAA_SUPERVISOR COUNSELLOR DISTRICT_OFFICER POLICE_LIAISON WELFARE_OFFICER
 *               STATE_ADMIN MINISTRY_ADMIN SYS_ADMIN AUDITOR
 */
const MATRIX: Record<Action, string> = {
  "staff.self": "F F F F F F F F F F",
  "case.list": "F F F R - - R - - -",
  "case.read": "C F C R - - R - - -",
  "case.transcript.read": "C F C - - - - - - -",
  "case.assessment.read": "F F F R - - - - - -",
  "case.review": "- F F - - - - - - -",
  "recommendation.decide": "- F F C - - - - - -",
  "referral.list": "- F F C C C C - - -",
  "referral.update": "- F - C C C - - - -",
  "alert.read": "F F F C - - - - - -",
  "followup.manage": "- F F C - - - - - -",
  "analytics.read": "- F - C - - C F - -",
  "identity.read": "- F C - - - - - - -",
  "scoringConfig.read": "- - - - - - - - F F",
  "scoringConfig.write": "- - - - - - - - F -",
  "admin.users": "- - - - - - - - F -",
  "audit.read": "- - - - - - - - - F",
};

const userOf = (role: Role, extra: Partial<PolicyUser> = {}): PolicyUser => ({
  id: "u1",
  role,
  districtId: "d1",
  stateId: "s1",
  isOnDuty: false,
  ...extra,
});

/** Satisfies every condition for the role. */
const inScope = (role: Role): PolicyResource => ({
  districtId: "d1",
  stateId: "s1",
  operatorIds: ["u1"],
  assignedCounsellorId: "u1",
  escalated: true,
  shareWithCounsellor: true,
  referralTargetRole: role,
  recommendationType: "POLICE_INTERVENTION",
  alertEscalationLevel: 2,
});

/** Violates every condition. */
const outOfScope: PolicyResource = {
  districtId: "d2",
  stateId: "s2",
  operatorIds: [],
  assignedCounsellorId: "someone-else",
  escalated: false,
  shareWithCounsellor: false,
  referralTargetRole: "COUNSELLOR",
  recommendationType: "COUNSELLING",
  alertEscalationLevel: 0,
};

describe("authorisation matrix, every cell (task 1.7)", () => {
  it("covers every action", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...ACTIONS].sort());
  });

  const cells = ACTIONS.flatMap((action) =>
    MATRIX[action].split(" ").map((cell, i) => ({ action, role: ROLES[i]!, cell })),
  );

  it.each(cells)("$action / $role = $cell", ({ action, role, cell }) => {
    const user = userOf(role);
    const inside = access(user, action, inScope(role));
    const outside = access(user, action, outOfScope);
    switch (cell) {
      case "F":
        expect(inside).toBe("full");
        expect(outside).toBe("full");
        break;
      case "C":
        expect(inside).toBe("full");
        expect(outside).toBeNull();
        break;
      case "R":
        expect(inside).toBe("reduced");
        expect(outside).toBeNull();
        break;
      default:
        expect(inside).toBeNull();
        expect(outside).toBeNull();
    }
  });
});

describe("matrix conditions", () => {
  it("an on-duty counsellor can open an unassigned case", () => {
    const res = { ...outOfScope, assignedCounsellorId: "other" };
    expect(can(userOf("COUNSELLOR", { isOnDuty: true }), "case.read", res)).toBe(true);
    expect(can(userOf("COUNSELLOR"), "case.read", res)).toBe(false);
  });

  it("counsellors need shareWithCounsellor consent for transcripts", () => {
    const c = userOf("COUNSELLOR");
    expect(can(c, "case.transcript.read", { ...inScope("COUNSELLOR"), shareWithCounsellor: false })).toBe(false);
    expect(can(c, "case.transcript.read", inScope("COUNSELLOR"))).toBe(true);
  });

  it("identity needs the assigned counsellor AND consent, being on duty is not enough", () => {
    const c = userOf("COUNSELLOR", { isOnDuty: true });
    expect(can(c, "identity.read", { assignedCounsellorId: "other", shareWithCounsellor: true })).toBe(false);
    expect(can(c, "identity.read", { assignedCounsellorId: "u1", shareWithCounsellor: false })).toBe(false);
    expect(can(c, "identity.read", { assignedCounsellorId: "u1", shareWithCounsellor: true })).toBe(true);
  });

  it("state admins see only escalated cases in their state", () => {
    const s = userOf("STATE_ADMIN");
    expect(access(s, "case.read", { stateId: "s1", escalated: false })).toBeNull();
    expect(access(s, "case.read", { stateId: "s1", escalated: true })).toBe("reduced");
    expect(access(s, "case.read", { stateId: "s2", escalated: true })).toBeNull();
  });

  it("district officers decide only police/protection recommendations", () => {
    const d = userOf("DISTRICT_OFFICER");
    expect(can(d, "recommendation.decide", { districtId: "d1", recommendationType: "WITNESS_PROTECTION" })).toBe(true);
    expect(can(d, "recommendation.decide", { districtId: "d1", recommendationType: "COUNSELLING" })).toBe(false);
  });

  it("district officers see alerts only once escalated to them", () => {
    const d = userOf("DISTRICT_OFFICER");
    expect(can(d, "alert.read", { districtId: "d1", alertEscalationLevel: 1 })).toBe(false);
    expect(can(d, "alert.read", { districtId: "d1", alertEscalationLevel: 2 })).toBe(true);
  });

  it("police see only police referrals, welfare only welfare ones", () => {
    expect(can(userOf("POLICE_LIAISON"), "referral.list", { districtId: "d1", referralTargetRole: "WELFARE_OFFICER" })).toBe(false);
    expect(can(userOf("WELFARE_OFFICER"), "referral.list", { districtId: "d1", referralTargetRole: "POLICE_LIAISON" })).toBe(false);
  });

  it("a scoped role without a district or state assigned is denied", () => {
    expect(can(userOf("DISTRICT_OFFICER", { districtId: null }), "case.list")).toBe(false);
    expect(can(userOf("STATE_ADMIN", { stateId: null }), "analytics.read")).toBe(false);
  });

  it("police get 403 on every case, transcript, indicator and assessment action (AC-DSH-01)", () => {
    for (const role of ["POLICE_LIAISON", "WELFARE_OFFICER"] as const) {
      for (const action of ["case.list", "case.read", "case.transcript.read", "case.assessment.read", "identity.read"] as const) {
        expect(can(userOf(role), action, inScope(role)), `${role} ${action}`).toBe(false);
      }
    }
  });
});

describe("listScope", () => {
  it("scopes queries by district, state or nothing", () => {
    expect(listScope(userOf("COUNSELLOR"), "case.list")).toEqual({ kind: "all" });
    expect(listScope(userOf("DISTRICT_OFFICER"), "case.list")).toEqual({ kind: "district", districtId: "d1" });
    expect(listScope(userOf("STATE_ADMIN"), "case.list")).toEqual({ kind: "state", stateId: "s1" });
    expect(listScope(userOf("POLICE_LIAISON"), "referral.list")).toEqual({ kind: "district", districtId: "d1" });
    expect(listScope(userOf("POLICE_LIAISON"), "case.list")).toBeNull();
  });
});

// ---------------------------------------------------------------------------

const id = (n: number) => n.toString(16).padStart(24, "0");
const now = "2026-11-14T11:33:12.000Z";

const assessment: AssessmentDto = {
  id: id(1),
  interactionId: id(2),
  seq: 3,
  trigger: "TEXT_MESSAGE",
  svi: 81,
  computedBand: "CRITICAL",
  band: "CRITICAL",
  overridesFired: ["OV-2"],
  dimensions: { INTIMIDATION: { score: 0.9, confidence: 0.9, contribution: 13.5, bySource: { TEXT_NLP: 0.9 } } },
  confidence: 0.8,
  limitedConfidence: false,
  topEvidence: [{ indicatorId: id(4), dimension: "INTIMIDATION", label: "synthetic evidence label" }],
  explanation: "synthetic explanation",
  configVersion: 1,
  createdAt: now,
};

const detail: CaseDetailDto = {
  id: id(5),
  docketNumber: "TEST-0001",
  status: "UNDER_REVIEW",
  band: "CRITICAL",
  svi: 81,
  overrideLockedBand: "CRITICAL",
  summary: "synthetic summary",
  summaryTranslated: "synthetic summary (hi)",
  consent: { textAnalysis: true, voiceAnalysis: false, shareWithCounsellor: true, followUpContact: false },
  context: { ongoingThreats: true },
  interactions: [],
  latestAssessment: assessment,
  screenerScores: [{ instrument: "PHQ2", total: 4, maxTotal: 6, isPositive: true }],
  recommendations: [],
  openAlerts: [],
  bandOverrides: [],
  assignedTo: null,
};

const queueItem: CaseQueueItem = {
  id: id(5),
  docketNumber: "TEST-0001",
  band: "CRITICAL",
  svi: 81,
  status: "NEW",
  channel: "CHATBOT",
  language: "hi",
  district: { id: id(6), name: "Test district" },
  assignedTo: null,
  waitingSince: now,
  topReason: "synthetic top reason",
  limitedConfidence: false,
  openAlert: null,
};

describe("role serialisers", () => {
  it("gives counsellors the full case detail", () => {
    const out = serializeCaseDetail(userOf("NHAA_SUPERVISOR"), detail);
    expect(out.summary).toBe("synthetic summary");
    expect(out.latestAssessment).toHaveProperty("dimensions");
  });

  it("strips narrative, context, screeners and breakdown for district officers", () => {
    const out = serializeCaseDetail(userOf("DISTRICT_OFFICER"), detail, { districtId: "d1" });
    const json = JSON.stringify(out);
    for (const field of ["summary", "context", "screenerScores", "dimensions", "topEvidence", "explanation"]) {
      expect(json).not.toContain(`"${field}"`);
    }
    expect(out.latestAssessment).toEqual({ id: id(1), interactionId: id(2), seq: 3, svi: 81, band: "CRITICAL", createdAt: now });
  });

  it("refuses case and assessment data for police and welfare", () => {
    for (const role of ["POLICE_LIAISON", "WELFARE_OFFICER"] as const) {
      const u = userOf(role);
      expect(() => serializeCaseDetail(u, detail, { districtId: "d1" })).toThrow(ForbiddenError);
      expect(() => serializeCaseQueueItem(u, queueItem, { districtId: "d1" })).toThrow(ForbiddenError);
      expect(() => serializeAssessment(u, assessment, { districtId: "d1" })).toThrow(ForbiddenError);
    }
  });

  it("drops the evidence-derived top reason from the district queue", () => {
    expect(serializeCaseQueueItem(userOf("DISTRICT_OFFICER"), queueItem, { districtId: "d1" })).not.toHaveProperty("topReason");
    expect(serializeCaseQueueItem(userOf("COUNSELLOR"), queueItem).topReason).toBe("synthetic top reason");
  });

  it("whitelists referral fields so extra data cannot leak to police", () => {
    const leaky = { ...({ id: id(7), docketNumber: "TEST-0001", type: "POLICE_INTERVENTION", actionRequested: "Protection visit",
      contactRoute: "Via NHAA desk", urgency: "IMMEDIATE", status: "PENDING", createdAt: now } satisfies ReferralDto),
      svi: 81, summary: "should not pass" } as ReferralDto;
    const out = serializeReferral(userOf("POLICE_LIAISON"), leaky, { districtId: "d1", referralTargetRole: "POLICE_LIAISON" });
    expect(out).not.toHaveProperty("svi");
    expect(out).not.toHaveProperty("summary");
    expect(out.actionRequested).toBe("Protection visit");
  });
});
