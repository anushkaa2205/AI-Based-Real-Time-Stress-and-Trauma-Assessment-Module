/** Grouping on the staff portals (task H.7; docs/hasini_portals.md §4.3, §4.5, §4.6). */
import { describe, expect, it } from "vitest";
import { groupByUrgency, isProposalOverdue } from "@/components/staff/approval-inbox";
import { COLLAPSED_STATUSES, byDue, groupByStatus } from "@/components/staff/referral-queue";

const rec = (id: string, urgency: string) => ({ id, urgency });

describe("groupByUrgency (approvals, §4.3)", () => {
  it("orders groups most urgent first", () => {
    const groups = groupByUrgency([rec("a", "WITHIN_72_H"), rec("b", "IMMEDIATE"), rec("c", "WITHIN_24_H"), rec("d", "WITHIN_15_MIN"), rec("e", "NONE")]);
    expect(groups.map((g) => g.urgency)).toEqual(["IMMEDIATE", "WITHIN_15_MIN", "WITHIN_24_H", "WITHIN_72_H", "NONE"]);
  });
  it("leaves out empty groups", () => {
    expect(groupByUrgency([rec("a", "WITHIN_24_H"), rec("b", "WITHIN_24_H")]).map((g) => g.urgency)).toEqual(["WITHIN_24_H"]);
    expect(groupByUrgency([])).toEqual([]);
  });
  it("keeps every proposal exactly once and the order inside a group", () => {
    const items = [rec("a", "WITHIN_24_H"), rec("b", "IMMEDIATE"), rec("c", "WITHIN_24_H"), rec("d", "IMMEDIATE")];
    const groups = groupByUrgency(items);
    expect(groups.flatMap((g) => g.items.map((i) => i.id)).sort()).toEqual(["a", "b", "c", "d"]);
    expect(groups.find((g) => g.urgency === "WITHIN_24_H")?.items.map((i) => i.id)).toEqual(["a", "c"]);
  });
  it("an unknown urgency goes last, in its own group", () => {
    expect(groupByUrgency([rec("a", "SOMEDAY"), rec("b", "NONE")]).map((g) => g.urgency)).toEqual(["NONE", "SOMEDAY"]);
  });
});

describe("groupByStatus (police and welfare, §4.5–4.6)", () => {
  const ref = (id: string, status: string) => ({ id, status });

  it("orders groups pending → accepted → in progress → done → declined", () => {
    const groups = groupByStatus([ref("a", "DONE"), ref("b", "DECLINED"), ref("c", "IN_PROGRESS"), ref("d", "PENDING"), ref("e", "ACCEPTED")]);
    expect(groups.map((g) => g.status)).toEqual(["PENDING", "ACCEPTED", "IN_PROGRESS", "DONE", "DECLINED"]);
  });
  it("leaves out empty groups", () => {
    expect(groupByStatus([ref("a", "PENDING"), ref("b", "PENDING")]).map((g) => g.status)).toEqual(["PENDING"]);
    expect(groupByStatus([])).toEqual([]);
  });
  it("shows every card exactly once and keeps the order inside a group", () => {
    const items = [ref("a", "PENDING"), ref("b", "DONE"), ref("c", "PENDING"), ref("d", "IN_PROGRESS")];
    const groups = groupByStatus(items);
    expect(groups.flatMap((g) => g.items.map((i) => i.id)).sort()).toEqual(["a", "b", "c", "d"]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("byDue and COLLAPSED_STATUSES (police and welfare, H.7)", () => {
  const ref = (id: string, dueAt?: string) => ({ id, dueAt });

  it("puts the earliest due (most overdue) first and cards with no due time last", () => {
    const sorted = byDue([ref("late", "2026-11-20T10:00:00Z"), ref("none"), ref("early", "2026-11-14T10:00:00Z"), ref("mid", "2026-11-16T10:00:00Z")]);
    expect(sorted.map((r) => r.id)).toEqual(["early", "mid", "late", "none"]);
  });
  it("keeps the original order for equal or missing due times, and does not change its input", () => {
    const input = [ref("a"), ref("b", "bad date"), ref("c")];
    expect(byDue(input).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(input.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("only finished groups start closed", () => {
    expect([...COLLAPSED_STATUSES].sort()).toEqual(["DECLINED", "DONE"]);
  });
});

describe("isProposalOverdue (approvals, H.7)", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  it("is overdue once the due time has passed", () => {
    expect(isProposalOverdue("2026-11-20T11:59:59Z", now)).toBe(true);
  });
  it("is not overdue before or at the due time", () => {
    expect(isProposalOverdue("2026-11-20T12:00:00Z", now)).toBe(false);
    expect(isProposalOverdue("2026-11-21T09:00:00Z", now)).toBe(false);
  });
  it("no due time or an unreadable one is never overdue", () => {
    expect(isProposalOverdue(undefined, now)).toBe(false);
    expect(isProposalOverdue("not a date", now)).toBe(false);
  });
});
