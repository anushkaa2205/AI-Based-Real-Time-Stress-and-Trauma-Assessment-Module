/**
 * Screener item definitions (task 2.2, FR-SCR-01/02, REQUIREMENTS Appendix D).
 * Wording lives in messages/*.json under `promptKey` (CLAUDE.md rule 2); these
 * are screening aids, never diagnoses (Appendix D note, NFR-ETH-02).
 */

export type Instrument = "SAFETY_CHECK" | "PHQ2" | "GAD2" | "PCPTSD5" | "CSSRS_SCREEN";
export type Scale = "YES_NO" | "SCALE_0_3";

export interface ScreenerItem {
  instrument: Instrument;
  itemCode: string;
  scale: Scale;
  promptKey: string;
  /** Asked only after this item was answered "yes" (1) */
  askIf?: string;
}

const yesNo = (instrument: Instrument, itemCode: string, askIf?: string): ScreenerItem => ({
  instrument,
  itemCode,
  scale: "YES_NO",
  promptKey: `flow.screener.${itemCode}`,
  ...(askIf ? { askIf } : {}),
});
const scale = (instrument: Instrument, itemCode: string): ScreenerItem => ({
  instrument,
  itemCode,
  scale: "SCALE_0_3",
  promptKey: `flow.screener.${itemCode}`,
});

export const ITEMS: readonly ScreenerItem[] = [
  // FR-SCR-01 safety check: runs in every mode, even without analysis consent
  yesNo("SAFETY_CHECK", "SAFETY_SAFE_NOW"), // "Are you safe right now?" 1 = yes, safe
  yesNo("SAFETY_CHECK", "SAFETY_ACCUSED_NEARBY"), // "Is the person who harmed you nearby?"
  yesNo("SAFETY_CHECK", "SAFETY_SUICIDAL_THOUGHTS"), // "Are you having thoughts of ending your life?"
  yesNo("SAFETY_CHECK", "SAFETY_SUICIDAL_INTENT", "SAFETY_SUICIDAL_THOUGHTS"), // intent or plan (AC-SCR-03)

  // PHQ-2 (depression), each 0–3, positive at total ≥ 3
  scale("PHQ2", "PHQ2_1"),
  scale("PHQ2", "PHQ2_2"),

  // GAD-2 (anxiety), each 0–3, positive at total ≥ 3
  scale("GAD2", "GAD2_1"),
  scale("GAD2", "GAD2_2"),

  // PC-PTSD-5 (trauma), five yes/no, positive at ≥ 3 yes
  ...[1, 2, 3, 4, 5].map((n) => yesNo("PCPTSD5", `PCPTSD5_${n}`)),

  // C-SSRS screener (adapted), up to 6 yes/no
  yesNo("CSSRS_SCREEN", "CSSRS_1"), // wished to be dead
  yesNo("CSSRS_SCREEN", "CSSRS_2"), // thoughts of killing oneself
  yesNo("CSSRS_SCREEN", "CSSRS_3", "CSSRS_2"), // thought about how (method)
  yesNo("CSSRS_SCREEN", "CSSRS_4", "CSSRS_2"), // some intention of acting
  yesNo("CSSRS_SCREEN", "CSSRS_5", "CSSRS_2"), // worked out details / plan
  yesNo("CSSRS_SCREEN", "CSSRS_6"), // any attempt or preparation in the last 3 months
];

export const ITEM_BY_CODE: ReadonlyMap<string, ScreenerItem> = new Map(ITEMS.map((i) => [i.itemCode, i]));

export function itemsOf(instrument: Instrument): ScreenerItem[] {
  return ITEMS.filter((i) => i.instrument === instrument);
}

export function maxValue(item: ScreenerItem): number {
  return item.scale === "SCALE_0_3" ? 3 : 1;
}

/** Positive-screen cut-offs on the instrument total */
export const CUTOFFS: Partial<Record<Instrument, number>> = {
  PHQ2: 3,
  GAD2: 3,
  PCPTSD5: 3,
};
