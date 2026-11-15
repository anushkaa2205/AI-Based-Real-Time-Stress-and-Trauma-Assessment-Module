# System Architecture
## AI-Based Real-Time Stress and Trauma Assessment Module (SIH26093)

> Companion documents: `REQUIREMENTS.md` (what), `DATABASE.md` + `models.ts` (data), `API_CONTRACTS.md` (interfaces).
> Requirement IDs (FR-…, NFR-…, C-…) refer to `REQUIREMENTS.md`.

---

## Contents
1. [Architectural goals and key decisions](#1-architectural-goals-and-key-decisions)
2. [System context](#2-system-context)
3. [Containers (deployable parts)](#3-containers-deployable-parts)
4. [Components inside the web app](#4-components-inside-the-web-app)
5. [The assessment pipeline](#5-the-assessment-pipeline)
6. [Key flows (sequence diagrams)](#6-key-flows-sequence-diagrams)
7. [Analysis service (AI)](#7-analysis-service-ai)
8. [Scoring engine](#8-scoring-engine)
9. [Security and privacy architecture](#9-security-and-privacy-architecture)
10. [Real-time, jobs and failure handling](#10-real-time-jobs-and-failure-handling)
11. [Deployment](#11-deployment)
12. [Tech stack](#12-tech-stack)
13. [Repository structure](#13-repository-structure)
14. [Requirements coverage](#14-requirements-coverage)

---

## 1. Architectural goals and key decisions

| Goal | Comes from | How the architecture achieves it |
|---|---|---|
| Safety-critical detection never depends on one AI model | NFR-ETH-05, NFR-REL-01, FR-NLP-10 | **Two independent detection paths**: a fast rule-based *safety lexicon* inside the web app, plus ML/LLM analysis in a separate service. Either one alone can raise Critical. |
| Explainable, reproducible scores | NFR-ETH-03, FR-SVI-07 | The **scoring engine is a pure, deterministic TypeScript module** with versioned configuration. AI only produces *indicators with evidence*; the score is computed by transparent rules. |
| Real time | NFR-PERF-01…03 | Synchronous analysis per message (≤ 3 s budget), 5-second voice windows, push updates over WebSockets (Pusher). |
| Privacy by design | NFR-PRI-*, C-ETH-02 | PII vault separated from assessments; field-level encryption; role-based field filtering on the server; PII redaction before any third-party AI call; raw audio never stored by default. |
| Human in the loop | NFR-ETH-01 | AI writes *proposals* (indicators, recommendations). Only humans approve referrals or lower a band. |
| Swappable AI | NFR-MNT-01 | All AI sits behind one internal HTTP contract (`/v1/analyze/*`), so models can change without touching the web app. |
| Achievable as a coursework project | C-TEC-*, C-PRJ-* | One Next.js app + one Python service + MongoDB Atlas + Pusher. Every external piece has a free tier and a local fallback. |

### Key decisions (ADR summary)
| # | Decision | Alternatives considered | Why |
|---|---|---|---|
| ADR-1 | **Next.js (App Router) monolith** for the victim UI, staff dashboards and the public API | Separate React SPA + Express API | One codebase and one deploy; route handlers are enough for the API; server components keep sensitive data on the server. |
| ADR-2 | **Separate Python FastAPI "analysis service"** for STT, acoustics, emotion and NLP | Doing everything in Node | The audio/ML ecosystem (Praat/parselmouth, librosa, Whisper, Hugging Face) is Python-first. |
| ADR-3 | **Victim conversation uses scripted, pre-translated prompts**, not free LLM chat | An LLM chatbot that talks to the victim | Safety and predictability: a generative bot could say something harmful to a traumatised person. LLMs are used only for *analysis*, never to talk to the victim. |
| ADR-4 | **The AI outputs indicators; deterministic rules output SVI, bands and recommendations** | End-to-end model predicting the band | Explainability, auditability, tunable thresholds, and it works even when the model is down. |
| ADR-5 | **MongoDB (Atlas, replica set) + Mongoose** | PostgreSQL + Prisma | Team choice and familiarity; flexible documents suit variable AI outputs (indicators, voice features); TTL indexes give automatic retention; Atlas free tier is a replica set, so multi-document transactions work. Relations are handled by embedding bounded data and referencing unbounded data (see `DATABASE.md`). |
| ADR-6 | **Pusher Channels for real-time** (SSE fallback locally) | Self-hosted WebSocket server | Vercel serverless functions cannot hold long-lived sockets; Pusher's private channels give per-role authorisation. |
| ADR-7 | **DB-backed `jobs` collection, run inside normal requests** (no separate worker) for escalations, retention purges and follow-ups | Separate worker process; Redis/BullMQ | Free hosting has no always-on background workers (see `TOOLS_AND_COSTS.md`). Staff dashboards already poll every 10 s, which is often enough for a 2-minute escalation timer. |
| ADR-9 | **Free-tier AI stack**: Groq (LLM + Whisper), self-hosted IndicConformer for regional speech, analysis service on a team laptop behind a Cloudflare Quick Tunnel | Paid APIs; cloud GPU hosting | Coursework budget is ₹0; every choice was verified free on 14 Nov 2026 (`TOOLS_AND_COSTS.md`). The analysis-service interface stays the same, so production can move to government cloud without app changes. |
| ADR-8 | **Application-level field encryption** (AES-256-GCM) for message text, summaries, notes and PII | Relying only on disk encryption | Protects data even from someone with database read access (backups, dumps, admins). |

---

## 2. System context

```mermaid
flowchart LR
    V["Victim / complainant<br/>(phone or browser)"]
    OP["NHAA operator<br/>(14566 desk)"]
    CO["Counsellor /<br/>mental-health professional"]
    DO["District officer"]
    PL["Police liaison"]
    WO["Welfare / rehabilitation officer"]
    SM["State admin /<br/>Ministry (DoSJE)"]
    SYS(("Assessment Module"))
    NHAA["Existing NHAA systems<br/>(portal, docket DB, IVRS, app)"]
    AI["External AI APIs<br/>(Groq LLM + Whisper)"]
    EM["Emergency services<br/>112 · Tele-MANAS 14416"]

    V -- "chat / voice / IVRS / app" --> SYS
    OP -- "live call assist" --> SYS
    CO -- "review, approve, follow up" --> SYS
    DO -- "district actions" --> SYS
    PL -- "action requests only" --> SYS
    WO -- "referrals" --> SYS
    SM -- "anonymised analytics" --> SYS
    NHAA <-- "REST API + docket no." --> SYS
    SYS -- "de-identified text / audio" --> AI
    SYS -. "shows numbers / callback" .-> EM
```

---

## 3. Containers (deployable parts)

```mermaid
flowchart TB
    subgraph Client["Browsers"]
        VU["Victim UI (PWA)<br/>chat · voice · IVRS sim · help"]
        SU["Staff UI<br/>operator · counsellor · district ·<br/>police · welfare · analytics · admin"]
    end

    subgraph Web["Next.js app (Vercel)"]
        RH["Route handlers /api/v1/*"]
        SC["Server components<br/>(role-filtered pages)"]
        CORE["Core modules<br/>conversation · lexicon · scoring ·<br/>recommendations · privacy · audit"]
    end

    AS["Analysis service<br/>Python FastAPI (team laptop + tunnel)<br/>STT · acoustics · emotion · NLP"]
    DB[("MongoDB Atlas<br/>(replica set)")]
    OBJ[("Object storage<br/>(only if audio retention consented)")]
    PU["Pusher Channels<br/>(real-time)"]
    EXT["Groq (LLM, Whisper)<br/>Gemini backup"]

    VU -- HTTPS --> RH
    SU -- HTTPS --> SC
    SU -- HTTPS --> RH
    RH --> CORE
    SC --> CORE
    CORE -- Mongoose --> DB
    CORE -- "HTTP (signed, internal)" --> AS
    AS -- "redacted text only" --> EXT
    CORE -- publish --> PU
    PU -- "private channels" --> SU
    PU -- "interaction channel" --> VU
    CORE -. optional .-> OBJ
```

| Container | Responsibility | Technology | Scales by |
|---|---|---|---|
| **Victim UI** | Consent, conversational intake, voice capture (5-second chunks), IVRS simulation, quick exit, emergency panel. No scores ever shown. | Next.js pages, `next-intl`, MediaRecorder API, PWA manifest + service worker | Static + CDN |
| **Staff UI** | Role-specific dashboards, live updates, approvals | Next.js server components + client islands, `pusher-js` | Static + CDN |
| **API (route handlers)** | Victim session API, staff API, integration API (API keys) | Next.js route handlers, Zod validation | Serverless instances |
| **Core modules** | Conversation flow, safety lexicon, scoring, recommendations, RBAC, privacy, audit | TypeScript libraries inside the Next app | With the API |
| **Analysis service** (team laptop, exposed via Cloudflare Quick Tunnel for the demo) | STT, language ID, translation, acoustic features, speech emotion, text NLP (indicators + evidence), summaries | Python, FastAPI, Groq (LLM + Whisper), IndicConformer, Silero VAD, parselmouth, librosa, emotion2vec+; Silero VAD, Hugging Face, LLM API | Horizontal (stateless) |
| **Job runner** (inside the web app) | Alert escalation timers, follow-up reminders, retention purges, re-scoring after config changes | `core/jobs/runDue()` called from dashboard polling and a protected internal route; no separate process | Atomic claim with `findOneAndUpdate` + `lockedUntil`, so concurrent requests never run a job twice |
| **MongoDB** | All persistent data | MongoDB 8 (Atlas), Mongoose 9 | Managed (Atlas M0 for demo, M10+ for production) |
| **Pusher** | Push events to staff dashboards and the victim's emergency panel | Pusher Channels (private/presence channels) | Managed |
| **Object storage** | Encrypted audio, only with explicit consent | S3-compatible (Supabase Storage / R2) | Managed |

---

## 4. Components inside the web app

```mermaid
flowchart LR
    subgraph API["API layer (route handlers)"]
        A1["victim/*"]
        A2["staff/*"]
        A3["integration/*"]
        MW["middleware: auth · RBAC ·<br/>rate limit · CSP"]
    end

    subgraph Core["Core (pure TS where possible)"]
        CF["conversation<br/>(flow state machine,<br/>scripted i18n prompts)"]
        CON["consent<br/>(mode resolution)"]
        LEX["safety-lexicon<br/>(per-language rules,<br/>negation handling)"]
        PRV["privacy<br/>(PII redaction, crypto)"]
        ACL["analysis-client<br/>(timeouts, fallback)"]
        SCO["scoring<br/>(fusion → SVI → band →<br/>overrides)"]
        REC["recommendations<br/>(rule table → proposals)"]
        CASE["case service<br/>(queue rank, assignment)"]
        ALR["alerts<br/>(create, escalate, ack)"]
        RT["realtime<br/>(Pusher publish)"]
        AUD["audit<br/>(hash-chained log)"]
        POL["policies<br/>(role → fields)"]
    end

    DB[("Mongoose / MongoDB")]

    A1 --> CF & CON
    A1 & A2 & A3 --> MW
    CF --> LEX --> SCO
    CF --> PRV --> ACL
    ACL --> SCO
    SCO --> REC --> CASE
    SCO --> ALR --> RT
    CASE --> RT
    A2 --> POL
    Core --> DB
    A2 & A3 --> AUD
```

| Component | Key responsibilities | Requirements |
|---|---|---|
| `conversation` | State machine: greeting → consent → safety check → context (optional) → open narrative → screeners (adaptive) → summary/close. Chooses the next scripted prompt in the victim's language; supports skip and pause; never asks for a retelling. | FR-CH-01/02/09/10, NFR-ETH-06 |
| `consent` | Turns consent choices into an `AssessmentMode` (SAFETY_ONLY / TEXT_ONLY / VOICE_ONLY / FULL); every analysis call checks the mode first. | FR-CON-* |
| `safety-lexicon` | Per-language JSON rules (keywords, regexes, Hinglish spellings) for suicidal ideation, immediate danger and threats; negation window; runs in < 50 ms in-process. | FR-NLP-10, NFR-PERF-04, AC-NLP-06 |
| `privacy` | `redact()` for phone numbers, Aadhaar-like numbers, emails, addresses and names (from context + NER hints from the analysis service); `encrypt()`/`decrypt()` AES-256-GCM with key versioning. | NFR-SEC-05, NFR-PRI-* |
| `analysis-client` | Typed client for the analysis service; 2.5 s timeout for text, 4 s for audio; circuit breaker; on failure returns `{degraded: true}` so scoring runs in fallback mode. | NFR-REL-01/02 |
| `scoring` | Pure functions `fuseDimensions()`, `computeSvi()`, `assignBand()`, `applyOverrides()`, `explain()`; input = indicators + screeners + context + config; output = immutable `Assessment`. | FR-IND-03, FR-SVI-*, FR-RISK-* |
| `recommendations` | Evaluates the rule table (Appendix C) against the latest assessment; creates / supersedes `Recommendation` documents; auto-triggers EMERGENCY_SUPPORT for Critical. | FR-REC-* |
| `case` | Computes queue rank (`bandRank`, `currentSvi`, `waitingSince`); auto-assigns a counsellor by language + district + workload. | FR-CASE-* |
| `alerts` | Creates alerts on band rises; schedules `alert.escalate` jobs; handles acknowledgement. | FR-ALR-* |
| `policies` | Single source of truth for what each role may read or write; serialisers strip fields per role (e.g. police never get narrative or SVI breakdown). | NFR-PRI-02, FR-DSH-04, AC-DSH-01 |
| `audit` | `audit.record(actor, action, entity, meta)` inside the same DB transaction; hash chain. | FR-AUD-* |

---

## 5. The assessment pipeline

Every new signal (a text message, a 5-second voice window, a screener answer, a context update or a human review) runs through the same pipeline:

```mermaid
flowchart LR
    S["New signal"] --> C{"Consent mode<br/>allows it?"}
    C -- no --> SK["Store only what's needed<br/>(safety check still runs)"]
    C -- yes --> L["① Safety lexicon<br/>(in-process, < 50 ms)"]
    L --> R["② Redact PII"]
    R --> AN["③ Analysis service<br/>text and/or audio"]
    AN --> V["④ Validate output<br/>(schema + evidence span<br/>really exists in text)"]
    V --> I["⑤ Store indicators"]
    L --> I
    I --> F["⑥ Fuse per dimension<br/>(sources × weights × confidence)"]
    F --> SVI["⑦ SVI 0–100"]
    SVI --> B["⑧ Band from thresholds"]
    B --> O["⑨ Safety overrides<br/>(raise only, lock)"]
    O --> A["⑩ Save Assessment snapshot<br/>+ update Case rank"]
    A --> RC["⑪ Recommendations"]
    A --> AL["⑫ Alert if band rose<br/>to High/Critical"]
    A --> P["⑬ Publish realtime events"]
```

**Latency budget for one text message (target ≤ 3 s, NFR-PERF-01):**

| Step | Budget |
|---|---|
| Auth, consent check, store message | 150 ms |
| Safety lexicon | 50 ms |
| Redaction | 30 ms |
| Analysis service (LLM indicators + emotion + language ID + translation, in parallel) | 2,000 ms (timeout 2,500 ms) |
| Validation, fusion, SVI, overrides, DB writes (one transaction) | 250 ms |
| Recommendations, alert, publish | 200 ms |
| **Total** | **≈ 2.7 s** |

If the analysis service times out, steps ⑥–⑬ still run using lexicon + screener + context signals only, and the assessment is marked `limitedConfidence = true`. A `rescore` job retries the analysis later and creates a new snapshot.

---

## 6. Key flows (sequence diagrams)

### 6.1 Text message from victim (portal / chatbot)
```mermaid
sequenceDiagram
    autonumber
    participant V as Victim UI
    participant API as /api/v1/victim
    participant LEX as Safety lexicon
    participant AS as Analysis service
    participant SC as Scoring engine
    participant DB as MongoDB
    participant PU as Pusher
    participant ST as Staff UI

    V->>API: POST /interactions/{id}/messages (Idempotency-Key)
    API->>DB: verify session + consent mode, store Message (encrypted)
    API->>LEX: scan(text, lang)
    LEX-->>API: lexicon indicators (e.g. SUICIDAL_IDEATION 0.9)
    API->>AS: POST /v1/analyze/text (redacted text, context)
    AS-->>API: language, translation, emotions, indicators + evidence spans
    API->>SC: score(indicators, screeners, context, config)
    SC-->>API: Assessment (SVI, band, overrides, explanation)
    API->>DB: tx: indicators, assessment, case rank, recommendations, alert?, audit
    API->>PU: assessment.updated → private-interaction-{id}, private-queue-{district}
    API->>PU: alert.created → private-oncall (if Critical)
    PU-->>ST: live update
    API-->>V: { reply (next scripted prompt), showEmergencyPanel }
```
The victim response **never contains SVI, band or indicator names** (NFR-ETH-02). It only says whether to show the emergency panel.

### 6.2 Voice: browser "call" with operator assist
```mermaid
sequenceDiagram
    autonumber
    participant V as Victim UI (mic)
    participant API as /api/v1/victim
    participant AS as Analysis service
    participant SC as Scoring engine
    participant PU as Pusher
    participant OP as Operator console

    OP->>PU: subscribe private-interaction-{id}
    loop every 5 s (MediaRecorder chunk, opus/webm)
        V->>API: POST /interactions/{id}/audio (chunk n)
        API->>AS: POST /v1/analyze/audio (chunk, baseline)
        AS-->>API: transcript, word timings, pauses, pitch, rate, events, voice emotion
        Note over API: raw audio dropped from memory here (FR-VOI-09)
        API->>AS: POST /v1/analyze/text (redacted transcript)
        AS-->>API: text indicators
        API->>SC: score(...)
        API->>PU: transcript.appended + assessment.updated
        PU-->>OP: live transcript, SVI gauge, indicators, suggested question
    end
```
Budget per window: ≤ 5 s after the window ends (NFR-PERF-02). The first 20–30 s set the speaker's baseline (`Interaction.voiceBaseline`), and later windows are compared to it (FR-VOI-03).

### 6.3 Critical: alert, emergency panel, escalation
```mermaid
sequenceDiagram
    autonumber
    participant API as API
    participant DB as MongoDB
    participant PU as Pusher
    participant V as Victim UI
    participant CO as On-duty counsellors
    participant JR as Job runner (inside API requests)
    participant SV as Supervisor / District

    API->>DB: band → CRITICAL (override OV-1), cases.overrideLockedBand = CRITICAL
    API->>DB: Recommendation EMERGENCY_SUPPORT (AUTO_TRIGGERED), Alert(OPEN), Job(alert.escalate, +120 s)
    API->>PU: emergency.show → private-interaction-{id}
    PU-->>V: show 112 · Tele-MANAS 14416 · "Call me back now"
    API->>PU: alert.created → private-oncall
    PU-->>CO: banner + sound
    alt acknowledged within 120 s
        CO->>API: POST /alerts/{id}/ack
        API->>DB: acknowledgedAt, cancel job
    else not acknowledged
        JR->>DB: job due (claimed during a dashboard poll) → escalationLevel = 1
        JR->>PU: alert.escalated → private-supervisors (then district at level 2)
        PU-->>SV: escalated alert
    end
```

### 6.4 Recommendation approval → referral (police view stays minimal)
```mermaid
sequenceDiagram
    autonumber
    participant CO as Counsellor
    participant API as /api/v1/staff
    participant DB as MongoDB
    participant PU as Pusher
    participant PL as Police liaison

    CO->>API: POST /recommendations/{id}/decision {approve, note}
    API->>DB: status APPROVED + Referral(actionRequested, locationHint, urgency) + audit
    API->>PU: referral.created → private-role-POLICE_LIAISON-{district}
    PU-->>PL: new action request
    PL->>API: GET /referrals/{id}
    API-->>PL: action, urgency, location hint, contact route (no narrative, no SVI)
    PL->>API: PATCH /referrals/{id} {status: IN_PROGRESS → DONE}
```

### 6.5 Consent withdrawal mid-session
1. `POST /interactions/{id}/consent/withdraw` → a `WITHDRAWN` entry is pushed to `interactions.consents`; `interactions.mode = SAFETY_ONLY`.
2. Any in-flight analysis results that arrive after this are discarded (checked against the mode at write time).
3. `stored_audio` documents are deleted and objects removed; a `retention.purge` job double-checks.
4. The complaint itself (docket and context) stays, so redressal continues (FR-CON-03/04).

---

## 7. Analysis service (AI)

A stateless Python service. The web app is its only client (authenticated with an HMAC-signed header). It never writes to the database.

```mermaid
flowchart TB
    IN["/v1/analyze/audio"] --> DEC["Decode opus → 16 kHz mono"]
    DEC --> VAD["Silero VAD<br/>speech/pause segments"]
    DEC --> STT["STT<br/>Groq Whisper (hi/en/Hinglish)<br/>IndicConformer (regional)"]
    DEC --> PR["Praat (parselmouth)<br/>pitch, jitter, shimmer"]
    DEC --> LB["librosa<br/>energy, deltas"]
    DEC --> EV["Audio event tagger<br/>(YAMNet: crying/sobbing, sighs)"]
    DEC --> SER["Speech emotion model<br/>(emotion2vec+ base)"]
    VAD & STT --> RATE["Pauses + speech rate<br/>(VAD + transcript words)"]
    RATE & PR & LB & EV & SER --> OUTA["Voice features + emotion"]

    TIN["/v1/analyze/text"] --> LID["Language ID<br/>(script check + LLM)"]
    LID --> MT["Translate to EN for analysis<br/>(LLM, same call)"]
    MT --> LLM["LLM with JSON schema:<br/>8 dimensions → indicators<br/>+ evidence quotes + negation flag"]
    MT --> EMO["Text emotion<br/>(LLM field; XLM-EMO backup)"]
    LLM --> MAP["Map EN evidence back<br/>to original-language span"]
    MAP & EMO --> OUTT["Indicators + emotions"]
```

| Function | Primary option | Fallback / low-cost option |
|---|---|---|
| Speech-to-text | Groq `whisper-large-v3-turbo` for Hindi, English, Hinglish; AI4Bharat IndicConformer-600M (self-hosted) for Marathi, Tamil, Bengali | Bhashini ASR API (free, proof-of-concept use); typing or keypad if all fail |
| Pauses | Silero VAD on the raw audio | Energy-threshold VAD (librosa) |
| Pitch, jitter, shimmer | parselmouth (Praat) | librosa `pyin` |
| Speech emotion | emotion2vec+ base (FunASR) | Rule-based mapping from pitch/energy deviation (low weight) |
| Crying, sobbing, sighs | YAMNet audio event classes | Off (feature optional, FR-VOI-05 is "Should") |
| Language ID | Unicode script detection + LLM (in the indicator call) | User's chosen language |
| Translation | LLM (same call as indicators) | IndicTrans2 self-hosted (optional) |
| Indicators | Groq `openai/gpt-oss-120b` (dev: `gpt-oss-20b`) with strict JSON schema output and a compact few-shot prompt | Gemini Flash free tier on rate-limit; safety lexicon only (in the web app) if both fail |
| Text emotion | LLM emotion field | XLM-EMO (4 classes) |

**Guardrails on AI output (validated in the web app, step ④):**
- The response must match the Zod schema exactly; otherwise it is discarded and the call counts as failed.
- Each `evidence.quote` must be found word-for-word in the original message, otherwise that indicator is dropped (AC-NLP-05).
- Scores are clamped to 0–1, and unknown dimensions are rejected.
- The LLM prompt forbids diagnosis wording and asks for `negated: true` on statements like "I would never hurt myself" (FR-NLP-08).

---

## 8. Scoring engine

Pure TypeScript in `src/core/scoring/`, with no I/O, so it is unit-testable (NFR-MNT-03) and deterministic (FR-SVI-07).

```ts
// Simplified signatures
type DimensionScore = { score: number; confidence: number; bySource: Partial<Record<SignalSource, number>> };

function fuseDimensions(input: {
  indicators: IndicatorInput[];        // active, non-negated, reviewed values take priority
  screeners: ScreenerScoreInput[];     // mapped to dimensions (PHQ-2 → DEPRESSION, …)
  context: CaseContextInput | null;    // → EXTREME_VULNERABILITY, INTIMIDATION, …
  config: ScoringConfig;
}): Record<Dimension, DimensionScore>;

function computeSvi(dims: Record<Dimension, DimensionScore>, config: ScoringConfig):
  { svi: number; contributions: Record<Dimension, number>; confidence: number };

function assignBand(svi: number, thresholds: BandThresholds): RiskBand;

function applyOverrides(band: RiskBand, facts: OverrideFacts, rules: OverrideRule[], locked: RiskBand | null):
  { band: RiskBand; fired: string[] };   // can only raise; never below `locked`

function explain(result: AssessmentDraft, lang: "en" | "hi"): string; // FR-RISK-04
```

**Rules that make it safe:**
1. Within one source, a dimension takes the **maximum** indicator score (one strong signal is not diluted by many weak ones).
2. Across sources, scores are combined with the **confidence-weighted average** from REQUIREMENTS Appendix A.
3. **Voice alone is capped**: if VOICE is the only source for a dimension, its score is capped at 0.6 (FR-VOI-08, AC-VOI-05).
4. **Overrides only raise** the band and set `cases.overrideLockedBand`. Later calm messages cannot lower it; only a human band override (`cases.bandOverrides`) can (FR-RISK-03).
5. **Reviewed indicators win**: CONFIRMED/ADJUSTED values replace AI values; REJECTED ones are excluded (FR-IND-05).
6. Every assessment stores `configVersion` and `modelVersions`, so any score can be recomputed and explained later.

---

## 9. Security and privacy architecture

```mermaid
flowchart LR
    subgraph Public
        V["Victim browser"]
    end
    subgraph Edge["Edge / middleware"]
        TLS["TLS · HSTS · CSP"]
        RL["Rate limit<br/>(per IP / session / API key)"]
    end
    subgraph App["Next.js server"]
        AUTH["AuthN<br/>staff: Auth.js + TOTP<br/>victim: session token<br/>integration: API key"]
        RBAC["AuthZ policies<br/>role + district scope"]
        SER["Role serialisers<br/>(field filtering)"]
        RED["PII redaction"]
        ENC["Field encryption<br/>AES-256-GCM"]
    end
    subgraph Data
        DBA[("Assessment data<br/>(pseudonymous)")]
        DBP[("PII vault<br/>SubjectIdentity")]
        AUD[("Audit log<br/>hash-chained")]
    end
    AI["External AI"]

    V --> TLS --> RL --> AUTH --> RBAC --> SER
    RBAC --> ENC --> DBA
    ENC --> DBP
    RBAC --> AUD
    RED -- "no names/phones/addresses" --> AI
```

| Concern | Design | Requirement |
|---|---|---|
| Victim authentication | No login. `POST /interactions` returns a random 256-bit session token in an `HttpOnly; Secure; SameSite=Strict` cookie (and a header for IVRS/API); only its SHA-256 hash is stored; expires after 2 h of inactivity. Quick exit clears it. | FR-CH-09 |
| Staff authentication | Auth.js v5 credentials + TOTP (mandatory for supervisor/admin roles), 15-minute idle timeout, rotating JWT session. | NFR-SEC-02/03 |
| Integration authentication | `Authorization: ApiKey <prefix>.<secret>`; hash stored; scopes; per-key rate limit. | FR-API-02 |
| Authorisation | `can(user, action, resource)` policy table (see `API_CONTRACTS.md` §4), always applied server-side, plus district scoping for district/police/welfare roles. | NFR-PRI-02 |
| Field filtering | Per-role DTO serialisers. Police and welfare serialisers have **no code path** to narrative, indicators or SVI. | C-ETH-02, AC-DSH-01 |
| Encryption at rest | Columns ending in `Enc` hold AES-256-GCM ciphertext with a key ID prefix (key rotation); DB and object storage also encrypted by the provider. | NFR-SEC-01 |
| PII separation | `subject_identities` holds the only copy of name, phone and address, on a **separate Mongoose connection** (`MONGODB_PII_URI`, its own DB user and encryption key); everything else references the pseudonymous `subjects._id`. | NFR-PRI-03 |
| Third-party AI | Redaction before every external call; providers with no-training / zero-retention settings where available. | NFR-SEC-05, NFR-PRI-06 |
| Audio | Processed in memory and dropped; stored only with `audioRetention` consent, encrypted, with `deleteAfter`. | FR-VOI-09 |
| Retention | **TTL indexes** on `messages.purgeAt` and `voice_windows.purgeAt` delete content automatically; the `retention.purge` job clears evidence quotes in `indicators`, summaries and notes, and deletes stored audio files before their documents; `daily_stats` aggregates survive. | NFR-PRI-04 |
| Analytics privacy | Analytics queries run on aggregate views; cells with count < 5 are suppressed in the aggregation pipeline (`$match: { count: { $gte: 5 } }`). | FR-DSH-06 |
| Logging | Structured logs contain IDs and error codes only, never message text. | NFR-REL-03 |
| Web security | Zod validation on every input, CSRF protection (SameSite + origin check), strict CSP, no secrets in client bundles, dependency scanning. | NFR-SEC-04 |

---

## 10. Real-time, jobs and failure handling

### 10.1 Real-time channels (Pusher)
| Channel | Who can subscribe | Events |
|---|---|---|
| `private-interaction-{id}` | Assigned operator/counsellor, supervisors; the victim session (emergency events only) | `transcript.appended`, `assessment.updated`, `emergency.show` |
| `private-queue-{districtId}` / `private-queue-national` | Counsellors, operators, supervisors in scope | `case.updated`, `case.created` |
| `private-oncall` | On-duty counsellors | `alert.created`, `alert.acknowledged` |
| `private-supervisors` | NHAA supervisors | `alert.escalated` |
| `private-role-{ROLE}-{districtId}` | District officer, police liaison, welfare officer | `referral.created`, `referral.updated` |

Channel authorisation goes through `POST /api/v1/realtime/auth`, which applies the same policies as the REST API. Payloads carry IDs plus role-safe summaries; clients fetch details over REST.

### 10.2 Jobs
Jobs live in the `jobs` collection. There is no separate worker process: `core/jobs/runDue()` atomically claims and runs up to 5 due jobs, and is called (a) at the end of `GET /staff/alerts`, which every open staff dashboard polls every 10 s, and (b) from `POST /api/v1/internal/jobs/run` (protected by a secret) for manual or scripted runs. For local development `npm run jobs` calls the same function in a loop.

| Job type | Created when | Action |
|---|---|---|
| `alert.escalate` | Alert opened | If still OPEN: raise `escalationLevel`, notify the next tier, schedule the next escalation |
| `followup.remind` | High/Critical case closed with a follow-up | Notify the assignee when due |
| `retention.purge` | At most once a day (first request after midnight claims it) + on consent withdrawal | Clear evidence quotes, summaries and notes past retention; delete audio objects (messages and voice windows expire via TTL indexes) |
| `stats.rollup` | Hourly | Aggregate anonymised counts into `daily_stats` with `$merge` |
| `rescore` | Analysis degraded, or new active config | Re-run analysis/scoring and save a new snapshot (never lowers locked bands) |

### 10.3 Failure modes
| Failure | Behaviour |
|---|---|
| Analysis service down or slow | Lexicon + screener + context scoring; `limitedConfidence`; `rescore` job; UI shows "Limited AI analysis" badge (NFR-REL-01) |
| Microphone denied / audio fails | Switch to text mode with no data loss (NFR-REL-02) |
| Pusher down | Staff UI polls `GET /alerts?status=OPEN` and the queue every 10 s |
| DB write fails mid-pipeline | Single multi-document transaction (`session.withTransaction`): nothing partial is saved; the client retries with the same `Idempotency-Key` |
| Victim on a slow network | Small JSON responses; text-first UI; audio chunks retried with exponential back-off |

---

## 11. Deployment

```mermaid
flowchart LR
    subgraph Vercel
        N["Next.js app<br/>(route handlers + pages)"]
    end
    subgraph Laptop["Team laptop"]
        A["analysis-service<br/>(Python, CPU)"]
    end
    T["Cloudflare Quick Tunnel"]
    D[("MongoDB Atlas Free")]
    P["Pusher Sandbox"]
    L["Groq · Gemini backup"]
    N --> D
    N --> T
    T --> A
    N --> P
    A --> L
```

| Environment | Setup |
|---|---|
| **Local dev** | MongoDB Atlas Free (no Docker needed); `uvicorn app.main:app --port 8000` in `analysis-service/`; `npm run dev` in `web/`; optional `npm run jobs`; Pusher sandbox app or the local SSE fallback (`REALTIME_DRIVER=sse`). |
| **Demo / staging** | Vercel Hobby (web) + MongoDB Atlas Free + Pusher Sandbox; analysis service on a team laptop exposed with `cloudflared tunnel --url http://localhost:8000` and the URL set as `ANALYSIS_URL`. Seeded with synthetic cases and demo users for each role. All free (see `TOOLS_AND_COSTS.md`). |
| **Production (proposal for NHAA)** | Government cloud (MeghRaj / NIC) in India for data residency, MongoDB Enterprise or Atlas in an Indian region, PII vault in a separate cluster; analysis models self-hosted on GPU; Bhashini for languages; VPC-only traffic between services. |

**Environment variables (main):** web: `MONGODB_URI`, `MONGODB_PII_URI`, `ENCRYPTION_KEYS` (JSON of key ID → base64 key), `ENCRYPTION_ACTIVE_KEY`, `AUTH_SECRET`, `ANALYSIS_URL`, `ANALYSIS_HMAC_SECRET`, `PUSHER_APP_ID/KEY/SECRET/CLUSTER`, `JOBS_SECRET`. Analysis service: `ANALYSIS_HMAC_SECRET`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `HF_TOKEN` (to download IndicConformer), optional `BHASHINI_USER_ID` / `BHASHINI_API_KEY`.

---

## 12. Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router), React, **TypeScript** (strict) |
| UI | Tailwind CSS + shadcn/ui; Recharts for dashboards; `next-intl` for i18n (en, hi, mr, ta, bn) |
| Validation and contracts | **Zod** schemas shared by routes and client; OpenAPI generated from Zod (`zod-to-openapi`) |
| Database | **MongoDB 8** (Atlas) + **Mongoose 9** (schemas, validation, indexes); Zod at the API boundary |
| Auth | Auth.js v5 (credentials + TOTP via `otplib`) for staff; custom session tokens for victims; API keys for integrations |
| Real-time | Pusher Channels (`pusher` server, `pusher-js` client); SSE fallback for local dev |
| Rate limiting | MongoDB-backed fixed-window counters (Upstash free tier optional) |
| Audio capture | MediaRecorder (opus/webm, 5 s timeslice) |
| Analysis service | Python 3.12, FastAPI, Pydantic, `groq` SDK, silero-vad, praat-parselmouth, librosa, funasr (emotion2vec+), transformers (IndicConformer) |
| Testing | Vitest (unit, scoring), Playwright (E2E per role), pytest (analysis), k6 (latency checks) |
| Quality | ESLint, Prettier, Ruff, GitHub Actions CI |

> Versions checked 14 Nov 2026: Next.js 16.4.x and Mongoose 9.12.x are current; Auth.js v5 is still published as beta.

---

## 13. Repository structure

```
/
├── web/                                # Next.js app
│   ├── scripts/
│   │   ├── seed.ts                     # demo users per role + synthetic cases
│   │   └── sync-indexes.ts             # Model.syncIndexes() for every model (run on deploy)
│   ├── messages/                       # i18n: en.json hi.json mr.json ta.json bn.json
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                # public home page (FRONTEND_UX_PRODUCT_BRIEF.md §2)
│   │   │   ├── portal/[locale]/        # victim intake: start, consent, chat, voice, ivrs
│   │   │   ├── (staff)/
│   │   │   │   ├── operator/           # live call console
│   │   │   │   ├── counsellor/         # queue, case/[id]
│   │   │   │   ├── district/
│   │   │   │   ├── police/
│   │   │   │   ├── welfare/
│   │   │   │   ├── analytics/          # state + ministry
│   │   │   │   └── admin/              # users, scoring configs, audit
│   │   │   └── api/v1/
│   │   │       ├── victim/…            # session-token API
│   │   │       ├── staff/…             # Auth.js session API
│   │   │       ├── integration/…       # API-key API
│   │   │       └── realtime/auth/
│   │   ├── core/
│   │   │   ├── conversation/           # flow.ts, prompts.ts
│   │   │   ├── consent/
│   │   │   ├── safety-lexicon/         # engine.ts + rules/{en,hi,hinglish,mr,ta,bn}.json
│   │   │   ├── scoring/                # fuse.ts svi.ts bands.ts overrides.ts explain.ts
│   │   │   ├── recommendations/
│   │   │   ├── cases/  alerts/  audit/
│   │   │   ├── privacy/                # redact.ts crypto.ts
│   │   │   ├── policies/               # rbac.ts serializers.ts
│   │   │   └── analysis-client/
│   │   ├── contracts/                  # Zod schemas = API contracts
│   │   ├── lib/                        # db.ts (cached Mongoose connection), realtime.ts, ratelimit.ts
│   │   └── models/                     # Mongoose models (one file per collection)
│   ├── scripts/jobs.ts                # local loop calling core/jobs/runDue()
│   └── tests/{unit,e2e}/
├── analysis-service/                   # Python FastAPI
│   ├── app/{main.py, audio/, text/, models/, schemas.py}
│   ├── tests/
│   └── requirements.txt
├── evaluation/                         # synthetic scenario set + scripts (AC-EVAL-01)
│   ├── scenarios/*.json
│   ├── audio/
│   └── run_eval.ts                     # band accuracy, recall, fairness report
├── docs/                               # REQUIREMENTS, ARCHITECTURE, DATABASE, API_CONTRACTS, TOOLS_AND_COSTS, IMPLEMENTATION_PLAN
└── CLAUDE.md
```

---

## 14. Requirements coverage

| Requirement group | Where it lives |
|---|---|
| FR-CH (channels) | Victim UI routes, operator console, IVRS simulation page, `conversation` |
| FR-CON (consent) | `consent` module, `interactions.consents[]`, consent endpoints |
| FR-VOI (voice) | MediaRecorder client, `/v1/analyze/audio`, `voice_windows` |
| FR-NLP, FR-EMO | `safety-lexicon`, `/v1/analyze/text`, `indicators`, guardrail validation |
| FR-SCR | `conversation` (screener steps), `interactions.screenerResponses` / `screenerScores` |
| FR-IND, FR-SVI, FR-RISK | `scoring`, `indicators`, `assessments`, `scoring_configs`, `cases.bandOverrides` |
| FR-REC | `recommendations` module, `recommendations` + `referrals` collections |
| FR-LANG | `next-intl` messages, lexicon rules per language, LID/MT in the analysis service |
| FR-CASE, FR-ALR, FR-DSH | `cases`, `alerts`, staff pages, Pusher channels, in-request job runner |
| FR-API | `/api/v1/integration/*`, `api_clients` |
| FR-AUD | `audit` module, `audit_logs` |
| NFR-PRI, NFR-SEC | §9 |
| NFR-ETH | ADR-3, ADR-4, §8 rules, victim response contract |
| NFR-PERF | §5 latency budget, §6.2 window budget |
| NFR-REL | §10.3 |
| NFR-MNT | ADR-2, ADR-4, repository structure, tests |
| NFR-ACC | Victim UI: WCAG 2.1 AA components (shadcn/Radix), audio for every scripted prompt (`Prompt.audioUrl`), voice input, icon-first layout, text-first pages under ~150 KB so they work on low-end phones over 3G; checked with Lighthouse/axe in CI |
