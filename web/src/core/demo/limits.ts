/** Public demo limits shared with the browser (NIVARA_FLOW_AND_UI_PLAN.md §7). No Node imports here. */
export const MAX_MESSAGES_PER_CASE = 40;
export const MAX_LIVE_CALL_MS = 3 * 60_000;
/** A live call with no audio window for this long counts as over and frees the line. */
export const LIVE_IDLE_MS = 20_000;
