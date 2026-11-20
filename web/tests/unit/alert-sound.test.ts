/** When the staff alert banner beeps (task H.6, FR-ALR-01/03/04; docs/hasini_portals.md §4.9). */
import { describe, expect, it } from "vitest";
import { HEARD_KEY, HEARD_MAX, decideBeep, readHeard, writeHeard, type HeardMap, type SoundAlert } from "@/components/staff/alert-sound";

const critical = (id: string, escalationLevel = 0): SoundAlert => ({ id, level: "CRITICAL", escalationLevel });
const high = (id: string, escalationLevel = 0): SoundAlert => ({ id, level: "HIGH", escalationLevel });

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe("decideBeep", () => {
  it("a new Critical alert beeps once and is remembered", () => {
    const first = decideBeep([critical("a")], {});
    expect(first).toEqual({ beep: true, heard: { a: 0 } });
    expect(decideBeep([critical("a")], first.heard).beep).toBe(false);
  });
  it("a reload with the same open alerts does not beep (memory survives through storage)", () => {
    const storage = memoryStorage();
    writeHeard(storage, decideBeep([critical("a"), critical("b")], readHeard(storage)).heard);
    expect(decideBeep([critical("a"), critical("b")], readHeard(storage)).beep).toBe(false);
  });
  it("five new Critical alerts in one check give one beep", () => {
    const r = decideBeep(["a", "b", "c", "d", "e"].map((id) => critical(id)), {});
    expect(r.beep).toBe(true);
    expect(Object.keys(r.heard)).toHaveLength(5);
  });
  it("an escalation beeps again, once", () => {
    const after = decideBeep([critical("a", 1)], { a: 0 });
    expect(after).toEqual({ beep: true, heard: { a: 1 } });
    expect(decideBeep([critical("a", 1)], after.heard).beep).toBe(false);
    expect(decideBeep([critical("a", 2)], after.heard).beep).toBe(true);
  });
  it("an alert first seen already escalated beeps once, not again at that level", () => {
    const r = decideBeep([critical("a", 2)], {});
    expect(r).toEqual({ beep: true, heard: { a: 2 } });
  });
  it("High alerts never beep and are not remembered", () => {
    expect(decideBeep([high("h"), high("i", 1)], {})).toEqual({ beep: false, heard: {} });
  });
  it("a known Critical with a new High alongside does not beep", () => {
    expect(decideBeep([critical("a"), high("h")], { a: 0 }).beep).toBe(false);
  });
  it("still remembers an alert that dropped off the list (the list holds only the newest 50)", () => {
    expect(decideBeep([critical("b")], { a: 0, b: 0 }).heard).toEqual({ a: 0, b: 0 });
  });
  it("an alert that drops off the list and comes back does not beep again", () => {
    const off = decideBeep([critical("b")], { a: 0, b: 0 });
    expect(decideBeep([critical("a"), critical("b")], off.heard).beep).toBe(false);
  });
  it("no alerts: no beep, memory kept", () => {
    expect(decideBeep([], { a: 1 })).toEqual({ beep: false, heard: { a: 1 } });
  });
});

describe("decideBeep: memory limit", () => {
  const many = (n: number, prefix = "old"): HeardMap => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, 0]));

  it("never keeps more than HEARD_MAX alerts", () => {
    const r = decideBeep([critical("new")], many(HEARD_MAX));
    expect(Object.keys(r.heard)).toHaveLength(HEARD_MAX);
  });
  it("drops the alerts not seen for longest first", () => {
    const r = decideBeep([critical("new")], many(HEARD_MAX));
    expect(r.heard).not.toHaveProperty("old0");
    expect(r.heard).toHaveProperty("old1");
    expect(r.heard).toHaveProperty("new", 0);
  });
  it("alerts in this check are always kept, even the oldest remembered one", () => {
    const r = decideBeep([critical("old0"), critical("new")], many(HEARD_MAX));
    expect(r.beep).toBe(true);
    expect(r.heard).toHaveProperty("old0", 0);
    expect(r.heard).toHaveProperty("new", 0);
    expect(r.heard).not.toHaveProperty("old1");
    expect(Object.keys(r.heard)).toHaveLength(HEARD_MAX);
  });
  it("seeing a remembered alert again moves it to the newest end", () => {
    const r = decideBeep([critical("a")], { a: 0, b: 0 });
    expect(Object.keys(r.heard)).toEqual(["b", "a"]);
  });
});

describe("readHeard / writeHeard", () => {
  it("round-trips through storage under one key", () => {
    const storage = memoryStorage();
    writeHeard(storage, { a: 0, b: 2 });
    expect([...storage.data.keys()]).toEqual([HEARD_KEY]);
    expect(readHeard(storage)).toEqual({ a: 0, b: 2 });
  });
  it("missing, malformed or wrong-shaped data reads as empty", () => {
    expect(readHeard(memoryStorage())).toEqual({});
    expect(readHeard(memoryStorage({ [HEARD_KEY]: "not json" }))).toEqual({});
    expect(readHeard(memoryStorage({ [HEARD_KEY]: "[1,2]" }))).toEqual({});
    expect(readHeard(memoryStorage({ [HEARD_KEY]: "null" }))).toEqual({});
    expect(readHeard(memoryStorage({ [HEARD_KEY]: JSON.stringify({ a: "x", b: 1, c: null }) }))).toEqual({ b: 1 });
  });
  it("blocked storage (throws) or no storage never throws", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readHeard(blocked)).toEqual({});
    expect(() => writeHeard(blocked, { a: 0 })).not.toThrow();
    expect(readHeard(null)).toEqual({});
    expect(() => writeHeard(null, { a: 0 })).not.toThrow();
  });
});
