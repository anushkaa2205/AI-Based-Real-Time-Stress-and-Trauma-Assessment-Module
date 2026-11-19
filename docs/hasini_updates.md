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
