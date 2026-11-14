/** Follow-up timing rules (task 6.7, FR-REC-09). Pure: no database, no clock. */

/** A follow-up with no outcome a day after it was due counts as missed. */
export const MISSED_AFTER_MS = 24 * 3_600_000;
/** India Standard Time, for "due today" (fixed +05:30, no daylight saving). */
const IST_OFFSET_MS = 330 * 60_000;

/** End of the current IST day, as an instant. */
export function endOfTodayIst(now: Date): Date {
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  local.setUTCHours(24, 0, 0, 0);
  return new Date(local.getTime() - IST_OFFSET_MS);
}
