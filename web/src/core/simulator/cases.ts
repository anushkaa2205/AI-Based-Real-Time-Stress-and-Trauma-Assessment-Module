/**
 * Simulator case checks (task S.2, FR-SIM-02). Pure: case objects in, problems out.
 * The schema (contracts/simulator.ts) checks each field; these check what a schema cannot:
 * steps that fit the channel, consent that covers what is sent, keypad answers that exist,
 * C4's takes, and that the library as a whole covers every channel and band.
 */
import { SIM_CHANNELS, type SimCase, type SimChannel, type SimStep } from "@/contracts/simulator";
import { RISK_BANDS } from "@/models/enums";
import { ITEM_BY_CODE, type ScreenerItem } from "@/core/screeners/items";

export const SIM_CASE_IDS = Array.from({ length: 12 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`);

/** Which step kinds each channel can carry (how that NHAA channel works). */
export const STEP_KINDS: Readonly<Record<SimChannel, readonly SimStep["kind"][]>> = {
  VOICE_CALL: ["speech"],
  IVRS: ["key", "speech"],
  CHATBOT: ["message"],
  MOBILE_APP: ["speech", "message"],
  PORTAL: ["document"],
};

/** Keypad digit → screener value, as the IVRS menu reads it. null = skipped (*). */
export function keyValue(item: ScreenerItem, digit: string): number | null | undefined {
  if (digit === "*") return null;
  if (item.scale === "YES_NO") return digit === "1" ? 1 : digit === "2" ? 0 : undefined;
  return ["0", "1", "2", "3"].includes(digit) ? Number(digit) : undefined;
}

export function checkCase(c: SimCase): string[] {
  const errors: string[] = [];
  const at = (i: number) => `${c.id} step ${i + 1}`;
  const allowed = STEP_KINDS[c.channel];
  const answered = new Map<string, number | null>();
  const audio = new Set<string>();
  const takeIds = new Set((c.takes ?? []).map((t) => t.id));

  c.steps.forEach((s, i) => {
    if (!allowed.includes(s.kind)) errors.push(`${at(i)}: a ${s.kind} step cannot come through ${c.channel}`);
    if (c.language !== "en" && s.kind !== "key" && !s.gloss) errors.push(`${at(i)}: add an English gloss for reviewers`);
    if (s.kind === "document" && s.gloss && s.gloss.length !== s.paragraphs.length)
      errors.push(`${at(i)}: one gloss per paragraph`);

    if (s.kind === "speech") {
      if (!c.consent.voiceAnalysis) errors.push(`${at(i)}: speech needs voiceAnalysis consent`);
      if (audio.has(s.audio.file)) errors.push(`${at(i)}: audio file ${s.audio.file} is used twice`);
      audio.add(s.audio.file);
      if (takeIds.size > 0 && (!s.take || !takeIds.has(s.take))) errors.push(`${at(i)}: say which take this line belongs to`);
      if (takeIds.size === 0 && s.take) errors.push(`${at(i)}: take "${s.take}" but the case has no takes`);
    }
    if ((s.kind === "message" || s.kind === "document") && !c.consent.textAnalysis)
      errors.push(`${at(i)}: text needs textAnalysis consent`);

    if (s.kind === "key") {
      const item = ITEM_BY_CODE.get(s.itemCode);
      if (!item) {
        errors.push(`${at(i)}: unknown screener item ${s.itemCode}`);
        return;
      }
      const v = keyValue(item, s.digit);
      if (v === undefined) errors.push(`${at(i)}: digit ${s.digit} is not an answer to ${s.itemCode} (${item.scale})`);
      if (item.askIf && answered.get(item.askIf) !== 1) errors.push(`${at(i)}: ${s.itemCode} is only asked after "yes" to ${item.askIf}`);
      if (answered.has(s.itemCode)) errors.push(`${at(i)}: ${s.itemCode} is answered twice`);
      answered.set(s.itemCode, v ?? null);
    }
  });

  if ("differentReadings" in c.expected) {
    if (takeIds.size < 2) errors.push(`${c.id}: "different readings" needs at least two takes`);
    // Same words in every take, so only the voice can differ
    const byTake = new Map<string, string>();
    for (const s of c.steps) if (s.kind === "speech" && s.take) byTake.set(s.take, `${byTake.get(s.take) ?? ""}|${s.text}`);
    if (new Set(byTake.values()).size > 1) errors.push(`${c.id}: the takes must use exactly the same words`);
  } else if (takeIds.size > 0) errors.push(`${c.id}: takes are only for a "different readings" case`);

  if (c.takes && takeIds.size !== c.takes.length) errors.push(`${c.id}: take ids must be unique`);
  return errors;
}

export interface LibraryReport {
  errors: string[];
  /** Not failures: work still owed by the team (review, recordings) */
  pending: string[];
}

export function checkLibrary(cases: readonly SimCase[]): LibraryReport {
  const errors: string[] = [];
  const pending: string[] = [];
  const ids = cases.map((c) => c.id);
  for (const id of SIM_CASE_IDS) if (!ids.includes(id)) errors.push(`missing case ${id}`);
  if (new Set(ids).size !== ids.length) errors.push("case ids must be unique");

  for (const ch of SIM_CHANNELS) if (!cases.some((c) => c.channel === ch)) errors.push(`no case comes through ${ch}`);
  const bands = new Set(cases.flatMap((c) => ("band" in c.expected ? [c.expected.band] : [])));
  for (const b of RISK_BANDS) if (!bands.has(b)) errors.push(`no case is expected to be ${b}`);

  for (const c of cases) {
    errors.push(...checkCase(c));
    if (c.reviewedBy.length < 2) pending.push(`${c.id}: needs a second-person review (${c.reviewedBy.length}/2)`);
    for (const s of c.steps)
      if (s.kind === "speech" && s.audio.source === "PLACEHOLDER") pending.push(`${c.id}: audio ${s.audio.file} not recorded yet`);
  }
  return { errors, pending };
}
