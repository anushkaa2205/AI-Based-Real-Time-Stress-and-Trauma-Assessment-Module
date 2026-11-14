import { describe, expect, it } from "vitest";
import { contextSignals } from "@/core/scoring/context";
import { assess } from "@/core/scoring/assess";
import { DEFAULT_CONFIG } from "@/core/scoring/defaultConfig";
import { ITEMS } from "@/core/screeners/items";
import { scoreAll, scoreInstrument, screenerSignals, type ScreenerResponseInput } from "@/core/screeners/score";

type Inst = ScreenerResponseInput["instrument"];
const answers = (instrument: Inst, values: (number | null)[], prefix = instrument as string): ScreenerResponseInput[] =>
  values.map((value, i) => ({ instrument, itemCode: `${prefix}_${i + 1}`, value, skipped: value === null }));

describe("screener scores match manual calculation: 10 answer sets (AC-SCR-02)", () => {
  // [instrument, answers, total, maxTotal, positive, answered]
  const sets: [Inst, (number | null)[], number, number, boolean, number][] = [
    ["PHQ2", [0, 0], 0, 6, false, 2],
    ["PHQ2", [1, 1], 2, 6, false, 2],
    ["PHQ2", [2, 1], 3, 6, true, 2],
    ["PHQ2", [3, 3], 6, 6, true, 2],
    ["GAD2", [1, 2], 3, 6, true, 2],
    ["GAD2", [0, 2], 2, 6, false, 2],
    ["GAD2", [3, null], 3, 6, true, 1],
    ["PCPTSD5", [1, 1, 1, 0, 0], 3, 5, true, 5],
    ["PCPTSD5", [1, 0, 0, 0, 1], 2, 5, false, 5],
    ["PCPTSD5", [1, 1, 1, 1, 1], 5, 5, true, 5],
  ];

  it.each(sets)("%s %j → total %i/%i", (instrument, values, total, maxTotal, isPositive, itemsAnswered) => {
    expect(scoreInstrument(instrument, answers(instrument, values))).toEqual({
      instrument,
      total,
      maxTotal,
      isPositive,
      itemsAnswered,
    });
  });

  it("returns null when every item was skipped", () => {
    expect(scoreInstrument("PHQ2", answers("PHQ2", [null, null]))).toBeNull();
  });

  it("uses the latest answer and ignores out-of-range or unknown items", () => {
    const r = scoreInstrument("PHQ2", [
      { instrument: "PHQ2", itemCode: "PHQ2_1", value: 3 },
      { instrument: "PHQ2", itemCode: "PHQ2_1", value: 1 },
      { instrument: "PHQ2", itemCode: "PHQ2_2", value: 7 },
      { instrument: "PHQ2", itemCode: "GAD2_1", value: 3 },
    ]);
    expect(r).toMatchObject({ total: 1, itemsAnswered: 1 });
  });

  it("scoreAll returns only answered instruments", () => {
    expect(scoreAll([...answers("PHQ2", [1, 2]), ...answers("GAD2", [null, null])]).map((s) => s.instrument)).toEqual(["PHQ2"]);
  });

  it("every item has an i18n prompt key and a unique code", () => {
    const codes = ITEMS.map((i) => i.itemCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const i of ITEMS) expect(i.promptKey).toBe(`flow.screener.${i.itemCode}`);
  });
});

describe("screener → dimensions", () => {
  it("maps PHQ-2, GAD-2 and PC-PTSD-5 to depression, fear/anxiety and trauma", () => {
    const { indicators } = screenerSignals([...answers("PHQ2", [3, 3]), ...answers("GAD2", [0, 3]), ...answers("PCPTSD5", [1, 1, 0, 0, 0])]);
    const by = Object.fromEntries(indicators.map((i) => [i.dimension, i]));
    expect(by.DEPRESSION?.score).toBe(1);
    expect(by.FEAR_ANXIETY?.score).toBe(0.5);
    expect(by.SEVERE_TRAUMA?.score).toBe(0.4);
    expect(by.DEPRESSION?.source).toBe("SCREENER");
  });

  it("lowers confidence when items are skipped", () => {
    const [full] = screenerSignals(answers("PHQ2", [2, 2])).indicators;
    const [half] = screenerSignals(answers("PHQ2", [2, null])).indicators;
    expect(half!.confidence).toBeLessThan(full!.confidence);
  });

  it("safety check: accused nearby → OV-2; suicidal thoughts → OV-6; with intent → OV-1", () => {
    const accused = screenerSignals([{ instrument: "SAFETY_CHECK", itemCode: "SAFETY_ACCUSED_NEARBY", value: 1 }]);
    expect(accused.indicators[0]).toMatchObject({ dimension: "INTIMIDATION", flags: ["ACCUSED_PRESENT"] });

    const thoughts = screenerSignals([{ instrument: "SAFETY_CHECK", itemCode: "SAFETY_SUICIDAL_THOUGHTS", value: 1 }]);
    expect(thoughts.indicators[0]).toMatchObject({ dimension: "SUICIDAL_IDEATION", score: 0.6, flags: ["PASSIVE_SUICIDAL_IDEATION"] });

    const intent = screenerSignals([
      { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SUICIDAL_THOUGHTS", value: 1 },
      { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SUICIDAL_INTENT", value: 1 },
    ]);
    expect(intent.indicators).toHaveLength(1);
    expect(intent.indicators[0]).toMatchObject({ score: 1, flags: ["SUICIDAL_INTENT"] });
  });

  it("a 'yes' to suicidal thoughts with intent makes the band Critical (AC-SCR-03)", () => {
    const { indicators } = screenerSignals([
      { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SUICIDAL_THOUGHTS", value: 1 },
      { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SUICIDAL_INTENT", value: 1 },
    ]);
    const d = assess({ indicators, config: DEFAULT_CONFIG });
    expect(d.band).toBe("CRITICAL");
    expect(d.overridesFired).toContain("OV-1");
  });

  it("not feeling safe gives a fact and a fear signal", () => {
    const r = screenerSignals([{ instrument: "SAFETY_CHECK", itemCode: "SAFETY_SAFE_NOW", value: 0 }]);
    expect(r.facts).toEqual(["NOT_SAFE_NOW"]);
    expect(r.indicators[0]?.dimension).toBe("FEAR_ANXIETY");
  });

  it("'no' to safety and suicide questions never produces a zero that could dilute other evidence (NFR-ETH-05)", () => {
    const r = screenerSignals([
      { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SAFE_NOW", value: 1 },
      { instrument: "SAFETY_CHECK", itemCode: "SAFETY_ACCUSED_NEARBY", value: 0 },
      { instrument: "SAFETY_CHECK", itemCode: "SAFETY_SUICIDAL_THOUGHTS", value: 0 },
      ...answers("CSSRS_SCREEN", [0, 0, 0, 0, 0, 0], "CSSRS"),
    ]);
    expect(r.indicators).toEqual([]);
    expect(r.facts).toEqual([]);
  });

  it.each([
    [[1, 0, 0, 0, 0, 0], 0.5, "PASSIVE_SUICIDAL_IDEATION"],
    [[1, 1, 0, 0, 0, 0], 0.6, "PASSIVE_SUICIDAL_IDEATION"],
    [[1, 1, 1, 0, 0, 0], 0.75, "PASSIVE_SUICIDAL_IDEATION"],
    [[1, 1, 1, 1, 0, 0], 1, "SUICIDAL_INTENT"],
    [[1, 1, 0, 0, 1, 0], 1, "SUICIDAL_INTENT"],
    [[0, 0, 0, 0, 0, 1], 1, "SUICIDAL_INTENT"],
  ])("C-SSRS %j → %f, %s", (values, score, flag) => {
    const r = screenerSignals(answers("CSSRS_SCREEN", values, "CSSRS"));
    expect(r.indicators).toHaveLength(1);
    expect(r.indicators[0]).toMatchObject({ dimension: "SUICIDAL_IDEATION", score, flags: [flag] });
  });
});

describe("case context → indicators (task 2.3, FR-IND-02)", () => {
  it("returns nothing for no context", () => {
    expect(contextSignals(null)).toEqual({ indicators: [], facts: [] });
    expect(contextSignals({})).toEqual({ indicators: [], facts: [] });
  });

  it("maps vulnerability factors to EXTREME_VULNERABILITY", () => {
    const { indicators } = contextSignals({ ageGroup: "60_PLUS", hasDisability: true, familyMemberKilled: true, economicDependence: true, repeatVictimisation: true });
    expect(indicators.every((i) => i.dimension === "EXTREME_VULNERABILITY" && i.source === "CONTEXT")).toBe(true);
    expect(Math.max(...indicators.map((i) => i.score))).toBe(0.9);
  });

  it("sexual offence against a minor → OV-5 flag and SEXUAL_OFFENCE fact", () => {
    const r = contextSignals({ isSexualOffence: true, ageGroup: "UNDER_18" });
    expect(r.facts).toContain("SEXUAL_OFFENCE");
    expect(r.indicators.flatMap((i) => i.flags ?? [])).toContain("SEXUAL_OFFENCE_MINOR");
    const adult = contextSignals({ isSexualOffence: true, ageGroup: "18_59" });
    expect(adult.indicators.flatMap((i) => i.flags ?? [])).not.toContain("SEXUAL_OFFENCE_MINOR");
  });

  it("threats, accused nearby and pressure map to INTIMIDATION with override flags", () => {
    const r = contextSignals({ accusedNearby: true, ongoingThreats: true, pressureToWithdraw: true });
    const flags = r.indicators.flatMap((i) => i.flags ?? []);
    expect(r.indicators.every((i) => i.dimension === "INTIMIDATION")).toBe(true);
    expect(flags).toEqual(expect.arrayContaining(["ACCUSED_PRESENT", "PRESSURE_TO_WITHDRAW"]));
  });

  it("no support person and displacement map to SOCIAL_ISOLATION; displacement flags OV-8", () => {
    const r = contextSignals({ supportPersonPresent: false, displaced: true });
    expect(r.indicators.some((i) => i.dimension === "SOCIAL_ISOLATION")).toBe(true);
    expect(r.indicators.flatMap((i) => i.flags ?? [])).toContain("DISPLACED");
  });

  it("never uses gender as a risk feature (C-ETH-03)", () => {
    expect(contextSignals({ gender: "F" })).toEqual(contextSignals({ gender: "M" }));
    expect(contextSignals({ gender: "F" }).indicators).toEqual([]);
  });
});
