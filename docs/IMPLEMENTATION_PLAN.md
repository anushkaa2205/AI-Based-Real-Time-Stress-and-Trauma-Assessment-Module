# Implementation Plan
## AI-Based Real-Time Stress and Trauma Assessment Module (SIH26093)

> Companion documents: `REQUIREMENTS.md` (requirement and acceptance IDs), `ARCHITECTURE.md`, `DATABASE.md`, `models.ts`, `API_CONTRACTS.md`, `TOOLS_AND_COSTS.md` (free-tier limits). Project rules: `/CLAUDE.md`.

## Status

Update this table as work finishes.

| Phase | Milestone | Status |
|---|---|---|
| 0. Project setup | M1 Walking skeleton | In progress: all done except 0.6 (Atlas done; Groq/Gemini/Pusher/HF accounts to do) |
| 1. Foundation: data, security, staff login | M1 Walking skeleton | Done (verified on Atlas: indexes, seed, all 10 roles log in, police 403) |
| 2. Scoring core (no AI) | M2 Text MVP | Done (2.1–2.10; coverage 98% on scoring folders) |
| 3. Victim text flow | M2 Text MVP | Done (unit + Playwright on desktop and mobile; rules-only baseline 75% recorded) |
| 4. AI text analysis | M2 Text MVP | In progress: 4.1–4.9 done and verified live (Groq + Gemini overflow); 4.10 results recorded, weight tuning waits for reviewed labels; text latency p95 4.2 s in dev (target 3 s) |
| 5. Responder dashboards and live alerts | M3 Responder loop | Not started |
| 6. Recommendations, referrals, stakeholder views | M3 Responder loop | Not started |
| 7. Voice, operator console, IVRS | M4 Voice | Not started |
| 8. Languages, analytics, integration API, admin | M5 Feature complete | Not started |
| 9. Evaluation, hardening, deployment, demo | M6 Demo-ready | Not started |
| E. Evaluation set (runs alongside phases 2–9) | all | In progress: E.1–E.2 done (20 draft scenarios need a second reviewer) |

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
| D2 | Project name | Phase 3 (UI text) | Placeholder "NHAA Assist" in one config constant |
| D3 | ~~LLM provider~~ **Decided:** Groq `openai/gpt-oss-120b` (development: `gpt-oss-20b`), Gemini Flash free tier as overflow | — | Behind one interface in `analysis-service/app/text/llm.py` |
| D4 | ~~Speech-to-text~~ **Decided:** Groq Whisper for Hindi/English/Hinglish; self-hosted AI4Bharat IndicConformer for Marathi/Tamil/Bengali; Bhashini as backup | — | Confirm laptop speed and RAM in the Phase 7 spike |
| D5 | Three regional languages | Phase 8 | Marathi, Tamil, Bengali (as proposed in FR-LANG-01) |
| D6 | ~~Local MongoDB~~ **Decided:** Atlas Free for development and demo (no Docker) | — | — |
| D7 | ~~Hosting~~ **Decided:** web on Vercel Hobby; analysis service on a team laptop behind a Cloudflare Quick Tunnel; no separate worker (jobs run inside requests) | — | See `TOOLS_AND_COSTS.md` |

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
- [ ] **0.6 Database and accounts.** Create the Atlas Free cluster and two databases, `nhaa_assess` and `nhaa_pii`. Create free accounts and keys: Groq, Google AI Studio (Gemini), Pusher (Sandbox), Hugging Face (accept the IndicConformer model terms).
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
- [x] **2.2 Screener scoring.** `src/core/screeners/`: item definitions and scoring for the safety check, PHQ-2, GAD-2, PC-PTSD-5 and the suicide-risk screen; mapping from screener results to dimensions. (FR-SCR-02, AC-SCR-02)
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
- [ ] **E.3 Grow to 60+**: at least 15 per band; 10+ each in Hindi, Hinglish and English; 5 per regional language; 10+ negation or tricky cases. Two people agree on each label.
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
- [x] **3.4 Conversation engine.** `src/core/conversation/flow.ts`: state machine (greeting → consent → safety check → optional context → open narrative → adaptive screeners → close). Prompts are i18n keys; every question skippable; resume after reload via `GET /next`. (FR-CH-01/09/10)
- [x] **3.5 Pipeline v1.** `src/core/pipeline/run.ts`: consent check → store message (encrypted) → lexicon → fuse → SVI → band → overrides → save assessment → update case → recommendations → alert record. One transaction; idempotency key honoured (`DATABASE.md` §6).
- [x] **3.6 Remaining victim endpoints.** `/messages`, `/screeners`, `/context`, `/language`, `/callback-request`, `/end`.
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

- [ ] **5.1 Real-time layer.** `src/lib/realtime.ts` with two drivers (Pusher, local SSE); `POST /api/v1/realtime/auth` applying the same policies as REST; event envelope from `API_CONTRACTS.md` §7. Pipeline publishes after commit.
- [ ] **5.2 Case queue.** `GET /staff/cases` with filters and cursor pagination, sorted band ↓, SVI ↓, waiting time ↑. Queue page with band shown as colour **and** text, top reason, waiting time, live updates. (FR-CASE-01, FR-RISK-05)
- [ ] **5.3 Case detail.** `GET /staff/cases/{id}` and the interaction endpoints (transcript, assessments, indicators). Page shows: SVI gauge and timeline, dimension breakdown, indicators with highlighted evidence in the original text and translation, screener results, consent status, context. (FR-CASE-03, FR-SVI-03/05, FR-LANG-06)
- [ ] **5.4 Indicator review.** `PATCH /staff/indicators/{id}`: confirm, reject or adjust with a reason; SVI recalculated immediately; original value kept. (FR-IND-05)
- [ ] **5.5 Band override, notes, status, assignment.** `POST /cases/{id}/band-override` (reason required), notes, `PATCH /cases/{id}`; auto-assignment by language, district and workload **(S)**. (FR-CASE-02/04/05)
- [ ] **5.6 Alerts.** Create an alert when the band rises to High or Critical; banner with sound for Critical on any staff page; acknowledge and resolve endpoints; polling fallback every 10 s if real time is down. (FR-ALR-01/02/04)
- [ ] **5.7 Job runner.** `src/core/jobs/runDue()`: claims up to 5 due jobs atomically and runs handlers for `alert.escalate` (counsellors → supervisor → district) and `rescore`. Called at the end of `GET /staff/alerts` (polled every 10 s by every staff dashboard) and from `POST /api/v1/internal/jobs/run` (secret-protected); `npm run jobs` loops it locally. No separate worker process. (FR-ALR-03)
- [ ] **5.8 Audit.** Audit entries for case view, transcript view, identity view, review, override. Identity endpoint with consent check.
- [ ] **5.9 Tests.** Playwright with two browser sessions: a victim message that triggers Critical appears on the counsellor screen within 5 s without refresh; unacknowledged alert escalates; override without a reason is blocked; queue order with 20 seeded cases.

**Done when:** AC-CASE-01, AC-CASE-02, AC-IND-02, AC-ALR-01, AC-ALR-02, AC-AUD-01 and AC-RISK-04 pass.

---

## Phase 6. Recommendations, referrals and stakeholder views

**Goal:** close the loop from risk to action, with each stakeholder seeing only what they need.
**Effort:** 5–7 days. **Depends on:** Phase 5.

- [ ] **6.1 Approval inbox.** `GET /staff/recommendations`, `POST /recommendations/{id}/decision` (approve, reject, post-review of auto-triggered emergency support). Approval creates the referral; text limited to 300 characters with a warning not to include clinical detail. (FR-REC-05/07)
- [ ] **6.2 Emergency path.** Critical band auto-triggers EMERGENCY_SUPPORT, shows the victim's emergency panel through the `emergency.show` event, and handles callback requests. (FR-REC-06)
- [ ] **6.3 Referral endpoints.** List, detail and status updates with allowed transitions. (FR-REC-08)
- [ ] **6.4 Police liaison view.** Action requests only. Add an automated test that a police user calling case, transcript, indicator and assessment endpoints directly receives 403 on each. (FR-DSH-04, AC-DSH-01, AC-REC-05)
- [ ] **6.5 Welfare view.** Rehabilitation, relief, legal-aid and medical referrals. **(S)** (FR-DSH-05)
- [ ] **6.6 District dashboard.** High and Critical cases in the district (band and SVI only), pending referrals, missed deadlines, escalated alerts. (FR-DSH-03)
- [ ] **6.7 Follow-ups.** Schedule on closing a High or Critical case; reminders through the job runner. **(S)** (FR-REC-09)
- [ ] **6.8 Tests.** One Playwright journey per role confirming it sees its own dashboard and nothing else. (AC-DSH-03)

**Done when:** AC-REC-01…05, AC-DSH-01 and AC-DSH-03 pass. **Milestone M3.**

---

## Phase 7. Voice, operator console and IVRS

**Goal:** analyse voice (pauses, pitch, speech rate, emotion) in rolling windows and show it live to an operator.
**Effort:** 8–11 days. **Depends on:** Phases 4 and 5. Engines decided in D4. *Highest technical risk: start with a one-day spike on 7.2: measure seconds per 5-second chunk and RAM with IndicConformer + emotion2vec+ loaded on the team laptop, before committing to the rest.*

- [ ] **7.1 Capture.** Victim voice page using MediaRecorder with 5-second chunks, visible recording indicator, mute and stop, upload with retry, graceful switch to text if the microphone is refused. (FR-CH-03, C-TEC-04, NFR-REL-02)
- [ ] **7.2 Audio analysis.** `POST /v1/analyze/audio`: decode → Silero VAD → pauses (count, mean, max, silence ratio) → Praat pitch mean, spread and range → energy (librosa) → speech-to-text (Groq Whisper for hi/en/Hinglish; IndicConformer for mr/ta/bn; Bhashini backup) → speech rate = transcript words ÷ voiced seconds. (FR-VOI-01…04)
- [ ] **7.3 Speaker baseline.** First 20–30 s of speech set the baseline; later windows report deviations from it. (FR-VOI-03)
- [ ] **7.4 Voice emotion.** emotion2vec+ base (via FunASR) with confidence; start with a simple rule-based mapping from the deviations if the model is too heavy. (FR-VOI-06)
- [ ] **7.5 Pipeline v3 and operator console.** `POST /victim/…/audio` → features stored in `voice_windows`, raw audio discarded → transcript through the text pipeline → voice indicators (capped) → fused emotion. Operator console: live transcript, SVI gauge, indicator chips with evidence, pause and pitch strip, suggested next questions, "type what the caller said" input. (FR-CH-04, FR-VOI-07/09, FR-EMO-02, FR-DSH-01)
- [ ] **7.6 Paralinguistic events.** Crying, sobbing, long silence after a question. **(S)** (FR-VOI-05)
- [ ] **7.7 Emotion timeline.** Chart of text, voice and fused emotion across the session. **(S)** (FR-EMO-03)
- [ ] **7.8 IVRS simulation.** Keypad page with spoken prompts: language choice, safety check, PHQ-2 and GAD-2 by key press. **(S)** (FR-CH-05)
- [ ] **7.9 Audio retention.** Only with consent: encrypted object storage, deletion job. **(C)**
- [ ] **7.10 Tests.** Reference recordings: 5 inserted pauses detected within ±0.3 s; pitch within ±10%; speech rate within ±15%; no stored audio after a session without retention consent; no scenario reaches Critical on voice alone.

**Done when:** AC-CH-02, AC-VOI-01…07, AC-EMO-01 and the voice part of AC-SVI-02 (within 5 s) pass; AC-CH-03 if IVRS is built. **Milestone M4.**

---

## Phase 8. Languages, analytics, integration API and admin

**Goal:** breadth: all five languages, the national and state view, the plug-in API and configuration screens.
**Effort:** 8–10 days. **Depends on:** Phases 5–7 (sub-tracks are independent of each other).

- [ ] **8.1 Regional languages.** `messages/mr.json`, `ta.json`, `bn.json` reviewed by native speakers; lexicon rule files for each; consent and safety-check audio; screeners translated. Regional-language scenarios added to the evaluation set. (FR-LANG-01/02/04/05)
- [ ] **8.2 Analytics roll-up.** `stats.rollup` job filling `daily_stats`; endpoints `/analytics/summary`, `/heatmap`, `/trends`, `/capacity`; counts below 5 suppressed. (FR-DSH-06)
- [ ] **8.3 Analytics screens.** State and ministry dashboards: cases by band, district heat map, indicator trends, time to first response, referral completion, demand against capacity; filters; CSV export **(C)**. (FR-DSH-07/08)
- [ ] **8.4 Integration API.** `/api/v1/integration/*` with API-key authentication, scopes, per-key rate limits and the SSE stream; a small example script that runs a full interaction. (FR-API-01…04)
- [ ] **8.5 OpenAPI.** Generate the specification from the Zod contracts and serve it at `/api/docs`.
- [ ] **8.6 Admin.** Users and API clients; scoring configuration versions with create, simulate against the evaluation set, and activate; audit log viewer and chain verification. **(S)** (FR-SVI-06)
- [ ] **8.7 Retention.** Set `purgeAt` when an interaction ends; `retention.purge` job for evidence quotes, summaries and notes. (NFR-PRI-04)

**Done when:** AC-LANG-01…04, AC-DSH-02, AC-API-01, AC-API-02 pass. **Milestone M5.**

---

## Phase 9. Evaluation, hardening, deployment and demo

**Goal:** prove it works, make it safe to show, and prepare the presentation.
**Effort:** 6–8 days. **Depends on:** everything above.

- [ ] **9.1 Full evaluation run** on 60+ scenarios; `docs/EVALUATION_REPORT.md` with band accuracy, confusion matrix, recall and precision per dimension, speech-to-text error rate per language, latency percentiles. Targets: band accuracy ≥ 80%; no Critical scenario below High; 100% recall for suicidal ideation and immediate danger. (AC-RISK-01, AC-NLP-01/02)
- [ ] **9.2 Fairness report** by language, gender and channel; any gap above 15 points documented with a mitigation. (AC-ETH-02, AC-LANG-03)
- [ ] **9.3 Outcome measurements** for the five Expected Outcomes: time from first message to Critical flag; average wait of Critical cases in risk order against first-come order on the same scenarios; alert-to-acknowledgement time; referrals by type and district.
- [ ] **9.4 Accessibility.** Lighthouse and axe on every victim page, score ≥ 90; keyboard and screen-reader pass; check on a low-end Android phone with a throttled connection. (AC-ACC-01)
- [ ] **9.5 Security review.** OWASP ZAP baseline scan; confirm no secrets in the client bundle; confirm redaction with 10 scenarios containing names and phone numbers; review of every route against the permission matrix. (AC-SEC-01/02)
- [ ] **9.6 Privacy review.** Walk through every rule in `CLAUDE.md` and tick each with evidence; check that no victim screen shows a diagnostic label. (AC-ETH-01)
- [ ] **9.7 PWA.** Manifest, icons, service worker for the app shell only (never cache conversation content); install test on Android Chrome. (AC-CH-06)
- [ ] **9.8 Usability test** with 5 or more volunteers playing scripted roles; short comfort rating afterwards; fix the top issues.
- [ ] **9.9 Deployment.** Vercel Hobby (web), Atlas Free, Pusher Sandbox; analysis service on the team laptop exposed with `cloudflared tunnel --url http://localhost:8000` and that URL set as `ANALYSIS_URL` on Vercel; indexes synced; demo data seeded; health check green. Write a pre-demo checklist (start service, start tunnel, update the URL, warm-up message).
- [ ] **9.10 Documentation.** README with set-up steps, architecture diagram, API docs link, evaluation report, known limitations and ethical statement. (C-PRJ-03)
- [ ] **9.11 Demo script and rehearsal** (see §4), with a recorded backup video in case the network fails on the day.

**Done when:** every Must-priority acceptance criterion in `REQUIREMENTS.md` §6 is ticked in a checklist appended to the evaluation report. **Milestone M6.**

---

## 3. Testing strategy

| Level | Tool | What it covers | When it runs |
|---|---|---|---|
| Unit | Vitest | Scoring, lexicon, recommendations, screeners, crypto, redaction, policies, audit chain | Every push (CI) |
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
| FR-CH (channels) | 3 (portal, chat), 7 (voice, operator, IVRS), 9 (PWA) |
| FR-CON (consent) | 3 |
| FR-SCR (screening, safety check) | 2, 3 |
| FR-NLP, FR-EMO (text) | 2 (lexicon), 4 |
| FR-VOI, FR-EMO (voice) | 7 |
| FR-IND, FR-SVI, FR-RISK | 2, 5 (review, override) |
| FR-REC | 2 (rules), 6 |
| FR-LANG | 3 (en, hi), 4 (detection, translation), 8 (mr, ta, bn) |
| FR-CASE, FR-ALR | 5 |
| FR-DSH | 5 (counsellor), 6 (district, police, welfare), 7 (operator), 8 (state, ministry) |
| FR-API | 8 |
| FR-AUD | 1, 5 |
| NFR-PRI, NFR-SEC | 1, 8 (retention), 9 (review) |
| NFR-ETH | 2–4 by design, 9 (fairness, review) |
| NFR-PERF | 4, 5, 7, 9 (measurement) |
| NFR-REL | 4 |
| NFR-ACC | 3, 9 |
| NFR-MNT | 0, 2 |
