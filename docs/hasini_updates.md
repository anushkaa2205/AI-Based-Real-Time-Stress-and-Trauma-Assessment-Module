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

## 2026-11-20 · H.7 (part) · Police and welfare cards grouped by status
- **Did:** on the police and welfare pages, referral cards are grouped by status in the order pending → accepted → in progress → done → declined, each with a heading and a count; empty groups hidden. The two district lists ("missed" and "open", which use a filter) stay flat. While loading, the list shows the grey skeleton bar instead of the word "Loading". Pure `groupByStatus()` exported from the component, 3 unit tests.
- **Decided:** five groups using the existing status labels instead of the plan's three (a combined "Accepted / in progress" heading would need a new string). Grouping turns on when the list has no filter, so no page files changed (option A1). The cards show exactly the same fields: nothing new reaches police or welfare (rule 8).
- **Files:** `web/src/components/staff/referral-queue.tsx`, `web/tests/unit/portal-groups.test.ts`
- **Anushka should know:** not checked in the browser yet as police or welfare (needs those sign-ins). The accessibility e2e could not sign in: `web/.seed-output/demo-credentials.txt` is out of date (counsellor login 401), so the staff part of AC-ACC-01 was not re-checked; public pages and login passed. Unit tests time out (5 s) at random when the laptop is busy; with `--maxWorkers=4` all 763 pass.
- **Next:** check police and welfare in the browser; the rest of H.7 waits on H.4, H.5 and the strings.

## 2026-11-20 · H.7 (part) · Police cards checked in the app
- **Did:** signed in as the demo police liaison and opened `/police` at 1280 px and 375 px: cards grouped as Pending (1) then Accepted (19), each card in its right group, headings with counts, no sideways scroll, and no score, band or indicator words on the cards. No referral was changed during the check.
- **Decided:** nothing new.
- **Files:** `docs/hasini_updates.md`
- **Anushka should know:** welfare uses the same component but was not opened in the browser (needs the welfare sign-in).
- **Next:** waiting on Anushka's answers (mute button files, D1 queue, D6 checklist) and on H.4/H.5 for the rest of H.7.

## 2026-11-20 · H.7 (Batch 1) · District table scrolls inside its card
- **Did:** wrapped the district "High and Critical cases" table in the same scrolling card the case queue uses. Checked as district officer at 375 px: 220 rows, the table scrolls inside its card and the page no longer scrolls sideways.
- **Decided:** wrapper only; columns and data unchanged.
- **Files:** `web/src/components/staff/district-cases.tsx`
- **Anushka should know:** nothing else on the district page changed.
- **Next:** police and welfare order.

## 2026-11-20 · H.7 (Batch 1) · Police and welfare: sorted by due time, finished groups closed
- **Did:** inside each status group, cards are sorted by due time (most overdue first, no due time last). Done and Declined groups start closed (native show/hide; the existing heading with its count is the toggle, so no new text). District lists unchanged. 3 unit tests. Checked as police: Accepted (19) now runs from the most overdue to the least; no sideways scroll.
- **Decided:** no new strings; the browser's own `<details>` element for the closed groups.
- **Files:** `web/src/components/staff/referral-queue.tsx`, `web/tests/unit/portal-groups.test.ts`
- **Anushka should know:** the closed Done/Declined groups were not seen in the app, because there are no done or declined referrals in the data yet (covered by unit tests only). Cards show the same fields (rule 8).
- **Next:** approvals overdue line.

## 2026-11-20 · H.7 (Batch 1) · Approvals: red "Overdue since…" line
- **Did:** a proposal past its due time shows the red "Overdue since …" line instead of "due …"; re-checked on every refresh. 3 unit tests. Checked as counsellor (100 of 100 demo proposals overdue) and as district officer (50 requests awaiting them).
- **Decided:** reused the existing `staff.referrals.overdueSince` string (no new text); asked Anushka in my message whether that is OK.
- **Files:** `web/src/components/staff/approval-inbox.tsx`, `web/tests/unit/portal-groups.test.ts`
- **Anushka should know:** the district page shows it too (same inbox).
- **Next:** alert count in the tab title.

## 2026-11-20 · H.7 (Batch 1) · Open Critical alert count in the tab title
- **Did:** when Critical alerts are open, the tab title starts with their number, e.g. "(3) Nivara"; it is put back after page navigation and removed when none are open. Only roles that get alerts (operator, counsellor, supervisor, district officer) see it. 5 unit tests. Checked: "(50) Nivara" for counsellor across Approvals and Case queue, and for district officer; plain "Nivara" for police.
- **Decided:** number only, no case text; Critical only.
- **Files:** `web/src/components/staff/alert-banner.tsx`, `web/src/components/staff/alert-sound.ts`, `web/tests/unit/tab-title.test.ts` (new)
- **Anushka should know:** the count tops out at 50 because the alert list returns 50 at a time (there are more open demo alerts than that).
- **Next:** band filter on the queue.
