# Hasini's updates

Only Hasini (or her Claude) edits this file. Anushka (and her Claude) read it after every pull, before changing any file. Anushka's log is `docs/anushka_updates.md`. Newest entry at the bottom.

Entry format:

```markdown
## YYYY-MM-DD · task · short title
- **Did:** what was built or changed
- **Decided:** decisions taken (and doubts answered)
- **Files:** files created or changed
- **Anushka should know:** anything that affects her work or files
- **Next:** what comes next
```

---

## 2026-11-19 · Setup · Started my update log
- **Did:** pulled `origin/master` (fast-forward, 4 commits: P.11 language switch, a11y fixes, e2e header fix, Anushka's plan and team logs); read `docs/anushka_updates.md` and `docs/hasini_portals.md` §2; created this log.
- **Decided:** follow the "Team update logs" rule already in `CLAUDE.md` (no second copy added, since `CLAUDE.md` is a shared file); every change I make gets an entry here in the same commit.
- **Files:** `docs/hasini_updates.md` (new)
- **Anushka should know:** nothing changed in shared files.
- **Next:** create my `hasini/` branch and start task H.0 in `docs/hasini_portals.md`.

## 2026-11-19 · H.1 · Lifecycle rules
- **Did:** pure `autoStatus(facts)` that gives the stage a case should be at from four facts (current stage, seen by staff, support arranged, follow-up scheduled); 13 unit tests, 100% coverage of the file. Nothing calls it yet (that is H.2).
- **Decided:** forward only (a stage set by hand is never pulled back); Closed stays Closed and the rules never close a case; a follow-up without arranged support does not move the case to Follow-up planned. Stage order comes from `CASE_STATUSES`. Requirement is FR-CASE-05 (the five statuses), not FR-CASE-02 (assignment) as the plan's example commit says.
- **Files:** `web/src/core/cases/lifecycle.ts` (new), `web/tests/unit/lifecycle.test.ts` (new)
- **Anushka should know:** no shared files touched. Section 8 doubts sent for answers; H.2 waits on D3 and D5.
- **Next:** H.6 alert sound (without the mute button, D4).

## 2026-11-19 · H.0 · Anushka's answers to doubts D1–D8
- **Did:** recorded all eight answers in `hasini_portals.md` §9.
- **Decided (all option A):**
  - **D1:** a closed case is never reopened automatically; a new message on it shows the case in the default queue with a "New message on a closed case" note; safety alerts and the emergency panel fire as normal. Rule goes in the flow plan.
  - **D2:** analytics batch later and optional; synthetic only, marked as samples so analytics can filter them out.
  - **D3:** add `statusChangedAt`; update `DATABASE.md` and `models.ts` in the same commit as the code (H.2).
  - **D4:** mute button: banner stays, "Sound off" always visible, session-only, resets at sign-in; note under FR-ALR in `REQUIREMENTS.md` (H.6).
  - **D5:** one `syncCaseStatus` line in `score.ts` inside the existing transaction, events after commit; pull before touching it.
  - **D6:** `--reset` before each demo; add the command to the pre-presentation checklist.
  - **D7:** referral progress does not change what the person sees, for now.
  - **D8:** "Try a sample" on `/track`, sample dockets only, worded "sample case", never "demo".
- **Files:** `docs/hasini_portals.md` (§9), `docs/hasini_updates.md`
- **Anushka should know:** D1's queue rule needs `core/cases/queue.ts` (not on my file lists) and probably a new case field; I will ask which task it belongs to. D6: no pre-presentation checklist exists yet (`IMPLEMENTATION_PLAN.md` 9.9 is deferred), so I need to know where to put the command. D4 adds "Sound off" text to `messages/*.json`; I will tell you the day before.
- **Next:** D1 rule in the flow plan, then H.6 with the mute button.

## 2026-11-19 · H.0 · D1 rule in the flow plan
- **Did:** added one bullet to `NIVARA_FLOW_AND_UI_PLAN.md` §6.4: a new message on a closed case keeps it Closed, shows it in the default queue with a note, and the safety check, alerts and emergency panel run as normal.
- **Decided:** wording only; no code yet (the queue change needs a task and Anushka's OK for `queue.ts`).
- **Files:** `docs/NIVARA_FLOW_AND_UI_PLAN.md` (§6.4, one bullet), `docs/hasini_updates.md`
- **Anushka should know:** I edited the flow plan, as you asked in D1; only that one bullet.
- **Next:** H.6 with the mute button (D4).

## 2026-11-19 · H.6 (part 1) · Alert beep: once per new or escalated Critical alert
- **Did:** the banner remembers which Critical alerts already beeped (and at what escalation level) in `sessionStorage`, so a reload in the same tab does not beep again; at most one beep per check; an escalation beeps once; High stays silent; one `AudioContext` per tab. Pure decision in a small helper with 12 unit tests (100% coverage).
- **Decided:** the helper lives beside the component (`components/staff/alert-sound.ts`, same pattern as `components/portal/relabel.ts`); it is a new file not on my plan's list, agreed with Hasini. A brand-new tab beeps once for alerts already open (it has no memory yet). Storage holds alert ids and levels only, never case text.
- **Files:** `web/src/components/staff/alert-sound.ts` (new), `web/tests/unit/alert-sound.test.ts` (new), `web/src/components/staff/alert-banner.tsx`
- **Anushka should know:** only the beep logic in `alert-banner.tsx` changed; layout and text are untouched. Part 2 (the "Sound off" button, D4) needs your OK for `app/(staff)/layout.tsx`, `app/(staff)/sign-out-button.tsx` and two strings in `messages/*.json`.
- **Next:** check it in the running app; then part 2 once Anushka answers.

## 2026-11-19 · H.6 (part 1) · Checked in the app; memory survives the 50-alert list
- **Did:** checked part 1 in the running app (counsellor, local dev server, beeps counted by a temporary in-page script): a reload with 50 open Critical alerts made no beep; a new Critical alert (synthetic demo case NHAA-2026-MH-114895) beeped once and did not repeat; its escalation to level 1 about 2 minutes later beeped once. Then fixed an edge case found there: the open-alerts list returns only the newest 50, and the memory forgot any alert not in it, so an older alert coming back onto the list would beep once more. The memory now keeps alerts that drop off the list, up to 500; the ones not seen for longest go first, and alerts in the current check are always kept. 17 unit tests, 100% coverage; reload re-checked in the app (no beep).
- **Decided:** limit of 500 remembered alerts per tab (ids and levels only).
- **Files:** `web/src/components/staff/alert-sound.ts`, `web/tests/unit/alert-sound.test.ts`
- **Anushka should know:** the demo key in `web/.seed-output/demo-api-key.txt` is older than the `DEMO_API_KEY` in `web/.env.local` (the file's key is rejected); the check left demo case NHAA-2026-MH-114895 with an open Critical alert in my local database.
- **Next:** part 2 (the "Sound off" button) once Anushka answers about `layout.tsx`, `sign-out-button.tsx` and the strings.

## 2026-11-19 · H.7 (part) · Approvals grouped by urgency
- **Did:** "Waiting for approval" is split into groups, most urgent first (Immediate → within 15 min → 24 h → 72 h → none), each with a heading and a count; empty groups hidden; the "review after the fact" group stays on top. The district page uses the same inbox, so it is grouped too. Pure `groupByUrgency()` exported from the component, 4 unit tests. Checked in the app as counsellor at 1280 px and 375 px (no sideways scroll).
- **Decided:** headings reuse the existing urgency labels (no new strings), first letter capitalised with CSS only.
- **Files:** `web/src/components/staff/approval-inbox.tsx`, `web/tests/unit/portal-groups.test.ts` (new)
- **Anushka should know:** the approval rows, buttons and `data-testid`s are unchanged; groups add `data-testid="approval-group"`.
- **Next:** police and welfare cards grouped by status.
