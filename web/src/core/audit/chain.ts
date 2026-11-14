/**
 * Audit hash chain, pure part (task 1.5, FR-AUD-03, DATABASE.md §9).
 * hash = sha256(prevHash + canonicalJson(entry)); the first entry links to GENESIS.
 */
import { createHash } from "node:crypto";
import type { ActorType } from "@/models/enums";

export const GENESIS = "GENESIS";

type MetaValue = string | number | boolean | null | MetaValue[] | { [k: string]: MetaValue };

export interface AuditEntryInput {
  actorType: ActorType;
  actorId?: string | null;
  /** e.g. "case.view", "indicator.review", "consent.withdraw" */
  action: string;
  entityType: string;
  entityId: string;
  /** IDs, versions, counts. Never victim text (CLAUDE.md rule 9). */
  metadata?: Record<string, MetaValue>;
  ipHash?: string | null;
}

export interface ChainedEntry extends AuditEntryInput {
  id: string;
  prevHash: string;
  hash: string;
}

/** Keys that suggest free text or PII; rejected in metadata (CLAUDE.md rule 9). */
const FORBIDDEN_META_KEY = /^(text|quote|body|narrative|summary|transcript|translation|message|note|phone|address|fullname|email)$/i;
const MAX_META_STRING = 200;

export class UnsafeAuditMetadataError extends Error {
  constructor(key: string) {
    super(`Audit metadata key "${key}" is not allowed: audit logs must not contain victim content`);
    this.name = "UnsafeAuditMetadataError";
  }
}

export function assertSafeMetadata(meta: Record<string, MetaValue> | undefined, path = "metadata"): void {
  if (!meta) return;
  for (const [key, value] of Object.entries(meta)) {
    const where = `${path}.${key}`;
    if (FORBIDDEN_META_KEY.test(key)) throw new UnsafeAuditMetadataError(where);
    if (typeof value === "string" && value.length > MAX_META_STRING) throw new UnsafeAuditMetadataError(where);
    if (value && typeof value === "object" && !Array.isArray(value)) assertSafeMetadata(value, where);
  }
}

/** Deterministic JSON: object keys sorted, undefined dropped, Dates as ISO, ObjectIds as hex. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => normalise(v) ?? null);
  const maybeId = value as { toHexString?: () => string };
  if (typeof maybeId.toHexString === "function") return maybeId.toHexString();
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = normalise((value as Record<string, unknown>)[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** The fields that are hashed (exactly the entry, nothing derived). */
export function hashedFields(e: AuditEntryInput) {
  return {
    actorType: e.actorType,
    actorId: e.actorId ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    metadata: e.metadata ?? null,
    ipHash: e.ipHash ?? null,
  };
}

export function hashEntry(prevHash: string, entry: AuditEntryInput): string {
  return createHash("sha256").update(prevHash + canonicalJson(hashedFields(entry))).digest("hex");
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  firstBrokenId?: string;
}

/**
 * Walks the chain from GENESIS by prevHash links (not by insertion order),
 * recomputing every hash. Any edited, deleted or orphaned entry breaks it.
 */
export function verifyEntries(entries: readonly ChainedEntry[]): VerifyResult {
  const byPrev = new Map<string, ChainedEntry>();
  for (const e of entries) {
    if (byPrev.has(e.prevHash)) return { ok: false, checked: 0, firstBrokenId: e.id }; // fork
    byPrev.set(e.prevHash, e);
  }

  const visited = new Set<string>();
  let prev = GENESIS;
  let current = byPrev.get(prev);
  while (current) {
    if (hashEntry(prev, current) !== current.hash) {
      return { ok: false, checked: visited.size, firstBrokenId: current.id };
    }
    visited.add(current.id);
    prev = current.hash;
    current = byPrev.get(prev);
  }

  const orphan = entries.find((e) => !visited.has(e.id));
  if (orphan) return { ok: false, checked: visited.size, firstBrokenId: orphan.id };
  return { ok: true, checked: visited.size };
}
