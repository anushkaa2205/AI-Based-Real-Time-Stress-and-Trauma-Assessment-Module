/** Grouping on the staff portals (task H.7; docs/hasini_portals.md §4.3, §4.5, §4.6). */
import { describe, expect, it } from "vitest";
import { groupByUrgency } from "@/components/staff/approval-inbox";

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
