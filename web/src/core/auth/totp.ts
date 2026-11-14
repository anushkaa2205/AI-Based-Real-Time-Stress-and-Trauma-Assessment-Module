/** TOTP for supervisor and admin roles (task 1.6, NFR-SEC-02). */
import { generateSecret, generateURI, verify } from "otplib";
import { TOTP_ROLES, type Role } from "@/models/enums";

export const TOTP_ISSUER = "NHAA Assist (demo)";

export function roleRequiresTotp(role: Role): boolean {
  return TOTP_ROLES.includes(role);
}

export function newTotpSecret(): string {
  return generateSecret();
}

export function totpUri(secret: string, label: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label, secret });
}

/** Accepts the current code and one 30-second step either side (clock drift). */
export async function verifyTotp(secret: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const result = await verify({ secret, token: code, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}
