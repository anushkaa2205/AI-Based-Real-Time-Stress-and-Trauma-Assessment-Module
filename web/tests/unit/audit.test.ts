import { describe, expect, it } from "vitest";
import {
  GENESIS,
  UnsafeAuditMetadataError,
  canonicalJson,
  hashEntry,
  verifyEntries,
  type AuditEntryInput,
  type ChainedEntry,
} from "@/core/audit/chain";
import { recordWith, type AuditStore } from "@/core/audit/record";

/** In-memory store that enforces the unique prevHash index like MongoDB does. */
class MemoryStore implements AuditStore {
  entries: ChainedEntry[] = [];
  private seq = 0;
  /** Simulates another writer appending between our head read and insert. */
  raceOnce = 0;

  async headHash() {
    return this.entries.at(-1)?.hash ?? null;
  }

  async insert(doc: AuditEntryInput & { prevHash: string; hash: string }) {
    if (this.raceOnce > 0) {
      this.raceOnce--;
      const rival: AuditEntryInput = { actorType: "SYSTEM", action: "rival.write", entityType: "test", entityId: "r" };
      const prev = (await this.headHash()) ?? GENESIS;
      this.push({ ...rival, prevHash: prev, hash: hashEntry(prev, rival) });
    }
    if (this.entries.some((e) => e.prevHash === doc.prevHash)) {
      throw Object.assign(new Error("E11000 duplicate key prevHash"), { code: 11000, keyPattern: { prevHash: 1 } });
    }
    this.push(doc);
  }

  private push(doc: AuditEntryInput & { prevHash: string; hash: string }) {
    this.entries.push({ ...doc, id: String(++this.seq) });
  }
}

const entry = (n: number): AuditEntryInput => ({
  actorType: "USER",
  actorId: `user-${n}`,
  action: "case.view",
  entityType: "case",
  entityId: `case-${n}`,
  metadata: { configVersion: 1, count: n },
});

async function chainOf(n: number) {
  const store = new MemoryStore();
  for (let i = 0; i < n; i++) await recordWith(store, entry(i));
  return store;
}

describe("audit hash chain (task 1.5)", () => {
  it("verifies an untouched chain", async () => {
    const store = await chainOf(5);
    expect(store.entries[0]!.prevHash).toBe(GENESIS);
    expect(verifyEntries(store.entries)).toEqual({ ok: true, checked: 5 });
  });

  it("verifies an empty log", () => {
    expect(verifyEntries([])).toEqual({ ok: true, checked: 0 });
  });

  it("detects an edited entry", async () => {
    const store = await chainOf(5);
    store.entries[2] = { ...store.entries[2]!, action: "case.export" };
    expect(verifyEntries(store.entries)).toMatchObject({ ok: false, firstBrokenId: "3", checked: 2 });
  });

  it("detects edited metadata", async () => {
    const store = await chainOf(3);
    store.entries[1] = { ...store.entries[1]!, metadata: { configVersion: 2, count: 1 } };
    expect(verifyEntries(store.entries)).toMatchObject({ ok: false, firstBrokenId: "2" });
  });

  it("detects a re-hashed entry (the next link breaks)", async () => {
    const store = await chainOf(4);
    const edited = { ...store.entries[1]!, actorId: "someone-else" };
    edited.hash = hashEntry(edited.prevHash, edited);
    store.entries[1] = edited;
    const result = verifyEntries(store.entries);
    expect(result.ok).toBe(false);
    expect(result.firstBrokenId).toBe("3");
  });

  it("detects a deleted entry", async () => {
    const store = await chainOf(4);
    store.entries.splice(1, 1);
    expect(verifyEntries(store.entries).ok).toBe(false);
  });

  it("detects a fork", async () => {
    const store = await chainOf(2);
    const fork = { ...entry(9), prevHash: store.entries[0]!.prevHash, hash: "x", id: "fork" };
    expect(verifyEntries([...store.entries, fork])).toMatchObject({ ok: false, firstBrokenId: "fork" });
  });

  it("does not depend on insertion order", async () => {
    const store = await chainOf(4);
    expect(verifyEntries([...store.entries].reverse()).ok).toBe(true);
  });

  it("retries when another writer wins the race, and the chain stays valid", async () => {
    const store = await chainOf(2);
    store.raceOnce = 1;
    await recordWith(store, entry(7));
    expect(store.entries.map((e) => e.action)).toEqual(["case.view", "case.view", "rival.write", "case.view"]);
    expect(verifyEntries(store.entries).ok).toBe(true);
  });

  it("gives up after the maximum attempts", async () => {
    const store = await chainOf(1);
    store.raceOnce = 10;
    await expect(recordWith(store, entry(8), 3)).rejects.toThrow(/duplicate key|retries/);
    expect(verifyEntries(store.entries).ok).toBe(true);
  });

  it("rejects metadata that could hold victim text", async () => {
    const store = new MemoryStore();
    await expect(recordWith(store, { ...entry(1), metadata: { text: "anything" } })).rejects.toThrow(UnsafeAuditMetadataError);
    await expect(recordWith(store, { ...entry(1), metadata: { nested: { quote: "x" } } })).rejects.toThrow(
      UnsafeAuditMetadataError,
    );
    await expect(recordWith(store, { ...entry(1), metadata: { reasonCode: "x".repeat(201) } })).rejects.toThrow(
      UnsafeAuditMetadataError,
    );
    expect(store.entries).toHaveLength(0);
  });

  it("canonical JSON ignores key order and undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [1, 2] } })).toBe(canonicalJson({ a: { c: [1, 2] }, b: 1 }));
    expect(canonicalJson({ at: new Date("2026-11-14T00:00:00Z") })).toBe('{"at":"2026-11-14T00:00:00.000Z"}');
  });
});
