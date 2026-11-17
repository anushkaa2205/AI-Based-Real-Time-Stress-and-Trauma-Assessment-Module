/** Public demo limits shared with the browser (NIVARA_FLOW_AND_UI_PLAN.md §7). No Node imports here. */
/** Messages the person may type in one case (the Review note included). */
export const MAX_MESSAGES_PER_CASE = 40;
/** Speak: at most this much speech per case, the sum of the windows sent across all turns (Phase P). */
export const MAX_LIVE_CALL_MS = 3 * 60_000;
/** The live microphone line counts as free after this long with no activity (window, message, next question). Phase P: 60 s. */
export const LIVE_IDLE_MS = 60_000;
/** A whole demo conversation ends itself after this long (Phase P): no more input, Submit still works. */
export const MAX_CASE_MS = 15 * 60_000;
/** One live-microphone window is 5 s of speech. */
export const WINDOW_MS = 5_000;
