/** Analytics arithmetic and small-count suppression (task 8.2, FR-DSH-06, NFR-PRI-05, AC-DSH-02). */
import { describe, expect, it } from "vitest";
import { capacity, heatmap, median, periodOf, summarise, suppressCount, trends, weightedMedian, type StatRow } from "@/core/analytics/aggregate";

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const row = (p: Partial<StatRow>): StatRow => ({ day: day("2026-11-10"), interactions: 0, criticalAlerts: 0, ...p });

describe("suppression (AC-DSH-02)", () => {
  it("hides counts from 1 to 4, shows 0 and 5+", () => {
    expect(suppressCount(0)).toEqual({ value: 0, suppressed: false });
    for (const n of [1, 2, 3, 4]) expect(suppressCount(n)).toEqual({ value: null, suppressed: true });
    expect(suppressCount(5)).toEqual({ value: 5, suppressed: false });
  });
  it("suppresses every small cell in a summary, including medians over few values", () => {
    const s = summarise([
      row({ band: "LOW", interactions: 12 }),
      row({ band: "CRITICAL", interactions: 2, criticalAlerts: 2, medianAckSec: 40, ackCount: 2 }),
    ]);
    // Critical alone would be hidden, and 14 − 12 would reveal it: Low is hidden as well.
    expect(s.interactions).toEqual({ value: 14, suppressed: false });
    expect(s.byBand.LOW).toEqual({ value: null, suppressed: true });
    expect(s.byBand.CRITICAL).toEqual({ value: null, suppressed: true });
    expect(s.byBand.HIGH).toEqual({ value: 0, suppressed: false });
    expect(s.criticalAlerts.suppressed).toBe(true);
    expect(s.medianAckSec).toEqual({ value: null, suppressed: true });
  });
  it("a single hidden band cannot be recovered by subtraction (secondary suppression)", () => {
    const s = summarise([row({ band: "LOW", interactions: 20 }), row({ band: "HIGH", interactions: 9 }), row({ band: "CRITICAL", interactions: 3 })]);
    expect(s.byBand.CRITICAL.suppressed).toBe(true);
    expect(s.byBand.HIGH.suppressed).toBe(true); // smallest other non-zero band hidden as well
    expect(s.byBand.LOW.value).toBe(20);
    expect(s.interactions.value).toBe(32); // 32 − 20 = 12 = HIGH + CRITICAL together, not either one
  });
  it("hides the total when no other band could cover the hidden one", () => {
    const s = summarise([row({ band: "CRITICAL", interactions: 3 }), row({ band: null, interactions: 10 })]);
    expect(s.byBand.CRITICAL.suppressed).toBe(true);
    expect(s.interactions.suppressed).toBe(true);
  });
  it("summaries contain no identifiers, only numbers", () => {
    const s = summarise([row({ band: "HIGH", interactions: 9, districtId: "d1", language: "hi" })]);
    expect(JSON.stringify(s)).not.toMatch(/d1|docket|name|phone/i);
  });
});

describe("medians", () => {
  it("exact median", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(3); // (2+3)/2 rounded
  });
  it("weighted median across groups follows the larger group", () => {
    expect(weightedMedian([{ median: 30, n: 10 }, { median: 300, n: 2 }])).toBe(30);
    expect(weightedMedian([{ median: 30, n: 2 }, { median: 300, n: 10 }])).toBe(300);
    expect(weightedMedian([{ median: null, n: 3 }])).toBeNull();
  });
});

describe("heat map, trends, capacity", () => {
  const rows = [
    row({ districtId: "d1", band: "CRITICAL", interactions: 3 }),
    row({ districtId: "d1", band: "LOW", interactions: 7 }),
    row({ districtId: "d2", band: "HIGH", interactions: 2 }),
  ];
  it("heat map per 1000, small districts suppressed", () => {
    const h = heatmap(rows, new Map([["d1", "Pune"]]));
    expect(h.find((x) => x.districtId === "d1")).toEqual({ districtId: "d1", districtName: "Pune", criticalPer1000: 300, highPer1000: 0, count: 10, suppressed: false });
    expect(h.find((x) => x.districtId === "d2")).toMatchObject({ count: null, criticalPer1000: null, suppressed: true });
  });
  it("trends group by ISO week (Monday)", () => {
    expect(periodOf(day("2026-11-15"), "week")).toBe("2026-11-09"); // a Sunday → its Monday
    expect(periodOf(day("2026-11-15"), "day")).toBe("2026-11-15");
    const t = trends([row({ band: "LOW", interactions: 6, topDimensions: { FEAR_ANXIETY: 4, DEPRESSION: 2 } })], "week");
    expect(t).toHaveLength(1);
    expect(t[0]!.topDimensions).toEqual([
      { dimension: "FEAR_ANXIETY", share: 0.67 },
      { dimension: "DEPRESSION", share: 0.33 },
    ]);
  });
  it("capacity sums demand and completion by district and type, suppressing small cells", () => {
    const c = capacity([
      row({ districtId: "d1", referralsCreated: { LEGAL_AID: 6 }, referralsDone: { LEGAL_AID: 5 } }),
      row({ districtId: "d1", referralsCreated: { MEDICAL_ASSISTANCE: 2 } }),
    ]);
    expect(c).toContainEqual({ districtId: "d1", supportType: "LEGAL_AID", demand: 6, completed: 5, suppressed: false });
    expect(c).toContainEqual({ districtId: "d1", supportType: "MEDICAL_ASSISTANCE", demand: null, completed: 0, suppressed: true });
  });
});
