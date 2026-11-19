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
