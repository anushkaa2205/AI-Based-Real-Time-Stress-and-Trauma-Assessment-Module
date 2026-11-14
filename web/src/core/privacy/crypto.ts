/**
 * Application-level field encryption for every `…Enc` field (task 1.3,
 * NFR-SEC-01, DATABASE.md §8.1, ADR-8).
 *
 * Token format: enc:v1:<keyId>:<iv b64>:<tag b64>:<ciphertext b64>
 * AES-256-GCM, random 12-byte IV per value, 16-byte auth tag. The key id in the
 * token lets old values decrypt after the active key is rotated.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const PREFIX = "enc";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface Keyring {
  /** keyId -> 32-byte key */
  keys: Record<string, Buffer>;
  /** id of the key used for new encryptions */
  activeKeyId: string;
}

export class DecryptionError extends Error {
  constructor(reason: string) {
    // Never include the token or plaintext in the message (CLAUDE.md rule 9).
    super(`Could not decrypt field: ${reason}`);
    this.name = "DecryptionError";
  }
}

function keyFor(ring: Keyring, keyId: string): Buffer {
  const key = ring.keys[keyId];
  if (!key) throw new DecryptionError(`unknown key id "${keyId}"`);
  if (key.length !== KEY_BYTES) throw new DecryptionError(`key "${keyId}" has the wrong length`);
  return key;
}

export function encryptWith(ring: Keyring, plain: string): string {
  const key = ring.keys[ring.activeKeyId];
  if (!key || key.length !== KEY_BYTES) throw new Error("Active encryption key is missing or invalid");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, VERSION, ring.activeKeyId, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decryptWith(ring: Keyring, token: string): string {
  const parts = token.split(":");
  if (parts.length !== 6 || parts[0] !== PREFIX || parts[1] !== VERSION) {
    throw new DecryptionError("not an encrypted value");
  }
  const [, , keyId, ivB64, tagB64, dataB64] = parts as [string, string, string, string, string, string];
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new DecryptionError("malformed value");
  const decipher = createDecipheriv("aes-256-gcm", keyFor(ring, keyId), iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new DecryptionError("authentication failed (wrong key or tampered value)");
  }
}

/** True if the value looks like an encrypted token (not proof it decrypts). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${PREFIX}:${VERSION}:`);
}

/** Key id a token was encrypted with, for rotation jobs. */
export function keyIdOf(token: string): string | null {
  return isEncrypted(token) ? (token.split(":")[2] ?? null) : null;
}

/** Re-encrypts with the active key if the token uses an older one. */
export function reencryptWith(ring: Keyring, token: string): string {
  return keyIdOf(token) === ring.activeKeyId ? token : encryptWith(ring, decryptWith(ring, token));
}

function envKeyring(): Keyring {
  const e = env();
  return { keys: e.ENCRYPTION_KEYS, activeKeyId: e.ENCRYPTION_ACTIVE_KEY };
}

/** Encrypt with the keys from the environment. */
export function encrypt(plain: string): string {
  return encryptWith(envKeyring(), plain);
}

/** Decrypt with the keys from the environment. */
export function decrypt(token: string): string {
  return decryptWith(envKeyring(), token);
}
