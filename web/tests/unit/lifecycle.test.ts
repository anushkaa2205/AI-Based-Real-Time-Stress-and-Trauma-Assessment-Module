/** Case lifecycle rules (task H.1, FR-CASE-05; docs/hasini_portals.md §3.2). */
import { describe, expect, it } from "vitest";
import { autoStatus, type CaseFacts } from "@/core/cases/lifecycle";
import { CASE_STATUSES, type CaseStatus } from "@/models/enums";

const facts = (over: Partial<CaseFacts> = {}): CaseFacts => ({
  current: "NEW",
  seenByStaff: false,
  supportArranged: false,
  followUpScheduled: false,
  ...over,
});

const BOOLS = [false, true] as const;
const allFacts: CaseFacts[] = CASE_STATUSES.flatMap((current) =>
  BOOLS.flatMap((seenByStaff) =>
    BOOLS.flatMap((supportArranged) => BOOLS.map((followUpScheduled) => ({ current, seenByStaff, supportArranged, followUpScheduled }))),
  ),
);
const rank = (s: CaseStatus) => CASE_STATUSES.indexOf(s);

describe("autoStatus: the events in §3.2", () => {
  it("a new case nobody has touched stays Registered", () => {
    expect(autoStatus(facts())).toBe("NEW");
  });
  it("opening the case, taking the call or acknowledging its alert moves it to Being reviewed", () => {
    expect(autoStatus(facts({ seenByStaff: true }))).toBe("UNDER_REVIEW");
  });
  it("approved or auto-triggered support moves it to Support arranged", () => {
    expect(autoStatus(facts({ supportArranged: true }))).toBe("ACTION_TAKEN");
    expect(autoStatus(facts({ current: "UNDER_REVIEW", seenByStaff: true, supportArranged: true }))).toBe("ACTION_TAKEN");
  });
  it("support approved when a follow-up is already planned goes straight to Follow-up planned", () => {
    expect(autoStatus(facts({ current: "UNDER_REVIEW", supportArranged: true, followUpScheduled: true }))).toBe("FOLLOW_UP_SCHEDULED");
  });
  it("a follow-up scheduled after support moves it to Follow-up planned", () => {
    expect(autoStatus(facts({ current: "ACTION_TAKEN", supportArranged: true, followUpScheduled: true }))).toBe("FOLLOW_UP_SCHEDULED");
  });
  it("a follow-up without arranged support does not jump ahead", () => {
    expect(autoStatus(facts({ followUpScheduled: true }))).toBe("NEW");
    expect(autoStatus(facts({ seenByStaff: true, followUpScheduled: true }))).toBe("UNDER_REVIEW");
  });
  it("a follow-up done, missed or cancelled (no longer scheduled) changes nothing", () => {
    expect(autoStatus(facts({ current: "FOLLOW_UP_SCHEDULED", supportArranged: true, followUpScheduled: false }))).toBe("FOLLOW_UP_SCHEDULED");
  });
});

describe("autoStatus: forward only", () => {
  it("a stage staff chose by hand is not pulled back by weaker facts", () => {
    expect(autoStatus(facts({ current: "ACTION_TAKEN" }))).toBe("ACTION_TAKEN");
    expect(autoStatus(facts({ current: "FOLLOW_UP_SCHEDULED", seenByStaff: true }))).toBe("FOLLOW_UP_SCHEDULED");
  });
  it("a manual stage is moved further by a later real event", () => {
    expect(autoStatus(facts({ current: "UNDER_REVIEW", supportArranged: true }))).toBe("ACTION_TAKEN");
  });
  it("never returns an earlier stage than the current one, for every combination of facts", () => {
    for (const f of allFacts) expect(rank(autoStatus(f))).toBeGreaterThanOrEqual(rank(f.current));
  });
});

describe("autoStatus: closing", () => {
  it("a closed case stays closed whatever the facts (never reopened automatically)", () => {
    for (const f of allFacts.filter((x) => x.current === "CLOSED")) expect(autoStatus(f)).toBe("CLOSED");
  });
  it("never closes an open case (only staff close a case)", () => {
    for (const f of allFacts.filter((x) => x.current !== "CLOSED")) expect(autoStatus(f)).not.toBe("CLOSED");
  });
  it("always returns one of the five stages", () => {
    for (const f of allFacts) expect(CASE_STATUSES).toContain(autoStatus(f));
  });
});
