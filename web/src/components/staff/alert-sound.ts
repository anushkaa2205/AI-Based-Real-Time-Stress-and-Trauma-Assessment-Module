/**
 * When the staff alert banner beeps (task H.6, FR-ALR-01/03; docs/hasini_portals.md §4.9).
 * Pure decision plus a small per-tab memory, so a reload does not beep again.
 *
 * - Only Critical alerts beep; High stays silent (FR-ALR-04).
 * - At most one beep per check, however many new Critical alerts arrive.
 * - An alert beeps again only when it escalates (its escalationLevel goes up).
 */

export interface SoundAlert {
  id: string;
  level: "CRITICAL" | "HIGH";
  escalationLevel: number;
}

/** Alert id → the highest escalation level already beeped for. */
export type HeardMap = Record<string, number>;

/** Key in sessionStorage (per tab). Holds alert ids and numbers only, never case text. */
export const HEARD_KEY = "nivara.alerts.heard";

/** Whether this check should beep, and what to remember afterwards (only alerts still open are kept). */
export function decideBeep(alerts: readonly SoundAlert[], heard: HeardMap): { beep: boolean; heard: HeardMap } {
  let beep = false;
  const next: HeardMap = {};
  for (const a of alerts) {
    if (a.level !== "CRITICAL") continue;
    const before = heard[a.id];
    if (before === undefined || a.escalationLevel > before) beep = true;
    next[a.id] = Math.max(before ?? a.escalationLevel, a.escalationLevel);
  }
  return { beep, heard: next };
}

/** Reads the memory; anything missing, blocked or malformed counts as empty. */
export function readHeard(storage: Pick<Storage, "getItem"> | null): HeardMap {
  try {
    const raw = storage?.getItem(HEARD_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: HeardMap = {};
    for (const [id, level] of Object.entries(parsed)) if (typeof level === "number" && Number.isFinite(level)) out[id] = level;
    return out;
  } catch {
    return {};
  }
}

/** Saves the memory; a blocked or full storage is ignored (the banner is the alert, sound is a bonus). */
export function writeHeard(storage: Pick<Storage, "setItem"> | null, heard: HeardMap): void {
  try {
    storage?.setItem(HEARD_KEY, JSON.stringify(heard));
  } catch {
    /* storage blocked: fall back to the in-memory copy */
  }
}
