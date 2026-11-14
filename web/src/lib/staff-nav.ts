/**
 * Staff navigation per role (task 1.11). Pure data: which pages exist,
 * who may open them, and where each role lands after sign-in.
 * Page guards use the same lists, so the menu and the server agree.
 */
import { rolesFor } from "@/core/policies/rbac";
import type { Role } from "@/models/enums";

export interface StaffPage {
  href: string;
  label: string;
  roles: readonly Role[];
}

export const STAFF_PAGES = {
  operator: { href: "/operator", label: "Operator console", roles: ["OPERATOR", "NHAA_SUPERVISOR"] },
  counsellor: { href: "/counsellor", label: "Case queue", roles: ["COUNSELLOR", "NHAA_SUPERVISOR"] },
  district: { href: "/district", label: "District dashboard", roles: ["DISTRICT_OFFICER"] },
  police: { href: "/police", label: "Action requests", roles: ["POLICE_LIAISON"] },
  welfare: { href: "/welfare", label: "Referrals", roles: ["WELFARE_OFFICER"] },
  analytics: { href: "/analytics", label: "Analytics", roles: rolesFor("analytics.read") },
  admin: { href: "/admin", label: "Administration", roles: rolesFor("admin.users") },
  audit: { href: "/admin/audit", label: "Audit log", roles: rolesFor("audit.read") },
} as const satisfies Record<string, StaffPage>;

export type StaffPageKey = keyof typeof STAFF_PAGES;

export const ROLE_HOME: Record<Role, StaffPageKey> = {
  OPERATOR: "operator",
  NHAA_SUPERVISOR: "counsellor",
  COUNSELLOR: "counsellor",
  DISTRICT_OFFICER: "district",
  POLICE_LIAISON: "police",
  WELFARE_OFFICER: "welfare",
  STATE_ADMIN: "analytics",
  MINISTRY_ADMIN: "analytics",
  SYS_ADMIN: "admin",
  AUDITOR: "audit",
};

export function homeFor(role: Role): string {
  return STAFF_PAGES[ROLE_HOME[role]].href;
}

export function navFor(role: Role): StaffPage[] {
  return Object.values(STAFF_PAGES).filter((p) => (p.roles as readonly Role[]).includes(role));
}

export function canOpen(role: Role, page: StaffPageKey): boolean {
  return (STAFF_PAGES[page].roles as readonly Role[]).includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  OPERATOR: "Operator",
  NHAA_SUPERVISOR: "NHAA supervisor",
  COUNSELLOR: "Counsellor",
  DISTRICT_OFFICER: "District officer",
  POLICE_LIAISON: "Police liaison",
  WELFARE_OFFICER: "Welfare officer",
  STATE_ADMIN: "State admin",
  MINISTRY_ADMIN: "Ministry admin",
  SYS_ADMIN: "System admin",
  AUDITOR: "Auditor",
};
