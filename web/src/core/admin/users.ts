/**
 * Staff users and API clients (task 8.6, API_CONTRACTS §5.9, NFR-SEC-02). System admin only.
 * Temporary passwords, TOTP setup links and API keys are returned ONCE in the response and
 * never stored in plain text, logged or written to the audit trail.
 */
import { randomBytes } from "node:crypto";
import { record } from "@/core/audit/record";
import { hashPassword } from "@/core/auth/password";
import { newTotpSecret, roleRequiresTotp, totpUri } from "@/core/auth/totp";
import { generateKey, type Scope } from "@/core/integration/apikey";
import { encrypt } from "@/core/privacy/crypto";
import { ApiError } from "@/lib/problem";
import { ApiClient, District, User, type Role } from "@/models";

const ID = (v: unknown) => (v ? String(v) : null);
/** Roles tied to one district (police, welfare and district officers see only their district). */
const DISTRICT_ROLES: readonly Role[] = ["DISTRICT_OFFICER", "POLICE_LIAISON", "WELFARE_OFFICER"];

function tempPassword(): string {
  return randomBytes(12).toString("base64url"); // 16 characters
}

async function placeOf(role: Role, districtId: string | null | undefined) {
  if (DISTRICT_ROLES.includes(role) || role === "STATE_ADMIN") {
    if (!districtId) throw new ApiError("VALIDATION_FAILED", "This role needs a district");
    const d = await District.findById(districtId).select("stateId").lean();
    if (!d) throw new ApiError("VALIDATION_FAILED", "Unknown district");
    return { districtId: role === "STATE_ADMIN" ? null : districtId, stateId: String(d.stateId) };
  }
  return { districtId: null, stateId: null };
}

export async function listUsers() {
  const users = await User.find().sort({ role: 1, name: 1 }).limit(500).lean();
  return users.map((u) => ({
    id: String(u._id),
    email: u.email,
    name: u.name,
    role: u.role,
    districtId: ID(u.districtId),
    stateId: ID(u.stateId),
    isActive: u.isActive,
    isOnDuty: u.isOnDuty,
    lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
  }));
}

export async function createUser(adminId: string, input: { email: string; name: string; role: Role; districtId?: string | null; languages?: string[] }) {
  if (await User.exists({ email: input.email.toLowerCase() })) throw new ApiError("VALIDATION_FAILED", "A user with this e-mail already exists");
  const place = await placeOf(input.role, input.districtId);
  const password = tempPassword();
  const secret = roleRequiresTotp(input.role) ? newTotpSecret() : null;
  const u = await User.create({
    email: input.email,
    name: input.name,
    role: input.role,
    passwordHash: await hashPassword(password),
    districtId: place.districtId ?? undefined,
    stateId: place.stateId ?? undefined,
    languages: input.languages ?? [],
    totpSecretEnc: secret ? encrypt(secret) : undefined,
    isActive: true,
  });
  await record({ actorType: "USER", actorId: adminId, action: "user.create", entityType: "user", entityId: String(u._id), metadata: { role: input.role } });
  return { id: String(u._id), temporaryPassword: password, totpUri: secret ? totpUri(secret, input.email) : null };
}

export async function updateUser(
  adminId: string,
  id: string,
  input: { name?: string; role?: Role; districtId?: string | null; isActive?: boolean; resetPassword?: boolean },
) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ApiError("NOT_FOUND");
  const u = await User.findById(id);
  if (!u) throw new ApiError("NOT_FOUND");
  if (id === adminId && (input.isActive === false || (input.role && input.role !== u.role)))
    throw new ApiError("VALIDATION_FAILED", "You cannot deactivate yourself or change your own role");
  const before = { role: u.role, isActive: u.isActive };
  if (input.name) u.name = input.name;
  if (input.role || input.districtId !== undefined) {
    const role = (input.role ?? u.role) as Role;
    const place = await placeOf(role, input.districtId !== undefined ? input.districtId : ID(u.districtId));
    u.role = role;
    u.districtId = (place.districtId ?? undefined) as never;
    u.stateId = (place.stateId ?? undefined) as never;
  }
  if (input.isActive !== undefined) {
    u.isActive = input.isActive;
    if (!input.isActive) u.isOnDuty = false;
  }
  let temporaryPassword: string | null = null;
  if (input.resetPassword) {
    temporaryPassword = tempPassword();
    u.passwordHash = await hashPassword(temporaryPassword);
  }
  await u.save();
  await record({
    actorType: "USER",
    actorId: adminId,
    action: "user.update",
    entityType: "user",
    entityId: id,
    metadata: { fromRole: before.role, toRole: u.role, wasActive: before.isActive, isActive: u.isActive, passwordReset: !!input.resetPassword },
  });
  return { id, temporaryPassword };
}

export async function listApiClients() {
  const cs = await ApiClient.find().sort({ createdAt: -1 }).limit(200).lean();
  return cs.map((c) => ({
    id: String(c._id),
    name: c.name,
    keyPrefix: c.keyPrefix,
    scopes: c.scopes,
    rateLimitPerMin: c.rateLimitPerMin,
    isActive: c.isActive,
    isDemo: c.isDemo === true,
    createdAt: new Date(c.createdAt as unknown as Date).toISOString(),
  }));
}

export async function createApiClient(adminId: string, input: { name: string; scopes: Scope[]; rateLimitPerMin: number; isDemo?: boolean }) {
  const k = generateKey();
  const c = await ApiClient.create({ name: input.name, keyPrefix: k.prefix, keyHash: k.keyHash, scopes: input.scopes, rateLimitPerMin: input.rateLimitPerMin, isActive: true, isDemo: input.isDemo === true });
  await record({ actorType: "USER", actorId: adminId, action: "apiClient.create", entityType: "apiClient", entityId: String(c._id), metadata: { scopes: input.scopes, isDemo: input.isDemo === true } });
  return { id: String(c._id), keyPrefix: k.prefix, key: k.key };
}

/** DELETE: the key stops working at once; the record stays for the audit trail. */
export async function revokeApiClient(adminId: string, id: string) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new ApiError("NOT_FOUND");
  const r = await ApiClient.updateOne({ _id: id }, { $set: { isActive: false } });
  if (!r.matchedCount) throw new ApiError("NOT_FOUND");
  await record({ actorType: "USER", actorId: adminId, action: "apiClient.revoke", entityType: "apiClient", entityId: id });
}
