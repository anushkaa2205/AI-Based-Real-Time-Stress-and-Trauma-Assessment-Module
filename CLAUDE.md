# Project instructions

Read this file first in every session. It is the short version of the rules; the full detail is in `docs/`.

## What this project is

An **AI-based real-time stress and trauma assessment module** for victims and complainants contacting the National Helpline Against Atrocities (NHAA 14566) and its portal. Problem statement: Smart India Hackathon 2026, **SIH26093**, Ministry of Social Justice and Empowerment. Built as a Next.js coursework project. Project name: TBD.

The module listens to a victim's text and voice at first contact, detects warning signs, calculates a **Stress Vulnerability Index (SVI, 0–100)**, assigns a risk band (Low / Moderate / High / Critical), recommends support, and puts the highest-risk people in front of a human responder first.

## Documents (source of truth)

| File | Use it for |
|---|---|
| `docs/REQUIREMENTS.md` | What to build. Requirement IDs (`FR-…`, `NFR-…`, `C-…`) and acceptance criteria (`AC-…`). SVI formula, safety overrides and recommendation rules are in its appendices. |
| `docs/ARCHITECTURE.md` | How the parts fit: components, pipeline, flows, security, folder structure. |
| `docs/DATABASE.md` + `docs/models.ts` | MongoDB collections, indexes, transactions, retention. `models.ts` is the reference schema; split it into `web/src/models/`. |
| `docs/API_CONTRACTS.md` | Every endpoint, real-time event, role permission and error code. |
| `docs/TOOLS_AND_COSTS.md` | Which external services and models we use, their free-tier limits, and why. **Everything must stay free.** |
| `docs/IMPLEMENTATION_PLAN.md` | Build order, tasks per phase, and what "done" means for each. **Update the status table there when a task is finished.** |

If code and docs disagree, stop and ask which is right; then fix the one that is wrong. Do not let them drift.

## Rules that must never be broken

These come from the requirements and are the reason the design looks the way it does.

1. **Victims never see scores.** No victim-facing response or screen contains the SVI, the band, indicator names or any diagnostic wording. The only risk signal sent to the victim is `showEmergencyPanel`.
2. **The AI never talks to the victim.** Victim prompts are scripted and pre-translated (i18n keys). LLMs are used only to analyse text.
3. **The AI finds indicators; rules compute the score.** SVI, bands, overrides and recommendations come from the deterministic code in `web/src/core/scoring` and `core/recommendations`. Never ask a model for a score or a band.
4. **Two independent safety paths.** The rule-based safety lexicon runs on every message, in-process, before and regardless of the AI call. If the AI service fails, the pipeline continues in fallback mode. A victim endpoint must never fail because of the AI.
5. **Safety overrides only raise the band.** Only a human, with a written reason, can lower a locked band.
6. **Consent before analysis.** Check the interaction's `mode` before every analysis call. The safety check runs in every mode.
7. **Humans approve actions.** Recommendations are proposals until a counsellor or supervisor approves them (Critical emergency support is the one auto-triggered exception, reviewed afterwards).
8. **Police and welfare roles see referrals only.** No code path may return case narrative, indicators or SVI to them. Enforce on the server, not in the UI.
9. **Privacy.** Encrypt every `…Enc` field. Names, phones and addresses live only in `subject_identities`. Redact PII before any external AI call. Never store raw audio without `audioRetention` consent. Never write victim text to logs or audit metadata.
10. **No caste or community field anywhere**, and never use identity as a risk feature.
11. **Synthetic data only.** No real victim data in code, tests, seeds or prompts. Test scenarios must be respectful and non-graphic.
12. **Every AI evidence quote must exist word-for-word in the source message**, or the indicator is dropped.

## Tech stack

- **Web:** Next.js 16 (App Router), React, TypeScript strict, Tailwind + shadcn/ui, `next-intl` (en, hi, mr, ta, bn), Zod
- **Database:** MongoDB (Atlas, replica set) + Mongoose 9
- **Auth:** Auth.js v5 for staff (credentials + TOTP); random session token for victims; API keys for integrations
- **Real-time:** Pusher Channels Sandbox (SSE fallback locally)
- **AI service:** Python 3.12 + FastAPI in `analysis-service/`, run on a team laptop (Cloudflare Quick Tunnel for the deployed demo)
- **LLM:** Groq `openai/gpt-oss-120b` (use `gpt-oss-20b` while developing); Gemini Flash free tier only as overflow on HTTP 429
- **Speech-to-text:** Groq `whisper-large-v3-turbo` for Hindi/English/Hinglish; AI4Bharat IndicConformer (self-hosted) for Marathi/Tamil/Bengali; Bhashini as backup
- **Voice features:** Silero VAD (pauses), Praat via parselmouth (pitch), librosa (energy), emotion2vec+ base (voice emotion)
- **Hosting:** Vercel Hobby (web), MongoDB Atlas Free, no separate worker (background jobs run inside requests via `core/jobs/runDue()`)
- **Tests:** Vitest (unit), Playwright (end-to-end), pytest (AI service)

## Repository layout

```
web/                 Next.js app
  src/app/           pages and /api/v1 route handlers (victim, staff, integration)
  src/core/          conversation, consent, safety-lexicon, scoring, recommendations,
                     cases, alerts, audit, privacy, policies, analysis-client, pipeline
  src/models/        Mongoose models (one file per collection)
  src/contracts/     Zod schemas = the API contracts
  src/lib/           db.ts, realtime.ts, ratelimit.ts
  messages/          i18n JSON per language
  scripts/           seed.ts, sync-indexes.ts, jobs.ts (local job loop)
  tests/             unit/ and e2e/
analysis-service/    Python FastAPI (text and audio analysis)
evaluation/          synthetic scenarios + run_eval.ts
docs/                the five documents above
```

## Commands

Run from `web/` unless stated otherwise.

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Type-check | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm test` |
| End-to-end tests | `npm run e2e` |
| Seed demo data | `npm run seed` |
| Create indexes | `npm run db:indexes` |
| Background jobs (local loop) | `npm run jobs` |
| Evaluation report | `npm run eval` |
| AI service setup (Windows, from `analysis-service/`) | `py -3.12 -m venv .venv` then `.venv\Scripts\activate` then `pip install -r requirements.txt` |
| AI service run | `uvicorn app.main:app --reload --port 8000` |
| Expose AI service for the deployed demo | `cloudflared tunnel --url http://localhost:8000` (copy the URL into `ANALYSIS_URL`) |

## Coding conventions

- TypeScript strict; no `any` without a comment explaining why.
- Keep `core/scoring`, `core/safety-lexicon` and `core/recommendations` **pure**: no database, no network, no `Date.now()` inside. Inputs in, result out. Target 80%+ unit-test coverage there.
- Every route handler: authenticate → authorise with `core/policies` → validate input with the Zod contract → call a core service → shape the output with the role serialiser.
- All writes of one pipeline run go in one MongoDB transaction; publish real-time events only after commit.
- Use the enum constants exported from the models/contracts; do not retype string literals.
- Victim-facing text goes in `messages/*.json`, never hard-coded. Wording is calm, simple and non-judgemental.
- Errors use the problem+json shape and codes from `docs/API_CONTRACTS.md` §9.
- Reference requirement IDs in comments and commit messages where they help (e.g. `FR-RISK-03`).

## Workflow

1. Pick the next unchecked task in `docs/IMPLEMENTATION_PLAN.md`. Don't skip ahead of a phase's dependencies.
2. Read the requirement and acceptance criteria it cites before writing code.
3. Write the tests named in the task alongside the code.
4. Before calling a task done: `npm run typecheck && npm run lint && npm test` all pass, and the acceptance criteria listed for it are met.
5. Tick the task in the plan and update the status table.
6. Small commits, one concern each. Never commit `.env*` files or secrets.

## Secrets and environment

Copy `web/.env.example` to `web/.env.local` and `analysis-service/.env.example` to `analysis-service/.env`.

- Web: `MONGODB_URI`, `MONGODB_PII_URI`, `ENCRYPTION_KEYS`, `ENCRYPTION_ACTIVE_KEY`, `AUTH_SECRET`, `ANALYSIS_URL`, `ANALYSIS_HMAC_SECRET`, `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`, `JOBS_SECRET`
- Analysis service: `ANALYSIS_HMAC_SECRET`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `HF_TOKEN`, optional `BHASHINI_USER_ID`, `BHASHINI_API_KEY`

Never print, log or commit their values.

## Working rules for Claude Code

1. **One task at a time.** Work only on the task named in the request (e.g. "task 1.3"). If you notice other problems, list them at the end instead of fixing them.
2. **Plan first for anything non-trivial.** Before writing code, state the files you will create or change and how you will test them, then proceed.
3. **Read before writing.** Read the requirement IDs and acceptance criteria the task cites, and the relevant section of `ARCHITECTURE.md`, `DATABASE.md` or `API_CONTRACTS.md`.
4. **Docs are the spec.** Do not change `docs/` to match code. If the spec looks wrong or impossible, stop and say so.
5. **Stay free.** Do not add any paid service, API or SDK, or any service not listed in `docs/TOOLS_AND_COSTS.md`. Ask before adding a new dependency and say why it is needed.
6. **Never weaken a safety rule** in the "must never be broken" list above to make something work or a test pass. Never delete or skip a failing test to get a green run.
7. **Prove it works.** Finish every task by running `npm run typecheck`, `npm run lint` and `npm test` (and `pytest` for `analysis-service/`), and report the results. Do not claim something works without running it.
8. **No secrets.** Never hard-code keys or connection strings; never print `.env` values.
9. **Finish cleanly.** Tick the task in `docs/IMPLEMENTATION_PLAN.md`, update the status table, and suggest a commit message (one concern per commit).
10. **Windows.** The team works on Windows: prefer cross-platform npm scripts; give PowerShell-compatible commands.

## Current status

See the status table at the top of `docs/IMPLEMENTATION_PLAN.md`.
