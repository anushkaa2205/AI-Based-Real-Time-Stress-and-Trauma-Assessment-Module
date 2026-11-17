/**
 * API keys for integrating systems (task 8.4, FR-API-02, API_CONTRACTS §6).
 * Format: `Authorization: ApiKey <prefix>.<secret>`. The prefix identifies the client;
 * only a SHA-256 hash of the 32-byte random secret is stored, and the full key is
 * shown once, at creation. Pure helpers plus a hash check that is constant-time.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { API_SCOPES } from "@/models/enums";

/** indicators:read (task M.5): indicators with their evidence; granted only to systems that need it */
/** status:read (task N.3): case status and arranged support, for a tracking page in the calling system */
/** questions:read (task P.3): the next scripted question for the calling system's chatbot */
export const SCOPES = API_SCOPES;
export type Scope = (typeof SCOPES)[number];

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function generateKey(): { prefix: string; secret: string; key: string; keyHash: string } {
  const prefix = `nhaa_${randomBytes(6).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");
  return { prefix, secret, key: `${prefix}.${secret}`, keyHash: hashSecret(secret) };
}

/** `ApiKey <prefix>.<secret>` → parts, or null. */
export function parseAuthorization(header: string | null): { prefix: string; secret: string } | null {
  const m = /^ApiKey\s+(nhaa_[a-f0-9]{12})\.([A-Za-z0-9_-]{20,100})$/.exec((header ?? "").trim());
  return m ? { prefix: m[1]!, secret: m[2]! } : null;
}

export function secretMatches(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
