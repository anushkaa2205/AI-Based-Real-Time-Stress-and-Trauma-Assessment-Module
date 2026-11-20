# Anushka's updates

Only Anushka (or her Claude) edits this file. Hasini (and her Claude) read it after every pull, before changing any file. Hasini's log is `docs/hasini_updates.md`. Newest entry at the bottom.

Entry format:

```markdown
## YYYY-MM-DD · task · short title
- **Did:** what was built or changed
- **Decided:** decisions taken (and doubts answered)
- **Files:** files created or changed
- **Hasini should know:** anything that affects her work or files
- **Next:** what comes next
```

---

## 2026-11-19 · Setup · Update logs and Hasini's plan
- **Did:** added the "Team update logs" rule to `CLAUDE.md`; created this log; wrote `docs/hasini_portals.md` (staff portals, live case tracking, sample cases, branch and conflict rules) for Hasini.
- **Decided:** each person edits only their own update log; pull before every push; on any merge conflict, abort and ask Anushka.
- **Files:** `CLAUDE.md`, `docs/anushka_updates.md` (new), `docs/hasini_portals.md` (new)
- **Hasini should know:** start with task H.0 in the plan; the doubts in its section 8 need Anushka's answers before H.2.
- **Next:** answer the section 8 doubts.

## 2026-11-19 · Reframe · Nivara is an integrated portal
- **Did:** removed every use of the old "presentation layer" wording from code, text and docs. Renamed `/api/…` relay to `/api/portal/*`, `core/portal/`, `contracts/portal.ts`, `PORTAL_ENABLED`, `PORTAL_API_KEY`, stored flag `isPortal`, permission `portal.takeover`, analytics filter `portal=include|exclude|only`, seeded staff `@staff.nivara.test` ("Nivara Counsellor" …), seed files `staff-credentials.txt` and `integration-api-key.txt`. Removed the staff-screen source tag, the footer and journey notices, and the old URL redirects. Added `npm run db:migrate-portal-names`.
- **Decided:** Nivara is one working integrated portal (public portal + staff portals) with the module plugged in; the module still runs on its own with the portal switched off. I work on branch `anushka` and merge into `master` every night.
- **Files:** most of `web/src`, `web/tests`, `web/scripts`, `web/messages/*.json`, every doc, `CLAUDE.md`.
- **Hasini should know:** create your branch only after tonight's merge. In your plan the old source tag is gone, so the Sample pill is a new component (`components/staff/sample-tag.tsx`). Use `isPortal`, `PORTAL_*`, `/api/portal/track`.
- **Next:** on the deployment: rename the two Vercel variables, run `npm run db:migrate-portal-names`, then `npm run db:indexes` and `npm run seed`.

## 2026-11-20 · CI · Two long lines in the analysis-service text test
- **Did:** wrapped the docstring and the request body in `test_previous_question_is_context_only` so `ruff check` passes (E501, over 100 characters). CI had failed on every branch at this step. No change to what the test checks.
- **Decided:** nothing new.
- **Files:** `analysis-service/tests/test_text.py`
- **Hasini should know:** the red CI on your branch came from this file, not from your work; it clears once you take `master` after the next merge.
- **Next:** check that CI passes (pytest was not run locally: no Python 3.12 environment on this laptop).
