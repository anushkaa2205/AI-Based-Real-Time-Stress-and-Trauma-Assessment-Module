/**
 * Case lifecycle rules (task H.1, FR-CASE-05; docs/hasini_portals.md §3).
 * Which stage a case should be at, given what staff have really done.
 * Pure: no database, no network, no clock. Inputs in, result out.
 *
 * - Forward only: an automatic change never moves a case backwards, so a stage
 *   staff chose by hand stays until a later event moves it further.
 * - A closed case is never reopened automatically, and nothing here closes one:
 *   only a staff member closes a case.
 * - Follow-up planned needs support arranged first, so the progress line never
 *   ticks "Support arranged" falsely.
 */
import { CASE_STATUSES, type CaseStatus } from "@/models/enums";

export interface CaseFacts {
  current: CaseStatus;
  /** Opened by a counsellor or supervisor, call taken by an operator, or alert acknowledged. */
  seenByStaff: boolean;
  /** Any recommendation APPROVED or AUTO_TRIGGERED. */
  supportArranged: boolean;
  /** Any follow-up SCHEDULED. */
  followUpScheduled: boolean;
}

const [NEW, UNDER_REVIEW, ACTION_TAKEN, FOLLOW_UP_SCHEDULED, CLOSED] = CASE_STATUSES;

/** The stage the facts alone point to (never CLOSED). */
function stageFromFacts(f: CaseFacts): CaseStatus {
  if (f.supportArranged) return f.followUpScheduled ? FOLLOW_UP_SCHEDULED : ACTION_TAKEN;
  return f.seenByStaff ? UNDER_REVIEW : NEW;
}

/** The stage the case should be at: the later of `current` and what the facts show; CLOSED stays CLOSED. */
export function autoStatus(f: CaseFacts): CaseStatus {
  if (f.current === CLOSED) return CLOSED;
  const target = stageFromFacts(f);
  return CASE_STATUSES.indexOf(target) > CASE_STATUSES.indexOf(f.current) ? target : f.current;
}
