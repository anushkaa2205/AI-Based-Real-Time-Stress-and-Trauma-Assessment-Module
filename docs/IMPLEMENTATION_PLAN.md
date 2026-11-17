# Implementation Plan
## AI-Based Real-Time Stress and Trauma Assessment Module (SIH26093)

> Companion documents: `REQUIREMENTS.md` (requirement and acceptance IDs), `ARCHITECTURE.md`, `DATABASE.md`, `models.ts`, `API_CONTRACTS.md`, `TOOLS_AND_COSTS.md` (free-tier limits), `PRODUCT_VISION.md` (what the product is; Phase M). The superseded Phase F documents (`FRONTEND_UX_PRODUCT_BRIEF.md`, `checklist.md`, `FRONTEND_AUDIT.md`) were deleted on 17 Nov 2026; git history keeps them. Project rules: `/CLAUDE.md`.

## Status

Update this table as work finishes.

| Phase | Milestone | Status |
|---|---|---|
| 0. Project setup | M1 Walking skeleton | Done (0.6 finished: Atlas, Groq, Gemini, Pusher and Hugging Face set up; IndicConformer access granted) |
| 1. Foundation: data, security, staff login | M1 Walking skeleton | Done (verified on Atlas: indexes, seed, all 10 roles log in, police 403) |
| 2. Scoring core (no AI) | M2 Text MVP | Done (2.1–2.10; coverage 98% on scoring folders) |
| 3. Victim text flow | M2 Text MVP | Done (unit + Playwright on desktop and mobile; rules-only baseline 75% recorded) |
| 4. AI text analysis | M2 Text MVP | In progress: 4.1–4.9 done and verified live (Groq + Gemini overflow); 4.10 results recorded, weight tuning waits for reviewed labels; text latency p95 4.2 s in dev (target 3 s) |
| 5. Responder dashboards and live alerts | M3 Responder loop | Done (5.1–5.9; verified with Pusher: Critical alert on screen in under 5 s; 13 Playwright tests pass. 5.5 auto-assignment (S) deferred) |
| 6. Recommendations, referrals, stakeholder views | M3 Responder loop | Done (6.1–6.8; AC-REC-03/05, AC-DSH-01/03 pass in Playwright. AC-REC-01/02 covered by the Phase 2 engine tests and the eval set. AC-ALR-01's 5 s check failed on the last run only because Atlas round trips were ~200 ms instead of ~37 ms; re-run on a normal network) |
| 7. Voice, operator console, IVRS | M4 Voice | Done except 7.9 (C, needs storage not in the free list) and crying detection in 7.6 (S). Spike (D4) on the team laptop: ~2 s per 5 s window in the service, ~2 GB RAM with all models; windows scored and pushed in 3.2–3.7 s on a prod build. AC-CH-02/03, AC-VOI-01…06, AC-EMO-01 tested |
| 8. Languages, analytics, integration API, admin | M5 Feature complete | Done (8.1–8.7). AC-LANG-01, AC-DSH-02, AC-API-01/02 pass; AC-LANG-03 reported (rules-only, 2 scenarios per regional language). Open: native-speaker review (8.1), AC-LANG-02 language-detection rate needs an AI-mode evaluation run, AC-LANG-04 partly met (translation shown, evidence highlighted in the original only) |
| 9. Evaluation, hardening, deployment, demo | M6 Demo-ready | In progress: 9.1–9.7 done (see docs/EVALUATION_REPORT.md; band accuracy 79% and text p95 3.43 s just miss targets); 9.8 needs volunteers; 9.9–9.11 deferred until the project is finished |
| E. Evaluation set (runs alongside phases 2–9) | all | In progress: 62 draft scenarios (E.3 needs a second reviewer); E.4 voice recordings by the team not done |
| F. Victim-facing frontend (homepage, unified input) | – | **Stopped 16 Nov 2026** after F.2 (`PRODUCT_VISION.md`): the victim website is not part of the product. F.0–F.2 done; F.3–F.6 cancelled; the F.2 pages are removed in M.2 |
| N. Public site, public demo, tracking and the Nivara UI (`NIVARA_FLOW_AND_UI_PLAN.md`) | M6 Demo-ready | **Done 16 Nov 2026 (N.1–N.11):** public home page with the demo starter, three public demo inputs ending in a docket ID (Phase P replaces these with the portal journey and two inputs), tracking page, `GET /cases/{docket}/status` (contract 1.2), public safeguards, login restyled, Nivara design foundation and staff portals restyled, generated text removed, e2e rewritten. Open: native review of `track.*` strings. N.12 deployment prep is folded into P.10; the library recordings question (old plan §13.1) is settled by P-D3 (no recordings on the public site) |
| P. The portal journey (`NIVARA_FLOW_AND_UI_PLAN.md`, revised 17 Nov 2026) | M6 Demo-ready | In progress: P.1–P.9 done (17 Nov 2026; the full e2e run waits for database access); P.10 to do. |
| M. Module contract and demo input layer | M6 Demo-ready | Done: M.1–M.14 done (16 Nov 2026): module-only, text and voice, no questionnaire; answers read with their question; two-voice audio separated; indicators with evidence for authorised callers; input method and contract version; all four demo modes through the integration API (two remain since Phase P: live text and live microphone), cases marked Demo. Open: AI-mode evaluation re-run; native review of regional rules and questions; speaker separation on real recordings; voice-window latency re-run |

---

## 1. How this plan is organised

**Build order principle:** the deterministic parts come before the AI. The scoring engine and safety lexicon are built and tested first (Phase 2), so the whole system works end to end with rules alone (Phase 3). The AI is then added as one more source of indicators (Phase 4). This keeps every later phase testable and means the fallback mode required by NFR-REL-01 exists from the start.

**Effort figures** are rough estimates in person-days, not commitments. The deadline and team size (C-PRJ-01) are not yet known; once they are, map phases to dates.

| Milestone | Phases | What you can demo | Rough effort |
|---|---|---|---|
| **M1 Walking skeleton** | 0–1 | App runs, database connected, staff can log in per role, seed data loads | 5–7 days |
| **M2 Text MVP** | 2–4 | A victim chats in Hindi or English; the system produces an SVI, band and evidence | 13–17 days |
| **M3 Responder loop** | 5–6 | Counsellor sees a live risk-sorted queue, gets a Critical alert, approves a recommendation; police see a minimal action request | 11–14 days |
| **M4 Voice** | 7 | Simulated call with live transcript, pauses, pitch and SVI on the operator console; IVRS menu | 8–11 days |
| **M5 Feature complete** | 8 | Five languages, analytics for state and ministry, integration API, admin screens | 8–10 days |
| **M6 Demo-ready** | 9 | Evaluation report, deployed demo, rehearsed script | 6–8 days |
| | | **Total** | **≈ 51–67 person-days** |

**If time is short (minimum that still answers the problem statement):** M1 → M2 → M3, then from Phase 7 only tasks 7.1–7.5 (voice analysis and the operator console, without IVRS), then Phase 9. Every "Expected Solution" point is then covered; what is lost is breadth (IVRS, three regional languages, analytics depth, integration API). Items marked **(S)** or **(C)** in this plan are Should/Could priority and are the first to drop.

**Suggested split for a team of four** (adjust to your team):

| Track | Owns | Phases |
|---|---|---|
| A. Core and scoring | `core/scoring`, `safety-lexicon`, `recommendations`, `pipeline`, evaluation runner | 2, 3 (pipeline), 9 (evaluation) |
| B. Victim experience | Victim UI, conversation flow, i18n, consent, accessibility, PWA | 3, 7 (capture), 8 (languages) |
| C. Staff and platform | Models, auth, policies, dashboards, real-time, job runner, analytics | 1, 5, 6, 8 |
| D. AI service | `analysis-service` (text, audio), prompts, guardrails, evaluation scenarios | 4, 7, E |

**Definition of done for any task:** type-check, lint and unit tests pass; the acceptance criteria named for the task are met; no rule in `CLAUDE.md` is broken; the task is ticked here.

---

## 2. Decisions needed

| # | Decision | Needed before | Default if not decided |
|---|---|---|---|
| D1 | Deadline and team size | Now | Follow milestone order; cut at the line in §1 |
| D2 | ~~Project name~~ **Decided (16 Nov 2026, Phase N):** Nivara | — | — |
| D3 | ~~LLM provider~~ **Decided:** Groq `openai/gpt-oss-120b` (development: `gpt-oss-20b`), Gemini Flash free tier as overflow | — | Behind one interface in `analysis-service/app/text/llm.py` |
| D4 | ~~Speech-to-text~~ **Decided:** Groq Whisper for Hindi/English/Hinglish; self-hosted AI4Bharat IndicConformer for Marathi/Tamil/Bengali; Bhashini as backup | — | Confirm laptop speed and RAM in the Phase 7 spike |
| D5 | Three regional languages | Phase 8 | Marathi, Tamil, Bengali (as proposed in FR-LANG-01) |
| D6 | ~~Local MongoDB~~ **Decided:** Atlas Free for development and demo (no Docker) | — | — |
| D7 | ~~Hosting~~ **Decided:** web on Vercel Hobby; analysis service on a team laptop behind a Cloudflare Quick Tunnel; no separate worker (jobs run inside requests) | — | See `TOOLS_AND_COSTS.md` |
| D8 | ~~Front door~~ **Decided (15 Nov 2026):** the public home page `/` is a calm victim-facing entry point; the victim intake pages live under `/portal/<locale>`. The NHAA simulator planned earlier is dropped (code, cases and spec removed) | — | See `FRONTEND_UX_PRODUCT_BRIEF.md`, `checklist.md` *Superseded 16 Nov 2026 by PRODUCT_VISION.md (no victim website) and again by `NIVARA_FLOW_AND_UI_PLAN.md` (Phase N): `/` is the public home page of the demo input layer with the demo starter and a Staff login button; since Phase P (17 Nov 2026) it starts the portal journey with one **Start** button.* |

---

## Phase 0. Project setup

**Goal:** an empty but runnable project with tooling, so every later task starts from a working base.
**Effort:** 1–2 days. **Depends on:** nothing.

- [x] **0.1 Repository layout.** Create `web/`, `analysis-service/`, `evaluation/`, `docs/`. Add `.gitignore` (node_modules, `.next`, `.env*`, `__pycache__`, `.venv`, audio files), `.editorconfig`, root `README.md`.
- [x] **0.2 Next.js app.**
  ```bash
  npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
  cd web
  npm i mongoose zod next-auth@beta bcryptjs otplib pusher pusher-js next-intl
  npm i -D vitest @vitest/coverage-v8 @playwright/test tsx @types/bcryptjs prettier
  npx shadcn@latest init
  ```
  Turn on `"strict": true` and `"noUncheckedIndexedAccess": true` in `tsconfig.json`.
- [x] **0.3 Scripts in `web/package.json`:** `dev`, `build`, `typecheck` (`tsc --noEmit`), `lint`, `test` (`vitest run`), `test:cov`, `e2e`, `seed`, `db:indexes`, `jobs`, `eval`.
- [x] **0.4 Folders from `ARCHITECTURE.md` §13:** `src/core/*`, `src/models`, `src/contracts`, `src/lib`, `messages/`, `scripts/`, `tests/unit`, `tests/e2e`.
- [x] **0.5 Environment.** `web/.env.example` with every key from `CLAUDE.md`; `src/lib/env.ts` validates them with Zod at start-up and fails with a clear message.
- [x] **0.6 Database and accounts.** Create the Atlas Free cluster and two databases, `nhaa_assess` and `nhaa_pii`. Create free accounts and keys: Groq, Google AI Studio (Gemini), Pusher (Sandbox), Hugging Face (accept the IndicConformer model terms).
- [x] **0.7 CI.** GitHub Actions workflow: install, type-check, lint, unit tests on every push.
- [x] **0.8 Python service skeleton.** `analysis-service/` with a virtual environment, FastAPI, `GET /v1/health`, `requirements.txt`, `.env.example`, `ruff` and `pytest` configured. Runs locally with `uvicorn`; no Docker needed.

**Done when:** `npm run dev` shows a page; `npm run typecheck && npm run lint && npm test` pass; the health endpoint of the Python service answers; CI is green.

---

## Phase 1. Foundation: data, security, staff login

**Goal:** the data model, encryption, audit log, role-based access and staff sign-in.
**Effort:** 4–5 days. **Depends on:** Phase 0.

- [x] **1.1 Database connection.** `src/lib/db.ts` (cached Mongoose connection, `DATABASE.md` §10.1) and `src/lib/pii-db.ts` (separate connection for `subject_identities`).
- [x] **1.2 Models.** Split `docs/models.ts` into `src/models/<name>.ts`, with shared enums in `src/models/enums.ts`. Bind `SubjectIdentity` to the PII connection. `scripts/sync-indexes.ts` runs `syncIndexes()` on every model. *First real check of the indexes against MongoDB: fix anything it rejects and update `DATABASE.md`.*
- [x] **1.3 Field encryption.** `src/core/privacy/crypto.ts`: `encrypt()` / `decrypt()` with AES-256-GCM, key IDs and rotation (`DATABASE.md` §8.1). Unit tests: round trip, wrong key fails, tampered text fails, old key still decrypts.
- [x] **1.4 PII redaction.** `src/core/privacy/redact.ts`: phone numbers, emails, 12-digit ID numbers, PIN codes, and names/addresses supplied from context → `[PHONE]`, `[NAME]`, … Unit tests with Hindi, Hinglish and English samples. (NFR-SEC-05, AC-SEC-02)
- [x] **1.5 Audit log.** `src/core/audit/record.ts` with the hash chain and retry on fork (`DATABASE.md` §9); `verifyChain()`. Tests: chain verifies; editing an entry breaks verification. (FR-AUD-01…03)
- [x] **1.6 Staff authentication.** Auth.js v5 credentials provider with bcrypt; TOTP step with `otplib` for supervisor, state, ministry, admin and auditor roles; 15-minute idle timeout; `/login` page. (NFR-SEC-02/03)
- [x] **1.7 Policies.** `src/core/policies/rbac.ts`: one `can(user, action, resource)` function built from the matrix in `API_CONTRACTS.md` §4, including district and state scoping. `serializers.ts`: per-role output shapes. Table-driven unit tests covering every cell of the matrix. (NFR-PRI-02)
- [x] **1.8 Route helper.** `src/lib/route.ts`: wraps a handler with authentication, policy check, Zod validation, problem+json errors and request IDs, so every endpoint follows the same steps.
- [x] **1.9 Rate limiting and security headers.** `src/lib/ratelimit.ts` with MongoDB fixed-window counters (TTL-indexed); CSP, HSTS and frame headers in `next.config`. (NFR-SEC-04)
- [x] **1.10 Seed script.** `scripts/seed.ts`: a few states and districts; one user per role; scoring config v1 from `REQUIREMENTS.md` Appendices A–C; one API client.
- [x] **1.11 Staff shell.** Layout for `(staff)` with a sidebar that changes per role and an empty home page for each role. `GET /api/v1/staff/me`, `PATCH /me/duty`, `GET /health`.

**Done when:** each seeded role can log in and lands on its own page; a police user requesting a counsellor page gets 403; unit tests for crypto, redaction, audit and policies pass; AC-PRI-01 holds (identifiers and assessment data are in separate collections).

---

## Phase 2. Scoring core (no AI)

**Goal:** the deterministic heart of the system: lexicon → indicators → dimension scores → SVI → band → overrides → recommendations. Pure TypeScript, no database.
**Effort:** 5–6 days. **Depends on:** Phase 0 (can run in parallel with Phase 1).

- [x] **2.1 Types and config.** `src/core/scoring/types.ts`; `defaultConfig.ts` with the weights, thresholds, voice-only cap, override rules and recommendation rules from the appendices; a Zod schema that rejects weights not summing to 1 or thresholds out of order.
- [x] **2.2 Screener scoring.** `src/core/screeners/`: item definitions and scoring for the safety check, PHQ-2, GAD-2, PC-PTSD-5 and the suicide-risk screen; mapping from screener results to dimensions. (FR-SCR-02, AC-SCR-02) *Removed 16 Nov 2026 in M.2/M.3: no screeners (PRODUCT_VISION.md §5).*
- [x] **2.3 Context mapping.** `contextToIndicators()`: case context → EXTREME_VULNERABILITY, INTIMIDATION and others. (FR-IND-02)
- [x] **2.4 Fusion.** `fuse.ts`: maximum within a source, confidence-weighted average across sources, reviewed indicators replace AI values, rejected and negated ones excluded, voice-only cap of 0.6. (FR-IND-03, FR-VOI-08)
- [x] **2.5 SVI and bands.** `svi.ts`, `bands.ts`: 0–100 integer, per-dimension contributions that add up to the SVI (±1), overall confidence. (FR-SVI-01/03/04, FR-RISK-01)
- [x] **2.6 Safety overrides.** `overrides.ts`: rules OV-1…OV-8, raise-only, respects a locked band. (FR-RISK-02/03)
- [x] **2.7 Explanation.** `explain.ts`: one plain sentence per assessment in English and Hindi. (FR-RISK-04)
- [x] **2.8 Safety lexicon.** `src/core/safety-lexicon/engine.ts` + `rules/en.json`, `hi.json`, `hinglish.json`: suicidal ideation (explicit and indirect), immediate danger, threats, pressure to withdraw, isolation; negation window; Romanised spelling variants. Returns indicators with exact character spans. (FR-NLP-10, FR-NLP-08)
- [x] **2.9 Recommendation engine.** `src/core/recommendations/evaluate.ts`: assessment + indicators → proposed recommendations with reason, urgency, responsible role and legal basis. (FR-REC-01…04)
- [x] **2.10 Unit tests.** At least: 10 hand-calculated SVI examples; one test per override; determinism (same input twice → identical output); lexicon positives, negatives and negation cases per language; all six support types reachable. Coverage ≥ 80% for these folders.

**Done when:** AC-SVI-01, AC-SVI-03, AC-SVI-04, AC-RISK-02, AC-RISK-03 and AC-MNT-01 pass as unit tests; the lexicon runs in under 50 ms per message (NFR-PERF-04).

---

## Phase E. Evaluation set (runs alongside Phases 2–9)

**Goal:** the labelled synthetic scenarios that every accuracy criterion depends on (AC-EVAL-01).
**Effort:** 4–5 days in total, spread out. **Owner:** Track D with review by a second person.

- [x] **E.1 Format.** `evaluation/scenarios/<id>.json`: language, channel, context, ordered messages or screener answers, expected band, expected indicators, expected recommendations, tags (`negation`, `dialect`, `voice`). Zod schema plus a validator script.
- [x] **E.2 First 20 text scenarios** (5 per band; Hindi, Hinglish, English), ready by the end of Phase 2 so the lexicon can be tuned against them.
- [ ] **E.3 Grow to 60+**: at least 15 per band; 10+ each in Hindi, Hinglish and English; 5 per regional language; 10+ negation or tricky cases. Two people agree on each label. *62 scenarios drafted (15+ per band, 5 per regional language, 11 tricky); second reviewer still needed.*
- [ ] **E.4 Voice recordings**: 15+ scripted recordings by team members (calm, hesitant with long pauses, agitated), plus reference files for pause and pitch checks (AC-VOI-01/02).
- [ ] **E.5 Runner.** `evaluation/run_eval.ts`: runs every scenario through the pipeline and reports band accuracy, confusion matrix, recall and precision per dimension, results per language, gender and channel, and latency. Output as Markdown and JSON.

**Rules:** synthetic only; respectful; no graphic detail (C-DAT-01, C-DAT-03).

---

## Phase 3. Victim text flow

**Goal:** a victim can start a session, give consent, answer the safety check, tell their story by text and finish, with every message scored by the rules from Phase 2. No AI service yet.
**Effort:** 5–6 days. **Depends on:** Phases 1 and 2.

- [x] **3.1 Contracts.** Zod schemas for every victim endpoint in `API_CONTRACTS.md` §3 (`src/contracts/victim.ts`).
- [x] **3.2 Victim session.** `POST /victim/interactions`: creates subject, case (new docket or attach to an existing one) and interaction; sets the HttpOnly session cookie; stores only the token hash. Session middleware bound to one interaction. (FR-CH-07)
- [x] **3.3 Consent.** `src/core/consent/`: choices → assessment mode. Endpoints `/consent`, `/consent/withdraw`, `/consent-notices/{version}`. Consent notice text and audio placeholder per language. (FR-CON-01…06)
- [x] **3.4 Conversation engine.** `src/core/conversation/flow.ts`: state machine (greeting → consent → safety check → optional context → open narrative → adaptive screeners → close). Prompts are i18n keys; every question skippable; resume after reload via `GET /next`. (FR-CH-01/09/10) *Removed 16 Nov 2026 in M.2: the module has no question flow.*
- [x] **3.5 Pipeline v1.** `src/core/pipeline/run.ts`: consent check → store message (encrypted) → lexicon → fuse → SVI → band → overrides → save assessment → update case → recommendations → alert record. One transaction; idempotency key honoured (`DATABASE.md` §6).
- [x] **3.6 Remaining victim endpoints.** `/messages`, `/screeners`, `/context`, `/language`, `/callback-request`, `/end`. *Removed 16 Nov 2026 in M.2: no victim API; the integration API is the only input.*
- [x] **3.7 Victim UI.** `[locale]/(victim)`: start page with language choice, consent screen with separate toggles and audio, chat screen, emergency panel (112, Tele-MANAS 14416, NHAA 14566, "call me back"), quick-exit button on every screen, closing page with the docket number. Large touch targets, simple wording.
- [x] **3.8 i18n.** `next-intl` with `messages/en.json` and `messages/hi.json`; script `check-i18n.ts` fails if any key is missing in any language. (AC-LANG-01 for the first two languages)
- [x] **3.9 Tests.** Playwright: full Hindi flow; all consent declined still files the complaint and runs the safety check; withdrawing consent stops analysis; quick exit; a safety-check "yes" to suicidal thoughts shows the emergency panel. A response-shape test asserts that no victim response contains `svi`, `band` or `dimension`.

**Done when:** AC-CH-01, AC-CH-04, AC-CH-05, AC-CON-01…05, AC-SCR-01 and AC-SCR-03 pass; band accuracy on the first 20 scenarios is recorded as the rules-only baseline.

---

## Phase 4. AI text analysis

**Goal:** add language detection, translation, LLM-based indicator extraction with evidence, and text emotion; keep the fallback working.
**Effort:** 5–6 days. **Depends on:** Phase 3. Provider: Groq (D3).

- [x] **4.1 Service security.** HMAC signature and timestamp check on every request to `analysis-service`.
- [x] **4.2 Language ID and translation.** Unicode script detection plus the LLM (same call as 4.3) for language and Romanised Hindi; English translation returned by the same LLM call. (FR-NLP-06, FR-LANG-03)
- [x] **4.3 Indicator extraction.** Prompt with strict JSON schema output: for each of the 8 dimensions, score, confidence, exact evidence quote, `negated` flag and a short rationale; temperature 0; compact few-shot examples (keep the whole prompt ≤ 1,500 tokens because of Groq's 8K tokens/minute free limit), including negation and indirect phrasing; the prompt forbids diagnostic wording. Fall back to Gemini on HTTP 429. Map English evidence back to the original-language span. (FR-NLP-01…08)
- [x] **4.4 Text emotion.** Six classes (fear, sadness, anger, shame, shock/numbness, neutral) with confidence. (FR-EMO-01)
- [x] **4.5 Endpoint.** `POST /v1/analyze/text` exactly as in `API_CONTRACTS.md` §8.1, with pytest tests using recorded model responses. Cache responses by input hash (on disk) so evaluation re-runs do not use up the free quota.
- [x] **4.6 Analysis client.** `src/core/analysis-client/`: typed client, 2.5 s timeout, circuit breaker, returns `{degraded: true}` on failure.
- [x] **4.7 Guardrails.** Validate the response against the Zod schema; drop any indicator whose quote is not found word-for-word at the given span; clamp scores; reject unknown dimensions. (AC-NLP-05)
- [x] **4.8 Pipeline v2.** Redact → call AI in parallel with nothing blocking the lexicon → merge indicators → store translation. On failure: continue, mark `limitedConfidence`, queue a `rescore` job. (NFR-REL-01)
- [x] **4.9 Case summary.** `POST /v1/summarize`; neutral summary stored encrypted when the interaction ends. **(S)** (FR-NLP-09)
- [ ] **4.10 Tuning.** Run the evaluation set; adjust prompt, lexicon and weights; record results.

**Done when:** AC-NLP-01 and AC-NLP-02 (100% recall for suicidal ideation and immediate danger), AC-NLP-03, AC-NLP-04, AC-NLP-06 (lexicon alone still catches them with the AI switched off), AC-NLP-07, AC-REL-01 and AC-SVI-02 (text within 3 s) pass. **Milestone M2.**

---

## Phase 5. Responder dashboards and live alerts

**Goal:** counsellors and operators see cases in risk order, with evidence, and are alerted the moment a case becomes Critical.
**Effort:** 6–7 days. **Depends on:** Phases 1 and 3 (Phase 4 is not required to start).

- [x] **5.1 Real-time layer.** `src/lib/realtime.ts` with two drivers (Pusher, local SSE); `POST /api/v1/realtime/auth` applying the same policies as REST; event envelope from `API_CONTRACTS.md` §7. Pipeline publishes after commit.
- [x] **5.2 Case queue.** `GET /staff/cases` with filters and cursor pagination, sorted band ↓, SVI ↓, waiting time ↑. Queue page with band shown as colour **and** text, top reason, waiting time, live updates. (FR-CASE-01, FR-RISK-05)
- [x] **5.3 Case detail.** `GET /staff/cases/{id}` and the interaction endpoints (transcript, assessments, indicators). Page shows: SVI gauge and timeline, dimension breakdown, indicators with highlighted evidence in the original text and translation, screener results, consent status, context. (FR-CASE-03, FR-SVI-03/05, FR-LANG-06)
- [x] **5.4 Indicator review.** `PATCH /staff/indicators/{id}`: confirm, reject or adjust with a reason; SVI recalculated immediately; original value kept. (FR-IND-05)
- [x] **5.5 Band override, notes, status, assignment.** `POST /cases/{id}/band-override` (reason required), notes, `PATCH /cases/{id}`; auto-assignment by language, district and workload **(S)**. (FR-CASE-02/04/05) *Done except the (S) auto-assignment, which is deferred; assignment is manual.*
- [x] **5.6 Alerts.** Create an alert when the band rises to High or Critical; banner with sound for Critical on any staff page; acknowledge and resolve endpoints; polling fallback every 10 s if real time is down. (FR-ALR-01/02/04)
- [x] **5.7 Job runner.** `src/core/jobs/runDue()`: claims up to 5 due jobs atomically and runs handlers for `alert.escalate` (counsellors → supervisor → district) and `rescore`. Called at the end of `GET /staff/alerts` (polled every 10 s by every staff dashboard) and from `POST /api/v1/internal/jobs/run` (secret-protected); `npm run jobs` loops it locally. No separate worker process. (FR-ALR-03)
- [x] **5.8 Audit.** Audit entries for case view, transcript view, identity view, review, override. Identity endpoint with consent check.
- [x] **5.9 Tests.** Playwright with two browser sessions: a victim message that triggers Critical appears on the counsellor screen within 5 s without refresh; unacknowledged alert escalates; override without a reason is blocked; queue order with 20 seeded cases.

**Done when:** AC-CASE-01, AC-CASE-02, AC-IND-02, AC-ALR-01, AC-ALR-02, AC-AUD-01 and AC-RISK-04 pass.

---

## Phase 6. Recommendations, referrals and stakeholder views

**Goal:** close the loop from risk to action, with each stakeholder seeing only what they need.
**Effort:** 5–7 days. **Depends on:** Phase 5.

- [x] **6.1 Approval inbox.** `GET /staff/recommendations`, `POST /recommendations/{id}/decision` (approve, reject, post-review of auto-triggered emergency support). Approval creates the referral; text limited to 300 characters with a warning not to include clinical detail. (FR-REC-05/07)
- [x] **6.2 Emergency path.** Critical band auto-triggers EMERGENCY_SUPPORT, shows the victim's emergency panel through the `emergency.show` event, and handles callback requests. (FR-REC-06)
- [x] **6.3 Referral endpoints.** List, detail and status updates with allowed transitions. (FR-REC-08)
- [x] **6.4 Police liaison view.** Action requests only. Add an automated test that a police user calling case, transcript, indicator and assessment endpoints directly receives 403 on each. (FR-DSH-04, AC-DSH-01, AC-REC-05)
- [x] **6.5 Welfare view.** Rehabilitation, relief, legal-aid and medical referrals. **(S)** (FR-DSH-05)
- [x] **6.6 District dashboard.** High and Critical cases in the district (band and SVI only), pending referrals, missed deadlines, escalated alerts. (FR-DSH-03)
- [x] **6.7 Follow-ups.** Schedule on closing a High or Critical case; reminders through the job runner. **(S)** (FR-REC-09)
- [x] **6.8 Tests.** One Playwright journey per role confirming it sees its own dashboard and nothing else. (AC-DSH-03)

**Done when:** AC-REC-01…05, AC-DSH-01 and AC-DSH-03 pass. **Milestone M3.**

---

## Phase 7. Voice, operator console and IVRS

**Goal:** analyse voice (pauses, pitch, speech rate, emotion) in rolling windows and show it live to an operator.
**Effort:** 8–11 days. **Depends on:** Phases 4 and 5. Engines decided in D4. *Highest technical risk: start with a one-day spike on 7.2: measure seconds per 5-second chunk and RAM with IndicConformer + emotion2vec+ loaded on the team laptop, before committing to the rest.*

- [x] **7.1 Capture.** Victim voice page using MediaRecorder with 5-second chunks, visible recording indicator, mute and stop, upload with retry, graceful switch to text if the microphone is refused. (FR-CH-03, C-TEC-04, NFR-REL-02)
- [x] **7.2 Audio analysis.** `POST /v1/analyze/audio`: decode → Silero VAD → pauses (count, mean, max, silence ratio) → Praat pitch mean, spread and range → energy (librosa) → speech-to-text (Groq Whisper for hi/en/Hinglish; IndicConformer for mr/ta/bn; Bhashini backup) → speech rate = transcript words ÷ voiced seconds. (FR-VOI-01…04)
- [x] **7.3 Speaker baseline.** First 20–30 s of speech set the baseline; later windows report deviations from it. (FR-VOI-03)
- [x] **7.4 Voice emotion.** emotion2vec+ base (via FunASR) with confidence; start with a simple rule-based mapping from the deviations if the model is too heavy. (FR-VOI-06)
- [x] **7.5 Pipeline v3 and operator console.** `POST /victim/…/audio` → features stored in `voice_windows`, raw audio discarded → transcript through the text pipeline → voice indicators (capped) → fused emotion. Operator console: live transcript, SVI gauge, indicator chips with evidence, pause and pitch strip, suggested next questions, "type what the caller said" input. (FR-CH-04, FR-VOI-07/09, FR-EMO-02, FR-DSH-01)
- [x] **7.6 Paralinguistic events.** Crying, sobbing, long silence after a question. **(S)** (FR-VOI-05) *Long silences done; crying/sobbing needs the optional YAMNet tagger and is not built.*
- [x] **7.7 Emotion timeline.** Chart of text, voice and fused emotion across the session. **(S)** (FR-EMO-03)
- [x] **7.8 IVRS simulation.** Keypad page with spoken prompts: language choice, safety check, PHQ-2 and GAD-2 by key press. **(S)** (FR-CH-05) *Removed 16 Nov 2026 in M.2: no keypad input.*
- [ ] **7.9 Audio retention.** Only with consent: encrypted object storage, deletion job. **(C)** *Not built: no free object storage is listed in TOOLS_AND_COSTS.md. Without it, audio is never stored at all (AC-VOI-06).*
- [x] **7.10 Tests.** Reference recordings: 5 inserted pauses detected within ±0.3 s; pitch within ±10%; speech rate within ±15%; no stored audio after a session without retention consent; no scenario reaches Critical on voice alone.

**Done when:** AC-CH-02, AC-VOI-01…07, AC-EMO-01 and the voice part of AC-SVI-02 (within 5 s) pass; AC-CH-03 if IVRS is built. **Milestone M4.**

---

## Phase 8. Languages, analytics, integration API and admin

**Goal:** breadth: all five languages, the national and state view, the plug-in API and configuration screens.
**Effort:** 8–10 days. **Depends on:** Phases 5–7 (sub-tracks are independent of each other).

- [x] **8.1 Regional languages.** `messages/mr.json`, `ta.json`, `bn.json` reviewed by native speakers; lexicon rule files for each; consent and safety-check audio; screeners translated. Regional-language scenarios added to the evaluation set. (FR-LANG-01/02/04/05) *Done as drafts: native-speaker review of the translations and lexicon rules is still needed; consent and safety-check audio still use the browser's speech (no recordings yet).*
- [x] **8.2 Analytics roll-up.** `stats.rollup` job filling `daily_stats`; endpoints `/analytics/summary`, `/heatmap`, `/trends`, `/capacity`; counts below 5 suppressed. (FR-DSH-06)
- [x] **8.3 Analytics screens.** State and ministry dashboards: cases by band, district heat map, indicator trends, time to first response, referral completion, demand against capacity; filters; CSV export **(C)**. (FR-DSH-07/08)
- [x] **8.4 Integration API.** `/api/v1/integration/*` with API-key authentication, scopes, per-key rate limits and the SSE stream; a small example script that runs a full interaction. (FR-API-01…04)
- [x] **8.5 OpenAPI.** Generate the specification from the Zod contracts and serve it at `/api/docs`.
- [x] **8.6 Admin.** Users and API clients; scoring configuration versions with create, simulate against the evaluation set, and activate; audit log viewer and chain verification. **(S)** (FR-SVI-06)
- [x] **8.7 Retention.** Set `purgeAt` when an interaction ends; `retention.purge` job for evidence quotes, summaries and notes. (NFR-PRI-04)

**Done when:** AC-LANG-01…04, AC-DSH-02, AC-API-01, AC-API-02 pass. **Milestone M5.**

---

## Phase 9. Evaluation, hardening, deployment and demo

**Goal:** prove it works, make it safe to show, and prepare the presentation.
**Effort:** 6–8 days. **Depends on:** everything above.

- [x] **9.1 Full evaluation run** on 60+ scenarios; `docs/EVALUATION_REPORT.md` with band accuracy, confusion matrix, recall and precision per dimension, speech-to-text error rate per language, latency percentiles. Targets: band accuracy ≥ 80%; no Critical scenario below High; 100% recall for suicidal ideation and immediate danger. (AC-RISK-01, AC-NLP-01/02) *Done: docs/EVALUATION_REPORT.md. 62 scenarios; with AI 79% band accuracy (target 80%: Moderate under-scored, §4 needs a scoring decision), 0 Critical below High, 100% suicide and danger recall; text p95 3.43 s (target 3 s, re-measure after deployment); STT error rate for English only.*
- [x] **9.2 Fairness report** by language, gender and channel; any gap above 15 points documented with a mitigation. (AC-ETH-02, AC-LANG-03) *Done: report §7. Gaps over 15 points (voice call, gender other) come from tiny groups and the Moderate issue; mitigation documented.*
- [x] **9.3 Outcome measurements** for the five Expected Outcomes: time from first message to Critical flag; average wait of Critical cases in risk order against first-come order on the same scenarios; alert-to-acknowledgement time; referrals by type and district. *Done: report §8. Critical cases wait 39 min in risk order vs 231 min first-come.*
- [x] **9.4 Accessibility.** Lighthouse and axe on every victim page, score ≥ 90; keyboard and screen-reader pass; check on a low-end Android phone with a throttled connection. (AC-ACC-01) *Done except people/devices: axe WCAG 2.1 AA 0 violations on every victim page (desktop and phone), keyboard pass, one fix. Lighthouse score, screen reader and a low-end phone still to do.*
- [x] **9.5 Security review.** OWASP ZAP baseline scan; confirm no secrets in the client bundle; confirm redaction with 10 scenarios containing names and phone numbers; review of every route against the permission matrix. (AC-SEC-01/02) *Done except ZAP: route-guard test, client-bundle secret scan, headers, 10-scenario redaction (name gap fixed). OWASP ZAP needs Docker/Java; with deployment.*
- [x] **9.6 Privacy review.** Walk through every rule in `CLAUDE.md` and tick each with evidence; check that no victim screen shows a diagnostic label. (AC-ETH-01) *Done: docs/PRIVACY_REVIEW.md.*
- [x] **9.7 PWA.** Manifest, icons, service worker for the app shell only (never cache conversation content); install test on Android Chrome. (AC-CH-06) *Done except the Android install test (needs a phone).*
- [ ] **9.8 Usability test** with 5 or more volunteers playing scripted roles; short comfort rating afterwards; fix the top issues. *Not done: needs 5+ volunteers.*
- [ ] **9.9 Deployment.** Vercel Hobby (web), Atlas Free, Pusher Sandbox; analysis service on the team laptop exposed with `cloudflared tunnel --url http://localhost:8000` and that URL set as `ANALYSIS_URL` on Vercel; indexes synced; demo data seeded; health check green. Write a pre-demo checklist (start service, start tunnel, update the URL, warm-up message). *Deferred by the team until the project is finished.*
- [ ] **9.10 Documentation.** README with set-up steps, architecture diagram, API docs link, evaluation report, known limitations and ethical statement. (C-PRJ-03) *Deferred by the team until the project is finished.*
- [ ] **9.11 Demo script and rehearsal** (see §4), with a recorded backup video in case the network fails on the day. *Deferred by the team until the project is finished.*

**Done when:** every Must-priority acceptance criterion in `REQUIREMENTS.md` §6 is ticked in a checklist appended to the evaluation report. **Milestone M6.**

---

## Phase F. Victim-facing frontend: homepage and unified input layer

**Goal:** a calm, accessible public homepage at `/`, and one coherent intake experience (write, speak or guided questions, then review and an honest confirmation) on top of the existing victim API, conversation engine and consent logic. Full brief: `docs/FRONTEND_UX_PRODUCT_BRIEF.md`; step-by-step checklist with evidence: `docs/checklist.md`.
**Depends on:** Phases 3, 7 and 8 (victim flow, voice, languages). **Must not change:** scoring, lexicon, prompts, screener wording, consent rules, staff dashboards or API contracts, except the smallest additive change the audit shows is needed (brief §0).

- [x] **F.0 Audit.** `docs/FRONTEND_AUDIT.md`: routes, components, flow, endpoints actually used, gaps between docs and code, reusable parts, proposed minimal changes, test baseline. No code changes. (checklist §0)
- [x] **F.1 Remove the simulator.** Simulator pages, `/api/v1/sim`, components, contracts, `core/simulator`, case files, validator, tests and spec sections removed; victim intake kept under `/portal/<locale>`; `/` shows the language choice until F.2. (checklist §1, D8)
- [x] **F.2 Homepage and visual foundation.** "Quiet Paper" tokens in one place; header and footer; `/` as the victim homepage with Start, Write / Speak / Guided questions and an immediate-safety entry; staff sign-in as a quiet link; every action goes somewhere real. (brief §2, §5; checklist §2, §3, §6) *Done 15 Nov 2026: `app/(home)/` (homepage, `/how-it-works`, `/privacy`), `components/home/`, Quiet Paper tokens in `globals.css` on public and `/portal` pages only, `/portal` → `/`, `?way=` hint orders the story step. Tests: `home.spec.ts`, axe on every new page, `theme-contrast` and `portal-paths` unit tests. Non-English text is a draft. Guided questions uses today's flow until F.4.*
- [ ] ~~**F.3 Consent and safety flow.**~~ *Cancelled 16 Nov 2026.* Consent presentation with audio, no pre-selected options, "continue without analysis"; safety check first in every mode; minor-without-guardian route; emergency panel. (brief §3.3–3.4; checklist §4)
- [ ] ~~**F.4 Unified input layer.**~~ *Cancelled 16 Nov 2026.* Input-method choice mapped to the existing conversation engine (no second state machine); text composer; voice note with playback and transcript review; live voice kept distinct; guided questions; provenance kept; `channel` never repurposed. (brief §3.5–3.9, §4; checklist §5)
- [ ] ~~**F.5 Context, review and confirmation.**~~ *Cancelled 16 Nov 2026.* Optional context; one review step before closing; confirmation that shows only what the backend accepted. (brief §3.10–3.13; checklist §5)
- [ ] ~~**F.6 Hardening and docs.**~~ *Cancelled 16 Nov 2026.* Accessibility, languages, low-end Android, slow network, PWA privacy, voice failure paths, session expiry, quick exit, full Playwright run; then the doc updates in checklist §10.

**Done when:** every applicable item in `checklist.md` §12 is true; type-check, lint, unit and Playwright tests pass; no rule in `CLAUDE.md` is broken.

**Stopped 16 Nov 2026** (`PRODUCT_VISION.md`, decisions Q1 and Q3): the product is a plug-in module with no victim website or questionnaire. F.3–F.6 are cancelled and replaced by Phase M.

---

## Phase M. Module contract and demo input layer

**Goal:** the product is the plug-in assessment module (`docs/PRODUCT_VISION.md`). It accepts exactly two inputs (text messages and voice audio) through the integration API, never asks the person questions, and runs with any demo switched off. The demo input layer is a detachable harness that calls the same API with a demo key.
**Depends on:** Phases 2, 4, 7 and 8 (scoring, AI text analysis, voice, integration API). **Must not change:** staff dashboards (beyond removing screener fields), CLAUDE.md rules 1–12, the deterministic scoring rules (other than removing the screener source), consent, privacy, audit and human approval.

- [x] **M.1 Docs to the module spec.** *Done 16 Nov 2026.* `CLAUDE.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, `DATABASE.md`, `models.ts` and this plan restated for the module (PRODUCT_VISION.md §5, §11); FR-SCR, AC-SCR, the screener source, `IVR_KEYPRESS`, `/screeners`, the victim API and the victim pages removed; OV-9 restated to fire from words; the three frontend documents marked superseded; speaker separation added (FR-VOI-10, AC-VOI-08).
- [x] **M.2 Remove the victim website and the question flow.** Homepage, How it works, Privacy, `/portal` pages, keypad page, `components/victim` and `components/home`, the Quiet Paper theme, PWA (manifest, service worker, offline page), `/<locale>` redirects and unused message keys; `core/conversation`, `core/screeners`, `core/victim`, `/api/v1/victim`, both `/screeners` routes, `IVR_KEYPRESS`, the victim session auth mode. Shared parts move to `core/interactions` (start, consent, end, emergency options, summary) and `core/operator` (suggested questions); integration gains `POST …/consent/withdraw`. `/` redirects to `/login`. The live recorder moves to `components/audio/` for the demo. Staff e2e tests create cases through `/api/v1/integration`. (FR-CH-01/02, FR-API-05, AC-CH-07) *Done 16 Nov 2026: shared code in `core/interactions` and `core/operator`; e2e migrated (`integrationSession`). Interactions a calling system never ends are closed as abandoned after 24 h without activity (replaces the victim-session expiry).*
- [x] **M.3 Scoring config v3 and statement-based OV-9.** `SCREENER` source, its 0.30 weight and "denial" scores removed; remaining source weights unchanged (Appendix A). OV-9 fires from the person's own words (new `NOT_SAFE_NOW` lexicon rules in all six rule files; regional rules are drafts). `scripts/drop-screener-data.ts` cleans screener fields and `SCREENER` indicators out of existing synthetic data. (FR-IND-03, FR-RISK-02, AC-RISK-02) *Done 16 Nov 2026: config v3 active; clean-up run on the synthetic database.*
- [x] **M.4 Evaluation without answers.** Scenarios that relied on screener or safety-check answers rewritten as conversations (operator question, person's reply) or dropped; expected bands unchanged; operator turns never scored; `npm run eval` (rules only) re-run and recorded next to the old numbers in `EVALUATION_REPORT.md`. Suicide and immediate-danger recall must stay at 100%. (AC-EVAL-01, AC-NLP-01/02, AC-RISK-01) *Done 16 Nov 2026 (with M.9): 49 scenarios rewritten, labels unchanged; `EVALUATION_REPORT.md` §1a: band 77%, suicide and danger recall 100%, recommendations 91%. AI-mode run not repeated yet.*
- [x] **M.5 Indicators with evidence in the result (V1).** Read endpoint or fields for indicators with evidence (exact quotes for text, time positions for voice) behind a new API scope, so each NHAA system receives only what it is authorised to. (FR-API-01, FR-IND-04) *Done 16 Nov 2026: `GET /integration/interactions/{id}/indicators`, scope `indicators:read` (granted on purpose; not in the seeded client); exact quote and span for text, window and time for voice, field for context; no staff review details. The staff indicator endpoint gained the voice times too.*
- [x] **M.6 Input method and contract version (V2).** Optional `inputMethod` on `/messages` and `/audio` (`TEXT`, `LIVE_AUDIO`, `RECORDED_AUDIO`, `TRANSCRIPT`), stored beside `modality` and separate from `channel`; contract version stated in responses. *Done 16 Nov 2026: `inputMethod` TEXT | TRANSCRIPT on `/messages`, LIVE_AUDIO | RECORDED_AUDIO on `/audio`, stored on messages and voice windows; `X-Contract-Version: 1.1` on every integration response, errors included. `STRUCTURED` (in the vision's V2 list) left out: there are no structured answers (Q1).*
- [x] **M.7 Demo cases marked (V3).** Records created by a demo API key are tagged on the server (never from the request body), shown with a "demo" mark on staff screens, and filterable in analytics. They stay in the staff queues on purpose. *Done 16 Nov 2026: `isDemo` on `api_clients`, `interactions`, `cases`, `referrals` and `daily_stats`, copied from the key on the server; `npm run api:client -- --demo`; Demo mark on queue, case, operator, approvals, referral and district screens; analytics `demo=include|exclude|only`. Run `npm run db:indexes` (the `daily_stats` unique key gained `isDemo`).*
- [x] **M.8 Recorded audio into windows (V4).** A server-side step cuts a recorded file into 5 s windows and feeds them through the real `/audio` path in order. Never a prewritten transcript. *Done 16 Nov 2026: `core/demo/wav.ts` (any PCM WAV → 16 kHz mono 5 s windows, under the 200 KB limit); `POST /api/demo/interactions/{id}/recording` sends them in order and streams NDJSON progress; a window that comes back unanalysed is retried once.*
- [x] **M.9 Short answers read with their question (V7).** The previous `OPERATOR` turn is passed as context to the AI analysis, and question-aware rules read short answers to the four safety questions ("No" after "Are you safe right now?" → OV-9) and, decided 16 Nov 2026, to the PHQ-2, GAD-2 and PC-PTSD-5 wellbeing questions when NHAA's chatbot or operator asks them (scored per item, Appendix A). The module still never asks. (FR-NLP-11, AC-NLP-08, AC-NLP-09) *Done 16 Nov 2026: `core/safety-lexicon/answers.ts`; previous question passed to the AI (prompt v2); unit and e2e tests. Spoken questions on calls are not paired until M.10.*
- [x] **M.10 Speaker separation in audio (replaces V8).** Label each transcript sentence `OPERATOR` or `CALLER`, score only the caller's words, take voice features from the caller's segments only. Until this is built, every assessment from two-voice audio is marked limited confidence. (FR-VOI-10, AC-VOI-08) *Done 16 Nov 2026: `analysis-service/app/audio/speakers.py` (Silero VAD stretches + CAM++ voice fingerprints, first voice = operator unless `firstSpeaker`); `audioSource` and `firstSpeaker` on `/audio`; fingerprints round-trip encrypted (`speakerStateEnc`); operator words stored as `OPERATOR` turns; one voice so far = the caller's, limited for that window; unseparated or ambiguous audio marks the call `voiceUnseparated` (limited); a life-safety statement labelled as the operator's is scored as the caller's. Tested on a synthetic two-voice TTS fixture (pytest and e2e). Open: real recordings not tested; the 5 s voice-window e2e budget failed on 16 Nov with slow Atlas round trips (66–693 ms) and needs a re-run.*
- [x] **M.11 Demo input: live text.** Chat-style page representing NHAA's chatbot; sends `/messages` one message at a time (questions as `OPERATOR` turns) with the demo key. Visibly marked synthetic / demonstration. *Done 16 Nov 2026: `/demo/text` (supervisors, `DEMO_ENABLED`); chatbot questions from `operatorQuestions.*`; a library scenario's text version replays line by line; results view (PRODUCT_VISION §7) read through the staff API.* *Replaced in Phase P (P-D4): the question taps and the replay go; only the server records the portal assistant's scripted questions as `OPERATOR` turns, and the public message body has no `sender` (task P.4, P.7).*
- [x] **M.12 Demo input: live microphone.** The kept recorder (`components/audio/`) sends 5 s windows to `/audio` with the demo key, the caller's voice only. One live call at a time (free tier). *Done 16 Nov 2026: `/demo/live-call`; windows relayed as CALLER_ONLY, LIVE_AUDIO; a new live call ends any older one. e2e with Edge's fake microphone.*
- [x] ~~**M.13 Demo input: generated text (V5).**~~ *Removed 16 Nov 2026 in N.2 (decision N-D6): three demo inputs remained, and two since Phase P (P-D3).* An LLM writes a synthetic conversation from chosen options (category, language, length) on the free Groq quota; output labelled synthetic and sent through `/messages`. Audio is never generated. *Done 16 Nov 2026: `/demo/generated`; analysis service `POST /v1/demo/generate` (synthetic, non-graphic; chatbot lines must be NHAA's scripted questions word for word; contact details dropped); shown before sending, then played through `/messages`. Own circuit breaker, so demo failures never affect real analysis.*
- [x] **M.14 Demo input: pre-recorded audio library.** Team recordings with stable scenario IDs, cut into windows by M.8 and sent through `/audio`. Expected results are test metadata, never sent to the module. *Done 16 Nov 2026: `/demo/recorded`; `demo/library/library.json` points at 10 evaluation scenarios (script and expected label from `evaluation/scenarios`); recordings go in the git-ignored `demo/library/audio/`, plus a WAV upload. Open: the team has not recorded any yet.* *Removed from the demo layer in Phase P (P-D3, task P.2): no recordings or library on the public site. The module's `/audio` still accepts `RECORDED_AUDIO` from NHAA's systems.*

**Done when:** the items in `PRODUCT_VISION.md` §12 are true; type-check, lint, unit and Playwright tests pass with the demo switched off; no rule in `CLAUDE.md` is broken.

---

## 3. Testing strategy

| Level | Tool | What it covers | When it runs |
|---|---|---|---|
| Unit | Vitest | Scoring, lexicon, recommendations, crypto, redaction, policies, audit chain | Every push (CI) |
| Contract | Vitest + Zod | Each route's request and response against its contract; victim responses contain no risk fields | Every push |
| Service | pytest | Audio features against reference recordings; text endpoint with recorded model output | Every push to `analysis-service/` |
| End-to-end | Playwright | One journey per role; victim flows; live alert across two sessions | Before merging to main |
| Evaluation | `run_eval.ts` | Accuracy, recall, fairness, latency on the synthetic set | After any change to prompts, lexicon, weights or models |
| Non-functional | Lighthouse, axe, ZAP, k6 | Accessibility, security baseline, response-time percentiles | Phase 9 and before the demo |

A change to the lexicon, the prompt or the weights is not finished until the evaluation run shows that recall for suicidal ideation and immediate danger is still 100%.

---

## 4. Demo script (target: 8 minutes)

1. **The gap (30 s).** Today every complaint looks the same; nobody measures how the person is.
2. **Victim, Hindi chat (2 min).** Language choice → consent with separate toggles → safety check → a message about threats outside the house. The emergency panel appears. Point out: the victim sees help, never a score.
3. **Counsellor (2 min).** The case jumps to the top of the queue with a Critical alert. Open it: SVI, the dimension breakdown, the highlighted quote that triggered it, the safety override. Reject one indicator and watch the SVI recalculate.
4. **Action (1 min).** Approve the police-intervention recommendation. Switch to the police login: a short action request and nothing else. Try to open the case as police: refused.
5. **Voice (1.5 min).** Simulated call: live transcript, pauses and pitch strip, SVI moving on the operator console.
6. **Resilience (30 s).** Switch the AI service off; send a high-risk message; it is still flagged, marked "limited confidence".
7. **Ministry view (30 s).** Anonymised heat map and response times; small counts suppressed.
8. **Evidence (30 s).** Evaluation numbers and the ethical safeguards.

---

## 5. Risks and mitigations

| Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|
| Voice analysis takes longer than planned | High | M4 slips | One-day spike first; rule-based voice emotion as a fallback; IVRS and paralinguistic events are droppable |
| Indian-language speech-to-text is inaccurate, especially dialects | High | Weak transcripts, missed signals | Use transcript confidence in scoring; rely on the safety check and screeners; report error rates honestly |
| LLM free tier is slow or rate-limited | Medium | Misses the 3 s target | Timeout with fallback already built; cache during evaluation; keep the provider swappable |
| LLM invents evidence or mislabels negation | Medium | False flags | Word-for-word span check; negation cases in the evaluation set; lexicon as second path |
| Scope is too large for the time available | High | Unfinished demo | Milestone order with a clear cut line (§1); Should and Could items marked |
| Free hosting cold starts during the demo | Medium | Awkward pauses | Warm-up requests before presenting; recorded backup video |
| Sensitive content is handled carelessly in test data | Low | Ethical problem | Rules in `CLAUDE.md`; second-person review of every scenario |
| MongoDB transactions unavailable locally | Low | Pipeline fails | Atlas free tier or the documented single-node replica set |
| Auth.js v5 is still in beta | Low | Breaking change | Pin the version; staff login is isolated in one module |

---

## 6. Requirement coverage by phase

| Requirement group | Phase |
|---|---|
| FR-CH (inputs) | 7 (voice, operator), 8 (integration API), M (two inputs only, sender, demo inputs) |
| FR-CON (consent) | 3, M (consent state on integration start, withdraw) |
| FR-SCR (screening, safety check) | Removed in M (was 2, 3) |
| FR-NLP, FR-EMO (text) | 2 (lexicon), 4 |
| FR-VOI, FR-EMO (voice) | 7, M (speaker separation, recorded audio) |
| FR-IND, FR-SVI, FR-RISK | 2, 5 (review, override) |
| FR-REC | 2 (rules), 6 |
| FR-LANG | 3 (en, hi), 4 (detection, translation), 8 (mr, ta, bn) |
| FR-CASE, FR-ALR | 5 |
| FR-DSH | 5 (counsellor), 6 (district, police, welfare), 7 (operator), 8 (state, ministry) |
| FR-API | 8, M (only input; evidence, input method, demo tag) |
| FR-AUD | 1, 5 |
| NFR-PRI, NFR-SEC | 1, 8 (retention), 9 (review) |
| NFR-ETH | 2–4 by design, 9 (fairness, review) |
| NFR-PERF | 4, 5, 7, 9 (measurement) |
| NFR-REL | 4 |
| NFR-ACC | 9 (staff pages), M (demo pages) |
| NFR-MNT | 0, 2 |

---

## Phase N. Public site, public demo, tracking and the Nivara UI

Spec: `NIVARA_FLOW_AND_UI_PLAN.md` (wins over older documents on the website flow, the demo and the look). Done 16 Nov 2026 unless marked.

- [x] **N.1 Docs to the new spec.**
- [x] **N.2 Remove generated text.** Web app and analysis service.
- [x] **N.3 Case status endpoint.** `GET /api/v1/integration/cases/{docket}/status`, scope `status:read`, contract 1.2.
- [x] **N.4 Public demo API.** `core/demo/guard.ts` + `public.ts`: kill switch, same-site, per-visitor and daily limits, own-cases cookie, trimmed replies, district on start, busy line with supervisor takeover, `/api/demo/track`.
- [x] **N.5 Design foundation.** Tokens, Fraunces + IBM Plex, `navy` → `brand`, shared parts.
- [x] **N.6 Public shell and home page.**
- [x] **N.7 Public demo pages.** `/demo/text`, `/demo/call`, `/demo/recording`; results view and staff-side chooser removed. *Replaced in Phase P by the portal journey (`/start`, `/start/write`, `/start/speak`; task P.7); the old URLs redirect to `/start`.*
- [x] **N.8 Track page.** `/track`, `/track/[docket]`; `track.*` in all five message files (non-English drafts).
- [x] **N.9 Login.**
- [x] **N.10 Staff portals restyle.**
- [x] **N.11 Tests and checks.** `demo.spec.ts`, `demo-live.spec.ts`, `accessibility.spec.ts` rewritten for the public flow; unit tests for the safeguards and the status contract.
- [ ] ~~**N.12 Deployment prep.**~~ **Folded into P.10** (17 Nov 2026). Plan §12: Vercel variables, demo key with `status:read` and `questions:read`, seed, tunnel, rehearsal.
---

## Phase P. The portal journey

Spec: `NIVARA_FLOW_AND_UI_PLAN.md` (revised 17 Nov 2026; wins over older documents on the website flow, the public pages, the demo layer, languages and the look). Each task ends with `npm run typecheck && npm run lint && npm test` passing (and `pytest` when `analysis-service/` changes).

- [x] **P.1 Docs to the Phase P spec.** `PRODUCT_VISION.md` (§3 diagram, §6 two public inputs and the portal journey as part of the demo layer, §10 decisions P-D1 to P-D9, the superseded-documents row now says they were deleted on 17 Nov 2026); `CLAUDE.md` (repository layout: `(public)/` home, `start`, `track`; `components/portal/`; `src/i18n/`); `REQUIREMENTS.md` (demo requirements, next question, site-wide languages); `API_CONTRACTS.md` (§6.5 rewritten, new next-question section, §4 matrix with `questions:read`, contract 1.3); `ARCHITECTURE.md` (demo layer); `TOOLS_AND_COSTS.md` if anything there mentions recordings on the public site; `IMPLEMENTATION_PLAN.md` (Phase P with these tasks and a status row; N.12 folded into P.10). *Done when* no document says the public site has three inputs, offers recordings, or is English only. *Done 17 Nov 2026: PRODUCT_VISION, CLAUDE.md, REQUIREMENTS (FR-API-07, FR-DEMO-01, 03 to 06, FR-LANG-07, AC-API-03, AC-LANG-05), API_CONTRACTS (§4 scopes, §6.5 rewritten, §6.7 next question, contract 1.3), ARCHITECTURE (§6.6 portal journey, structure) and this plan; TOOLS_AND_COSTS unchanged (it does not mention recordings on the public site).*
- [x] **P.2 Remove recorded audio from the demo layer.** §8.1. *Done when* no recording page, route, contract, limit or library route remains in the demo layer, the module's audio endpoint is untouched, and all checks pass. *Done 17 Nov 2026: recording page and route, library route, `core/demo/wav.ts` and `library.ts`, `demo/library/`, the recording contracts and limit, and the demo library's build tracing removed (the evaluation set never used them); the text page lost its library replay; the module's `/audio` with `RECORDED_AUDIO` is untouched.*
- [x] **P.3 Next-question endpoint.** §8.2. Unit tests for: the opening question, asked questions skipped, safety first and `safePlace` after "not safe now", suicide questions on any sign, the six-question cap, the exact key set, ownership and scope. OpenAPI entry; contract version 1.3; demo key scope. *Done 17 Nov 2026: `GET /integration/interactions/{id}/next-question` (scope `questions:read`, contract 1.3, OpenAPI); `suggest.ts` gained `asked`, `nextChatbotQuestion` and the six-question cap, shared with the operator console through `core/operator/load.ts`; `operatorQuestions.opening` in all five files (drafts); scopes in one list (`API_SCOPES`); `npm run api:client -- --update-demo-scopes` adds the new scope to an existing demo client without a new key. Tests: `next-question.test.ts`.*
- [x] **P.4 Demo relay.** §7 and §8.3: `sender` removed, server-recorded `OPERATOR` turns, the new receipt shape, `heard` for audio, the new `…/next-question` route, the activity-based busy line (60 s) and the speech-time cap. Unit tests for each; verify the two points at the end of §8.3. *Done 17 Nov 2026: `core/demo/assistant.ts` (`askNext` records the module's question as an OPERATOR turn before returning its text; `openCase` enforces the 15-minute cap and marks activity); public message body `{ text, note? }` with no `sender`; receipts carry `question`; audio carries `heard`; new `POST …/next-question` sharing the message limit; busy line 60 s on any activity; three minutes of speech counted from windows sent. The two §8.3 points were checked in the code (OPERATOR turns and TEXT on any channel are accepted; CALLER_ONLY transcripts are the caller's words only); a live check is in P.9. The interim text page shows the server's questions and Skip.*
- [x] **P.5 Site-wide languages: foundation and public text.** §6.7: request config, cookie, provider, switcher, `<html lang>`; every public, portal and login string moved into `messages/*.json` in all five languages (non-English marked as drafts in `TRANSLATION_REVIEW.md`); the conversation language taken from the site language. *Done when* switching to Hindi changes every public page, the login page and the assistant's questions, and `npm run i18n:check` passes. *Done 17 Nov 2026: next-intl request config (`src/i18n/request.ts`, `locale.ts`), the plugin in `next.config.ts`, `NextIntlClientProvider` and `<html lang>` in `app/layout.tsx`; `components/ui/language-switcher.tsx` (cookie `NEXT_LOCALE`, one year, no URL prefix) in the public header, mobile menu and login page; header, footer, track and login text in `messages/*.json` (`public.*`, `login.*`, `languageNames.*`; non-English marked as drafts in `TRANSLATION_REVIEW.md`); the demo's conversation language starts from the site language; Noto Sans as the headline fallback for Indian scripts. Checked in the browser: switching to Hindi changes the header, footer, login and track pages. The home page and the portal journey get their strings in P.6 and P.7, which rewrite them. Test: `site-locale.test.ts`.*
- [x] **P.6 Public header and home page.** §6.1 and §6.2: numbers, Quick exit, switcher, the Start hero, the new sections and footer. *Done 17 Nov 2026: header with NHAA helpline 14566 and Emergency 112 (tap to call), the language switcher, Staff login or Open my portal, and Quick exit (`components/public/quick-exit.tsx`, `QUICK_EXIT_URL`, `location.replace`); on phones Emergency 112 and Quick exit stay visible and the rest folds into the menu; home page with the Start hero, how it works for the person, who sees what you share, the engine diagram and track a case; footer with the demonstration notice, the SIH26093 credit and the integrators link. All text in `public.header.*`, `public.home.*`, `public.footer.*` (drafts outside English). Checked in the browser at 1024 px and 375 px wide (no overflow).*
- [x] **P.7 Portal journey.** §6.3 and §8.4: `/start`, `/start/write`, `/start/speak`, the five-step indicator, Review with the note, Registered, the redirects, components moved to `components/portal/`. *Done 17 Nov 2026: `/start` (Before we begin with language, district, calm consent and "I'd rather talk to someone"; How to share with Write or Speak, busy line and supervisor takeover), `/start/write` and `/start/speak` (conversation with server-recorded scripted questions, Skip, Finish, closing line, emergency panel; Speak turn by turn with Done and "We heard"; Review with the note; Registered with Copy, Track and Back to home); state held in memory in the `/start` layout (`components/portal/portal-provider.tsx`); the five-step indicator; `/demo` URLs redirect to `/start`; `components/demo/` and the old pages removed; the live recorder counts speech only across turns. Text in `portal.*` (drafts outside English). Test: `portal.test.ts`. Not yet checked live: the database could not be reached from this network (Node's DNS lookup of the Atlas SRV record was refused), so the full journey runs in P.9 once it can.*
- [x] **P.8 Staff portals in five languages.** §6.7: the switcher in the staff top bar; every staff label into `staff.*`. Can be split per portal (shell and case queue first, then case detail, operator console, approvals, referrals, district, analytics, admin, audit). No permission or data changes. *Done 17 Nov 2026, in three commits: the staff shell (navigation, roles, duty, sign-out) with the language switcher in the top bar; case queue, alerts, district cases and page titles; case detail, approvals, recommendation actions, referral queues and operator console; analytics, administration and the audit log. Labels in `staff.*`, enum values shown through `components/staff/use-labels.ts` (data is never translated; case content is shown as written). The pre-filled referral action text stays as the server's default wording, because it is content the approver edits and sends. Test: `staff-i18n.test.ts`. Not yet checked in the browser: signing in needs the database, unreachable from this network.*
- [x] **P.9 Tests and checks.** Rewrite `tests/e2e/demo.spec.ts` and `demo-live.spec.ts` for the portal: write a case signed out (questions appear, skip works, the note is sent, docket shown), track it, sign in as counsellor and find it; speak with the fake microphone; switch to Hindi and check the header, the portal and the questions; Quick exit leaves the site; the old `/demo` URLs redirect. Extend `accessibility.spec.ts` to `/start`, `/start/write` and `/start/speak`. Run `npm run security:bundle` and `npm run i18n:check`. *Done 17 Nov 2026: `demo.spec.ts` rewritten for the portal (write a case signed out with questions, skip and a note; relay shape with no sender; own cases and same-site; tracking; Hindi across header, portal, questions and login; Quick exit; old `/demo` URLs; Pune case to district, police and welfare), `demo-live.spec.ts` (Speak turn by turn with the fake microphone; busy line kept alive by any activity for 60 s; supervisor takeover), `accessibility.spec.ts` extended to `/start`, `/start/write` and `/start/speak`. `npm run build`, `npm run security:bundle` (33 client files, no secret) and `npm run i18n:check` pass. Run so far: Quick exit and the old-URL redirects pass in Edge. The rest of the e2e suite needs the database, which this network cannot reach (Node's DNS lookup of the Atlas SRV record is refused); run `npm run e2e` on a network where Atlas resolves.*
- [ ] **P.10 Deployment prep.** Section 12.

P.2 to P.4 change the server; P.5 to P.7 give the full public journey; P.8 is the largest task and can wait until the public side is done. Section numbers (§) in this phase refer to `NIVARA_FLOW_AND_UI_PLAN.md`.

