# Staff Portals and Live Case Tracking: Plan for Hasini (`docs/hasini_portals.md`)

> **Owner of the work:** Hasini Boddu (member 2). **Owner of the project and final say:** Anushka Kumari (member 1).
> **Written:** 19 Nov 2026. **Status:** not started.
> **Read with:** `/CLAUDE.md` (project rules, must be followed), `docs/NIVARA_FLOW_AND_UI_PLAN.md` §6.4 (tracking), §6.6 (who sees what) and §9 (the look). Where this file and those disagree, **stop and ask Anushka** (section 2.4).

---

## 1. What this plan does, in short

1. Makes **case tracking dynamic**: a case's stage now moves forward **automatically** when staff really do something (open it, approve support, plan a follow-up), and the public tracking page **updates by itself** without a reload.
2. Says **what happens on each staff portal and how it should look**, so all ten roles tell one connected story.
3. Adds **sample cases** (fixed, synthetic, always present) so **every portal shows at least 2 cases** before anyone uses the demo. Live demo cases still appear on top of them.
4. Fixes the **repeating alert beep** in the staff portals.

### 1.1 Why (what is wrong today)

Checked in the code on 19 Nov 2026:

| Problem | Where |
|---|---|
| The case status only changes when someone clicks "Mark as" on the case page. Approving support, sending a referral or planning a follow-up never moves it. So the tracking page can say "Support arranged: Counselling" while the step still says **Registered**. | `app/api/v1/staff/cases/[id]/route.ts` is the only place that sets `status` |
| `FOLLOW_UP_SCHEDULED` ("Follow-up planned") is never set anywhere, and there is no button for it. | `core/followups/service.ts` |
| The tracking page fetches once when it opens. Nothing changes until the person reloads. | `components/public/track-result.tsx` |
| "Last updated" moves when staff add a private note or acknowledge an alert (nothing the person can see), but **not** when support is approved (approval never touches the case document). | `core/integration/status.ts` uses `case.updatedAt` |
| The critical-alert beep remembers what it already beeped for only in memory, so every reload or sign-in beeps again for **every** open critical alert. Each beep opens a new `AudioContext`. | `components/staff/alert-banner.tsx` |
| A fresh database shows empty portals until someone runs the demo. | `scripts/seed.ts` seeds users and settings only |

---

## 2. How Hasini works (read this first)

### 2.1 Your branch

All your work goes on **your own branch**. Never commit to `master`. Anushka merges.

```powershell
# once, at the start (from the repo root)
git checkout master
git pull origin master
git checkout -b hasini/portals-tracking
git push -u origin hasini/portals-tracking
```

### 2.1.1 Pull before you start, pull before every push (the main rule for avoiding merge conflicts)

**Every time you sit down to work**, before you change any file:

```powershell
git checkout hasini/portals-tracking
git pull origin hasini/portals-tracking   # your own branch, in case you pushed from another laptop
git fetch origin
git merge origin/master                   # Anushka's latest work
```

**Every time you push**, in this exact order:

```powershell
git status                                # 1. nothing unexpected; never commit .env* or .seed-output
git diff --stat                           # 2. only the files you meant to change, with sensible line counts
git add <your files>                      # 3. name the files; avoid "git add ." 
git commit -m "feat(tracking): ... (H.2)"
git fetch origin                          # 4. pull again right before pushing
git merge origin/master
# 5. if the merge brought anything in, from web/: npm run typecheck; npm run lint; npm test
git push origin hasini/portals-tracking   # 6. push
```

If step 4 says **CONFLICT**: do not fix it by guessing. Run `git merge --abort`, then follow 2.3.

### 2.1.2 Habits that stop conflicts before they start

- **Commit and push at least once a day.** Never sit on unpushed work for days, because the longer a branch lives, the bigger the conflicts.
- **Short pull requests.** One task per PR (H.1, H.2 …), opened from `hasini/portals-tracking` into `master`, as soon as the task is done. Ask Anushka to merge it the same day or the next. After a merge, run the "every time you sit down" steps again before you continue.
- **Touch only the lines you need.** Do not reformat, re-indent, reorder imports or "tidy" a whole file. Don't let your editor run "format document" on files you aren't changing. If `git diff --stat` shows hundreds of changed lines in a file where you changed five, your editor changed the line endings or the formatting: undo that before committing (`git checkout -- <file>` and redo the small edit).
- **Do not rename, move or delete existing files.** If you think one should move, raise a doubt.
- **One file, one person at a time.** Before you start editing a file on the shared list (2.2), message Anushka ("I'm editing `case-queue.tsx` today"). If she is editing it too, one of you waits.
- **Add, don't rewrite.** When you need something in an existing file, add a new function or component next to the old one rather than restructuring it.
- **Small commits, one concern each,** with the task and requirement IDs in the message, for example `feat(tracking): move case to Support arranged when support is approved (H.2, FR-CASE-02)`.

### 2.1.3 Other rules for every push

- From `web/`, `npm run typecheck`, `npm run lint` and `npm test` must all pass. Never skip or delete a failing test to get green.
- Never commit `.env*`, `web/.seed-output/` or any real person's data.
- Never use `git push --force`, and never push to `master`.

### 2.1.4 Anushka's side (so it works both ways)

- Avoid editing the files in Hasini's "new files" and "will edit" lists (2.2) while her branch is open. If you must, tell her first.
- Merge Hasini's pull requests quickly, and tell her when `master` has changed a file she is working on.

### 2.2 Files: which are yours, which are shared

The goal is that **your work never conflicts with Anushka's**. Stay inside these lists.

**New files you create (yours alone):**

| File | What it is |
|---|---|
| `web/src/core/cases/lifecycle.ts` | Pure rules: which stage a case should be at (H.1) |
| `web/src/core/cases/sync-status.ts` | Applies those rules after a staff action (H.2) |
| `web/src/core/cases/samples.ts` | The sample case definitions (H.5) |
| `web/scripts/seed-samples.ts` | Creates and resets the sample cases (H.5) |
| `web/src/components/staff/case-stage.tsx` | The stage chip and stage line used on staff screens (H.4) |
| `web/tests/unit/lifecycle.test.ts`, `web/tests/unit/samples.test.ts` | Unit tests |
| `web/tests/e2e/tracking-live.spec.ts` | End-to-end test of live tracking |
| `docs/hasini_updates.md` | Your update log (2.5); only you edit it |

**Existing files you will edit (small, focused edits; list them in your pull request):**

`components/public/track-result.tsx`, `components/staff/alert-banner.tsx`, `case-queue.tsx`, `case-detail.tsx`, `district-cases.tsx`, `referral-queue.tsx`, `approval-inbox.tsx`, `operator-console.tsx`, `demo-mark.tsx`; `core/integration/status.ts`, `core/followups/service.ts`, `core/referrals/service.ts` (the decision function only); the route files `app/api/v1/staff/cases/[id]/route.ts`, `alerts/[id]/ack/route.ts`, `interactions/[id]/claim/route.ts`.

**Shared files: ask Anushka BEFORE you touch them** (these are where conflicts and rule breaks happen):

| File or folder | Why |
|---|---|
| `web/messages/*.json` (all five languages) | Anushka edits these all the time. When you need new text: tell her the day, merge `origin/master` right before, add your keys **in one block under a new name** (for example `staff.stage.*`), commit that alone, push the same day. |
| `web/src/models/*.ts`, `models/enums.ts` | Database shape. A new field or enum value needs her OK (doubt D3). |
| `web/src/core/pipeline/*` | The scoring pipeline (doubt D5). |
| `web/package.json` | Only to add the one `seed:samples` script line (H.5). Never add a dependency without asking (CLAUDE.md rule 5). |
| `web/src/core/policies/rbac.ts`, `web/src/contracts/*` | Permissions and API contracts. This plan needs **no** permission or contract change. If you think one is needed, that is a doubt. |
| `docs/*` (except this file and `hasini_updates.md`), `CLAUDE.md` | Docs are the spec. Tick tasks **in this file only**; Anushka updates `IMPLEMENTATION_PLAN.md` after she merges. |

**Never touch:** `docs/anushka_updates.md` (read it, never edit it), `core/scoring/*`, `core/safety-lexicon/*`, `core/recommendations/*`, `analysis-service/*`, the public portal journey (`app/(public)/start/*`, `components/portal/*`), `.env*`.

### 2.3 If git shows a conflict

1. **Do not pick a side by guessing**, and do not delete Anushka's lines.
2. Run `git merge --abort` to go back to how things were.
3. Write a doubt (section 2.4) naming the file and both changes, and **ask Anushka**.
4. Carry on with another task until she answers.

### 2.4 Doubts: how to raise one

Whenever something is unclear, two documents disagree, a task needs a file from the "ask first" list, or a conflict appears: **stop and ask Anushka, describing the doubt fully**. Do not build on a guess.

Send it on WhatsApp or as a GitHub comment, in this shape, so she can answer without having to look anything up:

```text
Doubt (task H.x): <one line: what the doubt is>
What I was doing: <the step you were on>
Where: <file(s) and line, or the doc section>
What is unclear / what clashes: <describe the doubt: what you expected, what you found, why it matters>
Options I see: A) ...  B) ...
I suggest: <A or B, and why>  (or "no idea")
Meanwhile I am: <the other task you moved on to, or "waiting">
```

When Anushka answers, write the doubt and her answer in **section 9** of this file and in your `hasini_updates.md` entry, then carry on. Only you edit section 9; Anushka answers in chat and you record it.

Some doubts are already known; they are in **section 8**. Each has a suggested answer, but wait for Anushka's yes before you build on it.

### 2.5 Two update logs: `hasini_updates.md` and `anushka_updates.md`

Each person keeps **their own** log in `docs/`, and **only its owner ever edits it**. Because nobody else writes to your file, the logs themselves can never conflict.

| File | Written by | Read by |
|---|---|---|
| `docs/hasini_updates.md` | Hasini (or her Claude) only | Anushka, after every pull |
| `docs/anushka_updates.md` | Anushka (or her Claude) only | Hasini, after every pull |

**What goes in your log:** every decision you take and a short summary of every piece of implementation, **added in the same commit as the code it describes**. Newest entry at the bottom. Each entry looks like this:

```markdown
## 2026-11-21 · H.2 · Wire the events
- **Did:** case moves to Being reviewed when a counsellor opens it; to Support arranged on approval.
- **Decided:** forward-only; manual "Change stage" still wins until the next event (doubt D1 answered: keep closed).
- **Files:** core/cases/sync-status.ts (new), app/api/v1/staff/cases/[id]/route.ts, core/followups/service.ts
- **Anushka should know:** I touched core/referrals/service.ts (decision function only).
- **Next:** H.3 live tracking page.
```

**After every pull** (2.1.1, both the "sit down" and the "before push" steps), read the other person's log from where you last stopped. If it mentions a file you are working on, or a decision that changes your task, stop and ask before going on (2.4).

#### The rule in `CLAUDE.md`, so every Claude session follows it by itself

This is the "set once, works forever" part: Claude Code reads `CLAUDE.md` at the start of every session, so the rule never has to be repeated. **Anushka adds this block to `CLAUDE.md` on `master` before Hasini creates her branch** (CLAUDE.md is a shared file, so only one person should edit it, and doing it before the branch exists means it can never conflict). Anushka also creates `docs/anushka_updates.md` at the same time.

```markdown
## Team update logs (two people work on this repo)

- Anushka writes only `docs/anushka_updates.md`; Hasini writes only `docs/hasini_updates.md`. Never edit the other person's log.
- **After every `git pull` or `git merge origin/master`**, and at the start of every session, read the other person's update log (new entries since last time) before changing any file. If an entry touches a file or decision your current task depends on, stop and tell the user before writing code.
- **Whenever you make a decision or finish a piece of implementation**, add an entry to your own log (date, task, what was done, decisions, files changed, what the other person should know, next step), in the same commit as the code.
- Who "you" are: if the current git branch starts with `hasini/`, you are working for Hasini; otherwise for Anushka.
- Before every push: pull (`git fetch origin` then `git merge origin/master`), re-read the other log, run typecheck, lint and tests, then push. On any merge conflict: `git merge --abort`, then ask the user; never resolve it by guessing.
```

#### If the block is not in `CLAUDE.md` yet: Hasini's one-time prompt

Give this to your Claude once at the start of the first session (it will then follow it for the rest of that session; with the CLAUDE.md block it applies to every session):

> Read `CLAUDE.md` and `docs/hasini_portals.md` fully. Before writing any code, create `docs/hasini_updates.md` with a title and the entry format from section 2.5 of the plan, and commit it on my branch `hasini/portals-tracking`. From now on: (1) every time we pull or merge `origin/master`, read the new entries in `docs/anushka_updates.md` before changing any file, and stop and tell me if one touches a file or decision our task depends on; (2) every time we make a decision or finish a piece of implementation, add an entry to `docs/hasini_updates.md` in the same commit as the code; (3) never edit `docs/anushka_updates.md`, `CLAUDE.md` or anything on the "ask first" list in section 2.2 without my say-so; (4) pull before every push and follow sections 2.1–2.4 of the plan; on any conflict, abort the merge and tell me. Work on one task at a time and stop on any open doubt in section 8.

### 2.6 If you use Claude Code

Give it one task at a time: "Read `CLAUDE.md` and `docs/hasini_portals.md`, then do task H.2 only, on branch `hasini/portals-tracking`." It must follow the file lists in 2.2, keep `hasini_updates.md` up to date (2.5) and stop on anything in section 8 that is still open.

### 2.7 Rules from CLAUDE.md that matter most here

- **Rule 1:** the person never sees a score, band, indicator or anything diagnostic. The tracking page shows only: docket, stage, dates, support arranged.
- **Rule 7:** support is a proposal until a counsellor or supervisor approves it. Automatic stage changes follow approvals; they never approve anything themselves.
- **Rule 8:** police and welfare see referrals only. Nothing in this plan sends them more.
- **Rule 11:** sample cases are synthetic, respectful and non-graphic.
- **Rule 3:** sample scores come from the real scoring code, never typed in by hand (section 5.2).

---

## 3. How a case is tracked (the lifecycle)

### 3.1 The five stages

Unchanged names, from `CASE_STATUSES`. The person sees the right-hand column.

| # | Status | Person sees | Meaning |
|---|---|---|---|
| 1 | `NEW` | Registered | The case exists; nobody on staff has picked it up yet |
| 2 | `UNDER_REVIEW` | Being reviewed by helpline staff | A counsellor or supervisor has opened it, an operator has taken the call, or someone acknowledged its alert |
| 3 | `ACTION_TAKEN` | Support arranged | At least one support recommendation is `APPROVED` or `AUTO_TRIGGERED` |
| 4 | `FOLLOW_UP_SCHEDULED` | Follow-up planned | Support is arranged **and** a follow-up is scheduled |
| 5 | `CLOSED` | Closed | Only a staff member closes a case, by hand (the High/Critical follow-up-or-reason rule FR-REC-09 stays) |

### 3.2 What moves a case automatically

| Event (a real staff action) | Where it happens | Case moves to |
|---|---|---|
| Counsellor or supervisor opens the case page | `GET /api/v1/staff/cases/{id}` (it already writes the `case.view` audit entry) | `UNDER_REVIEW` |
| Someone acknowledges the case's alert | `POST /alerts/{id}/ack` | `UNDER_REVIEW` |
| Operator presses "Take call" | `POST /interactions/{id}/claim` | `UNDER_REVIEW` |
| A support recommendation is approved | `POST /recommendations/{id}/decision` → `core/referrals/service.ts` | `ACTION_TAKEN`, or `FOLLOW_UP_SCHEDULED` if a follow-up is already planned |
| Emergency support is auto-triggered (Critical) | `core/pipeline/score.ts` (**doubt D5**) | `ACTION_TAKEN` |
| A follow-up is scheduled | `POST /cases/{id}/follow-ups` → `core/followups/service.ts` | `FOLLOW_UP_SCHEDULED`, **only if** support is already arranged (otherwise the progress line would tick "Support arranged" falsely) |
| Follow-up done, missed or cancelled | `PATCH /follow-ups/{id}` | No change (stages only move forward automatically) |
| Police or welfare accept, start or finish a referral | `PATCH /referrals/{id}` | No change (**doubt D7**) |
| Staff use "Change stage" on the case page | `PATCH /cases/{id}` (exists) | What they chose. Still the only way to close a case. |

**Two rules that keep it predictable:**
- **Forward only.** Automatic changes never move a case backwards. A manual change by staff wins until the next real event.
- **Never reopen automatically.** A `CLOSED` case stays closed (**doubt D1** for a person writing again on a closed case).

### 3.3 How it is built

**`core/cases/lifecycle.ts` (pure, no database, no clock):**

```ts
export interface CaseFacts {
  current: CaseStatus;
  seenByStaff: boolean;       // opened by counsellor/supervisor, call taken, or alert acknowledged
  supportArranged: boolean;   // any recommendation APPROVED or AUTO_TRIGGERED
  followUpScheduled: boolean; // any follow-up SCHEDULED
}
/** The stage the case should be at: the later of `current` and what the facts show; CLOSED stays CLOSED. */
export function autoStatus(f: CaseFacts): CaseStatus;
```

Use the order of `CASE_STATUSES` for "later". Import enum constants; do not retype the strings.

**`core/cases/sync-status.ts`:** `syncCaseStatus(caseId, { session?, seenByStaff? })` loads the facts, calls `autoStatus`, and if the status changes:
1. saves it (inside the caller's transaction when there is one),
2. sets `statusChangedAt` (**doubt D3**),
3. writes an audit entry with from/to only, never victim text (rule 9); check how audit action names are listed and whether a new one needs Anushka's OK,
4. publishes the existing `case.updated` event **after** commit, so the queue, district view and operator console update live (same as `PATCH /cases/{id}` does today).

Call it from each event in 3.2. Do not copy the rules into the routes.

### 3.4 The tracking page, made live

`components/public/track-result.tsx`:
- **Polls** `/api/demo/track?docket=…` every **15 seconds** while the tab is visible; pauses when hidden; checks at once when the tab comes back into focus; stops after 30 minutes and shows a **Refresh** button.
- Shows a small line under the docket: "Updates automatically · last checked 10:42".
- When the stage changes, the new step animates in (off under `prefers-reduced-motion`) and a polite screen-reader announcement says the new stage.
- Check the `track` rate limit in the demo safeguards (`core/demo`). 4 requests a minute per visitor must fit. If it does not, that is a doubt: do not raise the limit yourself (it is a public safeguard, plan §7).
- **"Last updated"** in `core/integration/status.ts` becomes the later of `statusChangedAt` and the newest arranged-support decision time, so it changes only when something the person can see changes. The response keeps exactly its five fields (contract `API_CONTRACTS §6.6`); no new field.

Push from Pusher is not used on the public page: public visitors cannot join private channels, and polling is free and simple.

---

## 4. Each portal: what happens and how it looks

General look (already in `NIVARA_FLOW_AND_UI_PLAN.md` §9, keep it): light pages, dark sidebar, petrol brand colour, **risk colour is the only loud colour**, IBM Plex Sans, docket IDs in Plex Mono, real tables, every list has a written empty state and a loading skeleton. Marigold never appears on staff screens.

**New shared piece (H.4): `case-stage.tsx`**
- **Stage chip** for tables: a small pill with 5 dots, filled up to the current stage, plus the stage word ("Support arranged"). Neutral colours (petrol and grey), never band colours, so stage and risk are never confused.
- **Stage line** for the case page: the same five steps as the public tracking page, with the date each was reached.
- **"What the person sees"** box on the case page: an exact preview of the tracking page (stage + support lines), so staff know what the person is being told. It reuses the status view from `core/integration/status.ts` and shows nothing more.
- **Sample** tag: samples show a grey "Sample" pill next to the existing "Demo" tag (extend `demo-mark.tsx`).

### 4.1 Operator: `/operator` Operator console

- **Purpose:** handle the live chat or call; the module suggests the next question.
- **Layout:** left column "Live now": rows with band chip, docket (mono), channel icon, language, time waiting, "Take call". Right: live transcript, suggested questions, emergency state, voice strip (all exist). Add the **stage chip** in the right-hand header.
- **What happens:** Take call → the case moves to **Being reviewed** (3.2) and the row shows "With you".
- **Samples here:** S2 and S3 (their conversations are left open, **doubt D6**).
- **Empty state:** "No live conversations right now."

### 4.2 Counsellor (and supervisor): `/counsellor` Case queue

- **Purpose:** decide who to help first.
- **Layout:** a real table, most urgent first (current sort stays). Columns: band, docket, **stage chip (new)**, waiting time, main reason, channel icon, assigned to, Demo/Sample tag. Above the table, **stage tabs** with counts: *New · Being reviewed · Support arranged · Follow-up planned · Closed* ("All open" by default). Critical rows unmissable; Low rows quiet.
- **Case page `/counsellor/case/{id}`:** header with docket, band and the stage line; score bar; warning signs with exact words; proposed support with Approve/Reject; **"What the person sees" box**; the three "Mark as" buttons move into one **Change stage** menu (Closed still needs a follow-up or a reason).
- **What happens:** opening a New case → Being reviewed. Approving support → Support arranged, and the person's tracking page shows the support line within 15 s.
- **Supervisor:** sees all of this plus the operator console (no change).
- **Samples here:** all open samples, at least S1, S2, S3.

### 4.3 Approvals: `/approvals` (counsellor, supervisor)

- **Layout:** proposals grouped by urgency (Immediate, within 15 min, 24 h, 72 h). Each row: docket, support type, urgency, due time, band chip, stage chip, Approve / Reject (reason). Auto-triggered emergency support sits in its own "Needs review after the fact" group.
- **What happens:** Approve → case to Support arranged; a referral goes to police or welfare when the support type is theirs (existing behaviour); the row leaves the list live.
- **Samples here:** S1 (review after the fact), S3, S4.

### 4.4 District officer: `/district` District dashboard

- **Layout:** two parts. (1) **"Decisions for you":** police-intervention and witness-protection proposals in the district, with Approve / Reject. (2) **High and Critical cases** in the district: band, SVI, stage chip, waiting time (reduced shape only: no reason, evidence or transcript, as today).
- **What happens:** approving a police proposal → Support arranged and a referral to the police liaison.
- **Samples here:** S1, S2, S4, S5, S6 (all in Pune).

### 4.5 Police liaison: `/police` Action requests

- **Layout:** referral cards in three groups: *New · Accepted / in progress · Done*. A card shows only what the referral holds: docket, action requested, location hint, contact route, urgency, due time, status, and the buttons Accept → Start → Done, or Decline with a reason.
- **Never:** narrative, score, band, indicators, transcript (rule 8, enforced on the server; do not add fields to `ReferralDto`).
- **Samples here:** S5 (new), S6 (in progress).

### 4.6 Welfare officer: `/welfare` Referrals

- Same as police, for welfare support (medical, legal aid, rehabilitation relief).
- **Samples here:** S7 (new), S8 (done).

### 4.7 State admin and Ministry admin: `/analytics`

- No layout change. Samples are demo cases, so the existing "include / exclude demo" filter covers them.
- Note: any number under 5 shows as "<5" on purpose (NFR-PRI-05). With 8 samples most cells will read "<5". That is correct behaviour, not a bug (**doubt D2**).

### 4.8 System admin: `/admin` and Auditor: `/admin/audit`

- These portals hold no case data by design, so "2 cases" does not apply. The admin already sees the 10 seeded users and the demo API key.
- The auditor will see the audit entries that seeding the samples creates (case views, approvals, stage changes). Add a filter option for the new automatic stage-change action.

### 4.9 Alert banner (every staff page) and the beep

- Remember which alerts have already beeped in `sessionStorage` (per tab), so a reload does not beep again.
- At most **one** beep per check, however many new critical alerts arrive; reuse one `AudioContext`.
- Beep again only when an alert **escalates** (its `escalationLevel` goes up).
- Only Critical beeps (as now); High stays silent.
- A mute button in the top bar is **doubt D4**. Do not add it until Anushka says yes (the sound is part of FR-ALR).

---

## 5. Sample cases (fixed, always present)

### 5.1 The set

Eight synthetic cases, all in **Pune (MH-PUN)** so the district, police and welfare portals see them. Docket numbers come from a reserved range `NHAA-2026-MH-9900xx`, so they are easy to recognise and never clash with real demo cases. Every portal shows **at least 2**.

| # | Docket | Language, channel | Target band | Starting stage | Starting state | Shown on |
|---|---|---|---|---|---|---|
| S1 | …-990001 | Hindi, voice | Critical | Support arranged | Emergency support auto-triggered, awaiting review after the fact; critical alert **acknowledged** (so no beep) | Queue, Approvals, District |
| S2 | …-990002 | English, chat | High | Registered | Unassigned; **open High alert** (shows the banner, no beep); conversation open | Queue, Operator, District, alert banner |
| S3 | …-990003 | Hinglish, chat | Moderate | Being reviewed | Counselling **proposed**; conversation open | Queue, Operator, Approvals |
| S4 | …-990004 | Marathi, voice | High | Being reviewed | Witness protection **proposed**, waiting for the district officer | District, Approvals |
| S5 | …-990005 | Hindi, chat | High | Support arranged | Police intervention approved; police referral **pending** | Police, District |
| S6 | …-990006 | English, voice | High | Follow-up planned | Police referral **in progress**; follow-up in 3 days | Police, District |
| S7 | …-990007 | Tamil, chat | Moderate | Support arranged | Rehabilitation relief approved; welfare referral **pending** | Welfare, Queue |
| S8 | …-990008 | Bengali, chat | Low | Closed | Legal aid referral **done**; closed by the counsellor with a reason | Welfare, Queue (Closed tab), tracking |

Messages: 4 to 6 short, calm, non-graphic synthetic turns each, for example a person worried about threats after filing a complaint, a person who lost work after an incident and needs relief, a person who wants legal help. **No self-harm content, no graphic detail, no real names, no caste or community** (rules 10, 11). Hasini drafts them; Anushka reviews the text before the seed is merged.

If the rules do not give the target band in a regional language, change the wording or switch that sample to Hindi or English. **Never type a score or band in by hand.**

### 5.2 How they are made (through the real code, not fake rows)

`scripts/seed-samples.ts` (run as `npm run seed:samples`):
1. Finds the **demo API client** (the one `npm run api:client -- --demo` made). Samples belong to it, so `/track/<docket>` works for them. If it is missing, stop with a clear message.
2. For each sample: creates the interaction with full consent (analysis allowed, `shareWithCounsellor: true`) and sends the messages through the **same module code** the integration API uses. Rules-only mode is fine (no analysis service needed), so scores, bands, warning signs and proposals are real outputs (rule 3).
3. Moves each sample to its starting state with the **same core services** staff use, acting as the seeded demo users (Demo Counsellor approves, Demo District Officer decides, Demo Police Liaison accepts …). That way audit entries and stage changes are real, and the lifecycle (section 3) is tested by the seed itself.
4. Marks every sample `isDemo: true`. `core/cases/samples.ts` exports the definitions and `isSampleDocket()` (reserved range check) for the Sample tag.
5. **Idempotent:** run it twice and nothing doubles. `--reset` puts every sample back to its starting state: deletes the samples' interactions, messages, assessments, indicators, recommendations, referrals, follow-ups and alerts, then makes them again. Audit entries are append-only and stay (that is correct). Samples have no identity record, so nothing in the PII database is touched.
6. Prints only counts and docket numbers, never message text.

**Before each presentation:** `npm run seed:samples -- --reset`. Samples are "static" in that they always start from the same state; during the demo they still react to real staff actions (approve S3's counselling and watch S3's tracking page move), which is the point.

---

## 6. Tasks, in order

Tick each one here when it is done (`[x]`, date, one line). Do not start a task that depends on an open doubt.

- [ ] **H.0 Set up.** Check that `CLAUDE.md` has the update-log block and `docs/anushka_updates.md` exists (2.5); if not, ask Anushka. Branch (2.1); create `docs/hasini_updates.md` (2.5) as your first commit; read `CLAUDE.md`, `NIVARA_FLOW_AND_UI_PLAN.md` §6.4, §6.6, §9 and this file; run the app locally with `npm run seed`; sign in as each role once. Ask Anushka about every doubt in section 8 before H.2.
  *Done when:* the app runs on your laptop, `hasini_updates.md` is pushed with its first entry, and section 8 has answers.
- [ ] **H.1 Lifecycle rules.** `core/cases/lifecycle.ts` + `tests/unit/lifecycle.test.ts`: every row of 3.2, forward-only, closed stays closed, follow-up without support does not jump ahead. Pure.
  *Done when:* tests pass with full coverage of the file.
- [ ] **H.2 Wire the events.** `core/cases/sync-status.ts`; call it from the places in 3.2 (pipeline only if D5 is yes); `statusChangedAt` if D3 is yes; audit entry; `case.updated` after commit.
  *Done when:* unit tests pass, and by hand: open a New case as counsellor → Being reviewed; approve support → Support arranged; schedule a follow-up → Follow-up planned; the queue updates live in a second browser.
- [ ] **H.3 Live tracking page.** 3.4: polling, focus refresh, stop after 30 min, "last checked" line, announcement; "last updated" fix in `status.ts`. `tests/e2e/tracking-live.spec.ts`: open a docket's tracking page, approve its support as counsellor in another context, the page shows "Support arranged" and the support line **without reload** within 20 s.
  *Done when:* e2e passes on desktop and mobile projects; the status response still has exactly five fields (existing test).
- [ ] **H.4 Stage on staff screens.** `case-stage.tsx`; stage chip in the queue, district view, approvals and operator header; stage tabs on the queue; stage line, "What the person sees" box and the Change stage menu on the case page.
  *Done when:* checked in the browser at 1280 px and 375 px; `npm run e2e -- accessibility` still passes.
- [ ] **H.5 Sample cases.** `core/cases/samples.ts`, `scripts/seed-samples.ts`, the `seed:samples` line in `package.json` (ask first), `tests/unit/samples.test.ts` (reserved range, eight definitions, each portal covered at least twice, no forbidden fields). Anushka reviews the message text.
  *Done when:* on an empty database `npm run seed` then `npm run seed:samples` gives every portal at least 2 cases as in 5.1; running it again changes nothing; `--reset` restores the starting states; each sample's tracking page shows its starting stage.
- [ ] **H.6 Alert sound.** 4.9 (mute button only if D4 is yes).
  *Done when:* a reload with open critical alerts makes no sound; a new critical alert beeps once; an escalation beeps once.
- [ ] **H.7 Portal polish.** The layouts in section 4 that are not covered above: police and welfare grouped cards, district "Decisions for you", approvals grouping, written empty states and skeletons everywhere, the Sample tag.
  *Done when:* every portal checked in the browser with the samples, and with an empty database (empty states).
- [ ] **H.8 Words in five languages.** Every new string in `messages/*.json` under one new block (2.2 rule), English plus draft hi, mr, ta, bn; `npm run i18n:check` passes. Note the drafts for native review.
- [ ] **H.9 Finish.** `npm run typecheck && npm run lint && npm test && npm run e2e` all pass; merge `origin/master` one last time; check `hasini_updates.md` has an entry for every task; open the pull request with: what changed, files touched, screenshots of each portal, the doubts answered, and anything still open.

---

## 7. What must not change

- No permission changes (`rbac.ts`) and no new fields in any API response to the person or to police/welfare.
- Scores, bands, overrides and recommendations still come only from `core/scoring` and `core/recommendations`.
- No new service, paid or free, and no new dependency without asking (polling needs none).
- The public portal journey (`/start…`) is Anushka's area and is not part of this plan.

---

## 8. Known doubts: ask Anushka before building on them

| # | Question | Suggested answer (needs Anushka's yes) |
|---|---|---|
| D1 | A person writes again on a docket whose case is **Closed**. Reopen to Being reviewed, or keep it closed and start a new case? | Keep it closed automatically; show staff a "New message on a closed case" note so a human decides. |
| D2 | Analytics shows "<5" for small numbers. Should we also seed a larger anonymous batch (for example from the 62 evaluation scenarios) so the analytics portal has real-looking charts? | Yes, as a separate optional `--analytics` flag, after H.5. |
| D3 | Add `statusChangedAt` (Date) to the case model so "last updated" means a change the person can see? | Yes. Otherwise "last updated" stays as today. |
| D4 | Add a mute button for the critical-alert sound (banner still shows; "Sound off" visible)? | Session-only mute, visible indicator, resets on sign-in. |
| D5 | Call `syncCaseStatus` at the end of the pipeline when emergency support is auto-triggered (`core/pipeline/score.ts`)? | Yes, one line inside the existing transaction. If not, compute the stage at read time for tracking. |
| D6 | S2 and S3 keep an open conversation so the operator console is not empty. Does any job close idle conversations or escalate the open alert over time? | Hasini checks `core/jobs/runDue.ts`; if they change, `--reset` before each demo is enough. |
| D7 | Should police/welfare finishing a referral change anything the person sees (for example "Counselling: done")? | No for now; it would change the status contract. |
| D8 | Should the public `/track` page offer two sample docket numbers ("Try a sample") for the presentation? | Yes, only while `DEMO_ENABLED` is on. |

---

## 9. Doubts log (Hasini fills this in)

Write each doubt as you raise it, then Anushka's answer.

| # | Date | Task | File(s) | Question | Anushka's answer | Date answered |
|---|---|---|---|---|---|---|
| | | | | | | |
