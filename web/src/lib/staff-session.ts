/**
 * Loads the signed-in staff member from the database (role, scope and duty
 * are always fresh, so a deactivated account stops working at once).
 * Used by the route helper and by staff pages.
 */
import { forbidden, redirect } from "next/navigation";
import { auth } from "@/auth";
import type { PolicyUser } from "@/core/policies/rbac";
import { db } from "@/lib/db";
import { canOpen, type StaffPageKey } from "@/lib/staff-nav";
import type { Role } from "@/models/enums";
import { User } from "@/models/user";

export interface StaffUser extends PolicyUser {
  name: string;
  email: string;
  languages: string[];
  isOnDuty: boolean;
}

/** Null when signed out, the session expired, or the account is inactive. */
export async function currentStaff(): Promise<StaffUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  await db();
  const u = await User.findById(id).lean();
  if (!u || !u.isActive) return null;
  return {
    id: String(u._id),
    role: u.role as Role,
    districtId: u.districtId ? String(u.districtId) : null,
    stateId: u.stateId ? String(u.stateId) : null,
    isOnDuty: u.isOnDuty ?? false,
    name: u.name,
    email: u.email,
    languages: u.languages ?? [],
  };
}

/** Page guard: redirect to /login when signed out, 403 when the role may not open the page. */
export async function requirePage(page: StaffPageKey): Promise<StaffUser> {
  const user = await currentStaff();
  if (!user) redirect("/login");
  if (!canOpen(user.role, page)) forbidden();
  return user;
}
