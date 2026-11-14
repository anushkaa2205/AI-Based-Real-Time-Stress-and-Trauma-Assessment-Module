/**
 * Audit log writer and verifier (task 1.5, FR-AUD-01…03, DATABASE.md §9).
 *
 * `prevHash` has a unique index, so two writers can never attach to the same
 * entry: the chain cannot fork. Outside a transaction the loser re-reads the
 * head and retries. Inside a transaction the duplicate surfaces as a write
 * conflict and `session.withTransaction` retries the whole transaction.
 */
import type { ClientSession } from "mongoose";
import { AuditLog } from "@/models/audit-log";
import {
  GENESIS,
  assertSafeMetadata,
  hashEntry,
  verifyEntries,
  type AuditEntryInput,
  type ChainedEntry,
  type VerifyResult,
} from "./chain";

export interface AuditStore {
  /** Hash of the current last entry, or null if the log is empty. */
  headHash(): Promise<string | null>;
  insert(doc: AuditEntryInput & { prevHash: string; hash: string }): Promise<void>;
}

export function isDuplicatePrevHash(err: unknown): boolean {
  const e = err as { code?: number; keyPattern?: Record<string, unknown>; message?: string };
  return e?.code === 11000 && (e.keyPattern ? "prevHash" in e.keyPattern : /prevHash/.test(e.message ?? ""));
}

/** Appends one entry; returns its hash. */
export async function recordWith(store: AuditStore, entry: AuditEntryInput, maxAttempts = 5): Promise<string> {
  assertSafeMetadata(entry.metadata);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const prevHash = (await store.headHash()) ?? GENESIS;
    const hash = hashEntry(prevHash, entry);
    try {
      await store.insert({ ...entry, prevHash, hash });
      return hash;
    } catch (err) {
      if (isDuplicatePrevHash(err) && attempt < maxAttempts - 1) continue; // another writer won
      throw err;
    }
  }
  throw new Error("maxAttempts must be at least 1");
}

/** MongoDB-backed store. The head is found by following links, not by _id order. */
export function mongoAuditStore(session?: ClientSession): AuditStore {
  return {
    async headHash() {
      // Concurrent writers on different machines can produce out-of-order _ids, so the newest
      // _id is not always the tip. Read the last few entries in ONE trip and pick the one that
      // no other entry points to; walk forward only in the rare case that is ambiguous.
      const recent = await AuditLog.find().sort({ _id: -1 }).limit(5).select("hash prevHash").session(session ?? null).lean();
      if (!recent.length) return null;
      const pointedTo = new Set(recent.map((r) => r.prevHash));
      const tips = recent.filter((r) => !pointedTo.has(r.hash));
      let hash = tips.length === 1 ? tips[0]!.hash : recent[0]!.hash;
      if (tips.length === 1 && recent.length < 5) return hash; // whole log seen
      for (;;) {
        const next = await AuditLog.findOne({ prevHash: hash }).select("hash").session(session ?? null).lean();
        if (!next) return hash;
        hash = next.hash;
      }
    },
    async insert(doc) {
      await AuditLog.create([doc], { session: session ?? null });
    },
  };
}

/**
 * Records an audit entry. Pass the pipeline's session so the entry commits
 * (or rolls back) with the change it describes.
 */
export async function record(entry: AuditEntryInput, session?: ClientSession): Promise<string> {
  if (!session) return recordWith(mongoAuditStore(), entry, 5);
  // In a transaction a duplicate aborts the transaction. Mark it transient so
  // session.withTransaction retries the whole transaction against the new head.
  try {
    return await recordWith(mongoAuditStore(session), entry, 1);
  } catch (err) {
    if (isDuplicatePrevHash(err)) (err as { addErrorLabel?: (l: string) => void }).addErrorLabel?.("TransientTransactionError");
    throw err;
  }
}

/** Loads the whole log and verifies it (GET /staff/admin/audit/verify). */
export async function verifyChain(): Promise<VerifyResult> {
  const docs = await AuditLog.find().sort({ _id: 1 }).lean();
  const entries: ChainedEntry[] = docs.map((d) => ({
    id: String(d._id),
    actorType: d.actorType,
    actorId: d.actorId ?? null,
    action: d.action,
    entityType: d.entityType,
    entityId: d.entityId,
    metadata: (d.metadata ?? undefined) as AuditEntryInput["metadata"],
    ipHash: d.ipHash ?? null,
    prevHash: d.prevHash,
    hash: d.hash,
  }));
  return verifyEntries(entries);
}
