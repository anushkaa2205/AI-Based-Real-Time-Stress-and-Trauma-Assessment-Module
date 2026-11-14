/**
 * Staff sign-in checks (task 1.6, NFR-SEC-02). Two steps for TOTP roles:
 *  1. e-mail + password  → `checkPassword` (no session yet)
 *  2. pending token + 6-digit code → `authorizeStaff` creates the session
 * Roles without TOTP get their session straight after step 1.
 */
import { decrypt } from "@/core/privacy/crypto";
import { record } from "@/core/audit/record";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { User } from "@/models/user";
import type { Role } from "@/models/enums";
import { verifyPassword } from "./password";
import { verifyPendingToken } from "./pending";
import { roleRequiresTotp, verifyTotp } from "./totp";

export interface StaffIdentity {
  id: string;
  name: string;
  email: string;
  role: Role;
  districtId: string | null;
  stateId: string | null;
}

function identityOf(u: {
  _id: unknown;
  name: string;
  email: string;
  role: Role;
  districtId?: unknown;
  stateId?: unknown;
}): StaffIdentity {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    districtId: u.districtId ? String(u.districtId) : null,
    stateId: u.stateId ? String(u.stateId) : null,
  };
}

/** Step 1. Returns the user and whether a TOTP step follows, or null for wrong credentials. */
export async function checkPassword(
  email: string,
  password: string,
): Promise<{ user: StaffIdentity; requiresTotp: boolean } | null> {
  await db();
  const u = await User.findOne({ email: email.toLowerCase().trim() }).select("+passwordHash").lean();
  const ok = await verifyPassword(password, u?.passwordHash);
  if (!u || !ok || !u.isActive) return null;
  return { user: identityOf(u), requiresTotp: roleRequiresTotp(u.role) };
}

async function markLogin(user: StaffIdentity) {
  await User.updateOne({ _id: user.id }, { $set: { lastLoginAt: new Date() } });
  await record({ actorType: "USER", actorId: user.id, action: "staff.login", entityType: "user", entityId: user.id });
}

/**
 * Auth.js `authorize`: password-only for non-TOTP roles, or pending token +
 * code for TOTP roles. Never lets a TOTP role in with a password alone.
 */
export async function authorizeStaff(creds: Partial<Record<string, unknown>>): Promise<StaffIdentity | null> {
  const str = (k: string) => (typeof creds[k] === "string" ? (creds[k] as string) : "");

  if (str("pendingToken") && str("code")) {
    const userId = verifyPendingToken(env().AUTH_SECRET, str("pendingToken"), Date.now());
    if (!userId) return null;
    await db();
    const u = await User.findById(userId).select("+totpSecretEnc").lean();
    if (!u || !u.isActive || !roleRequiresTotp(u.role) || !u.totpSecretEnc) return null;
    if (!(await verifyTotp(decrypt(u.totpSecretEnc), str("code")))) return null;
    const user = identityOf(u);
    await markLogin(user);
    return user;
  }

  const checked = await checkPassword(str("email"), str("password"));
  if (!checked || checked.requiresTotp) return null;
  await markLogin(checked.user);
  return checked.user;
}
