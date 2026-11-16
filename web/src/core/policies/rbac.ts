/**
 * Role-based access control (task 1.7, NFR-PRI-02, API_CONTRACTS.md §4).
 * One `can(user, action, resource)` built from the authorisation matrix.
 * Pure: no database, no clock. Always applied on the server (CLAUDE.md rule 8).
 *
 * Matrix legend → here: ✅ "full" · 🔸 scope check · 🔒 "reduced" fields · — null (403)
 */
import type { Role, SupportType } from "@/models/enums";

export const ACTIONS = [
  "staff.self", // GET /me, PATCH /me/duty, GET /health
  "case.list", // queue GET /cases
  "case.read", // GET /cases/{id}
  "case.transcript.read", // transcript, indicators, evidence
  "case.assessment.read", // assessments / SVI timeline
  "case.review", // review indicator, override band, notes
  "recommendation.decide",
  "referral.list",
  "referral.update",
  "alert.read", // list and acknowledge
  "followup.manage",
  "analytics.read",
  "identity.read", // GET /cases/{id}/identity (PII)
  "scoringConfig.read",
  "scoringConfig.write",
  "admin.users", // users and API clients
  "audit.read", // audit logs and chain verify
  "demo.use", // demo input layer pages and /api/demo (task M.11, M.14; only when DEMO_ENABLED)
] as const;
export type Action = (typeof ACTIONS)[number];

export type Access = "full" | "reduced";

export interface PolicyUser {
  id: string;
  role: Role;
  districtId?: string | null;
  stateId?: string | null;
  isOnDuty?: boolean;
}

/** Facts about the thing being accessed. Omit for list-level checks. */
export interface PolicyResource {
  districtId?: string | null;
  stateId?: string | null;
  assignedCounsellorId?: string | null;
  /** Operators who handled an interaction of this case ("own calls") */
  operatorIds?: readonly string[];
  /** Case escalated to state level (state admins see escalated cases only) */
  escalated?: boolean;
  /** Victim's shareWithCounsellor consent */
  shareWithCounsellor?: boolean;
  referralTargetRole?: Role;
  recommendationType?: SupportType;
  alertEscalationLevel?: number;
}

type Rule = (u: PolicyUser, r: PolicyResource | undefined) => Access | null;

const full: Rule = () => "full";
const yes = (cond: boolean, access: Access = "full"): Access | null => (cond ? access : null);

/** 🔸 district scope. Without a resource (list check) only the user's own scope is required. */
const inDistrict = (u: PolicyUser, r?: PolicyResource) => !!u.districtId && (!r || r.districtId === u.districtId);
const inState = (u: PolicyUser, r?: PolicyResource) => !!u.stateId && (!r || r.stateId === u.stateId);

const ownCall = (u: PolicyUser, r?: PolicyResource) => !r || (r.operatorIds ?? []).includes(u.id);
const assignedOrOnDuty = (u: PolicyUser, r?: PolicyResource) =>
  !r || r.assignedCounsellorId === u.id || u.isOnDuty === true;
const ownReferralRole = (u: PolicyUser, r?: PolicyResource) => !r || r.referralTargetRole === u.role;

const POLICE_PROTECTION_TYPES: readonly SupportType[] = ["POLICE_INTERVENTION", "WITNESS_PROTECTION"];
/** District officers see an alert once it escalates to them (level 2, ARCHITECTURE §6.3). */
const DISTRICT_ALERT_LEVEL = 2;

const MATRIX: Record<Action, Partial<Record<Role, Rule>>> = {
  "staff.self": Object.fromEntries(
    (
      [
        "OPERATOR",
        "NHAA_SUPERVISOR",
        "COUNSELLOR",
        "DISTRICT_OFFICER",
        "POLICE_LIAISON",
        "WELFARE_OFFICER",
        "STATE_ADMIN",
        "MINISTRY_ADMIN",
        "SYS_ADMIN",
        "AUDITOR",
      ] as const
    ).map((role) => [role, full]),
  ),
  "case.list": {
    OPERATOR: full,
    NHAA_SUPERVISOR: full,
    COUNSELLOR: full,
    DISTRICT_OFFICER: (u, r) => yes(inDistrict(u, r), "reduced"),
    STATE_ADMIN: (u, r) => yes(inState(u, r), "reduced"),
  },
  "case.read": {
    OPERATOR: (u, r) => yes(ownCall(u, r)),
    NHAA_SUPERVISOR: full,
    COUNSELLOR: (u, r) => yes(assignedOrOnDuty(u, r)),
    DISTRICT_OFFICER: (u, r) => yes(inDistrict(u, r), "reduced"),
    STATE_ADMIN: (u, r) => yes(inState(u, r) && (!r || r.escalated === true), "reduced"),
  },
  "case.transcript.read": {
    OPERATOR: (u, r) => yes(ownCall(u, r)),
    // §4 rule 3: transcripts need shareWithCounsellor consent, except for staff who
    // handled the live interaction (decided 2026-11-15: supervisors respect consent too).
    NHAA_SUPERVISOR: (u, r) => yes(!r || r.shareWithCounsellor === true || (r.operatorIds ?? []).includes(u.id)),
    COUNSELLOR: (u, r) => yes(assignedOrOnDuty(u, r) && (!r || r.shareWithCounsellor === true)),
  },
  "case.assessment.read": {
    OPERATOR: full,
    NHAA_SUPERVISOR: full,
    COUNSELLOR: full,
    DISTRICT_OFFICER: (u, r) => yes(inDistrict(u, r), "reduced"),
  },
  "case.review": { NHAA_SUPERVISOR: full, COUNSELLOR: full },
  "recommendation.decide": {
    NHAA_SUPERVISOR: full,
    COUNSELLOR: full,
    DISTRICT_OFFICER: (u, r) =>
      yes(inDistrict(u, r) && (!r || (!!r.recommendationType && POLICE_PROTECTION_TYPES.includes(r.recommendationType)))),
  },
  "referral.list": {
    NHAA_SUPERVISOR: full,
    COUNSELLOR: full,
    DISTRICT_OFFICER: (u, r) => yes(inDistrict(u, r)),
    POLICE_LIAISON: (u, r) => yes(inDistrict(u, r) && ownReferralRole(u, r)),
    WELFARE_OFFICER: (u, r) => yes(inDistrict(u, r) && ownReferralRole(u, r)),
    STATE_ADMIN: (u, r) => yes(inState(u, r)),
  },
  "referral.update": {
    NHAA_SUPERVISOR: full,
    DISTRICT_OFFICER: (u, r) => yes(inDistrict(u, r)),
    POLICE_LIAISON: (u, r) => yes(inDistrict(u, r) && ownReferralRole(u, r)),
    WELFARE_OFFICER: (u, r) => yes(inDistrict(u, r) && ownReferralRole(u, r)),
  },
  "alert.read": {
    OPERATOR: full,
    NHAA_SUPERVISOR: full,
    COUNSELLOR: full,
    DISTRICT_OFFICER: (u, r) => yes(inDistrict(u, r) && (!r || (r.alertEscalationLevel ?? 0) >= DISTRICT_ALERT_LEVEL)),
  },
  "followup.manage": {
    NHAA_SUPERVISOR: full,
    COUNSELLOR: full,
    DISTRICT_OFFICER: (u, r) => yes(inDistrict(u, r)),
  },
  "analytics.read": {
    NHAA_SUPERVISOR: full,
    DISTRICT_OFFICER: (u, r) => yes(inDistrict(u, r)),
    STATE_ADMIN: (u, r) => yes(inState(u, r)),
    MINISTRY_ADMIN: full,
  },
  "identity.read": {
    NHAA_SUPERVISOR: full,
    COUNSELLOR: (u, r) => yes(!!r && r.assignedCounsellorId === u.id && r.shareWithCounsellor === true),
  },
  "scoringConfig.read": { SYS_ADMIN: full, AUDITOR: full },
  "scoringConfig.write": { SYS_ADMIN: full },
  "admin.users": { SYS_ADMIN: full },
  "audit.read": { AUDITOR: full },
  // Presenters sign in as a supervisor: the results view reads case data through the staff API.
  "demo.use": { NHAA_SUPERVISOR: full },
};

/** "full", "reduced" (fewer fields) or null (forbidden). */
export function access(user: PolicyUser, action: Action, resource?: PolicyResource): Access | null {
  const rule = MATRIX[action][user.role];
  return rule ? rule(user, resource) : null;
}

export function can(user: PolicyUser, action: Action, resource?: PolicyResource): boolean {
  return access(user, action, resource) !== null;
}

/** Query scope for list endpoints, so district/state roles never load out-of-scope rows. */
export type ListScope =
  | { kind: "all" }
  | { kind: "district"; districtId: string }
  | { kind: "state"; stateId: string };

const DISTRICT_SCOPED: readonly Role[] = ["DISTRICT_OFFICER", "POLICE_LIAISON", "WELFARE_OFFICER"];

export function listScope(user: PolicyUser, action: Action): ListScope | null {
  if (!can(user, action)) return null;
  if (DISTRICT_SCOPED.includes(user.role)) return user.districtId ? { kind: "district", districtId: user.districtId } : null;
  if (user.role === "STATE_ADMIN") return user.stateId ? { kind: "state", stateId: user.stateId } : null;
  return { kind: "all" };
}

/** Roles a page or endpoint group is open to, for navigation and page guards. */
export function rolesFor(action: Action): Role[] {
  return Object.keys(MATRIX[action]) as Role[];
}
