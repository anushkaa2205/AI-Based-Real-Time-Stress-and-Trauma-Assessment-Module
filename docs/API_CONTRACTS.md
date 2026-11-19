# API Contracts
## AI-Based Real-Time Stress and Trauma Assessment Module (SIH26093)

> Companion documents: `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATABASE.md`, `models.ts`.
> In code, every contract below is a **Zod schema in `src/contracts/`**. Route handlers validate with it, the client imports its types, and the OpenAPI spec is generated from it, so this document and the code cannot drift apart.

---

## Contents
1. [Conventions](#1-conventions)
2. [Shared types](#2-shared-types)
3. [Victim API (removed)](#3-victim-api-removed)
4. [Authorisation matrix](#4-authorisation-matrix)
5. [Staff API](#5-staff-api)
6. [Integration API](#6-integration-api)
7. [Real-time events](#7-real-time-events)
8. [Internal analysis-service API](#8-internal-analysis-service-api)
9. [Errors](#9-errors)
10. [Endpoint ↔ requirement map](#10-endpoint--requirement-map)

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base URL | `https://<host>/api/v1`. Two surfaces: `/integration/*` (the module's only input, API keys) and `/staff/*` (dashboards); plus `/realtime/auth`. |
| Format | JSON (`application/json; charset=utf-8`), except audio upload (`multipart/form-data`). Field names in camelCase. |
| IDs | MongoDB ObjectId as a 24-character hex string. Docket numbers are separate strings. |
| Time | ISO 8601 in UTC (`2026-11-14T11:33:12Z`). Durations in milliseconds (`…Ms`) or seconds (`…Sec`). |
| Languages | BCP-47: `en`, `hi`, `hi-Latn` (Romanised Hindi / Hinglish), `mr`, `ta`, `bn`. |
| Staff auth | Auth.js session cookie. TOTP required for `NHAA_SUPERVISOR`, `STATE_ADMIN`, `MINISTRY_ADMIN`, `SYS_ADMIN`, `AUDITOR`. 15-minute idle timeout. |
| Integration auth | `Authorization: ApiKey <prefix>.<secret>` with scopes (§6). |
| Idempotency | Integration `POST /messages` and `/audio` take `Idempotency-Key: <uuid>`. A repeated key returns the **original response** (status `200`, header `Idempotent-Replay: true`). Needed for retries on slow networks. |
| Pagination | Cursor-based: `?limit=50&cursor=<opaque>` → `{ items, nextCursor }`. Max `limit` 100. |
| Rate limits | Staff: 300/min per user. Integration: per key (`rateLimitPerMin`). Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. Over the limit → `429`. |
| Errors | `application/problem+json` (RFC 9457) with a stable `code` (§9). |
| Versioning | Breaking changes get `/api/v2`; additive fields don't. Clients must ignore unknown fields. |
| Field filtering | Responses for staff are **shaped by role on the server** (§4). The same endpoint can return fewer fields to a less-privileged role, and never more. |
| Victim safety rule | The integration `/messages`, `/audio` and `/context` responses are what a calling system may show the person: they carry **no SVI, band, indicator names or scores** (NFR-ETH-02), only `showEmergencyPanel` and the `emergency` text. Scores are read separately (`GET …/assessment`, scope `assessments:read`) for authorised reviewers. |
| Inputs | Exactly two: **text messages** and **voice audio** (FR-CH-01). No endpoint accepts structured answers or key presses. |

---

## 2. Shared types

```ts
// src/contracts/common.ts (as TypeScript types; the Zod schemas mirror these exactly)
type ObjectId = string;            // 24-hex
type Iso = string;                 // ISO 8601 UTC
type Lang = "en" | "hi" | "hi-Latn" | "mr" | "ta" | "bn";

type Channel = "PORTAL" | "CHATBOT" | "VOICE_CALL" | "IVRS" | "MOBILE_APP" | "OPERATOR_ASSISTED" | "API";
type AssessmentMode = "SAFETY_ONLY" | "TEXT_ONLY" | "VOICE_ONLY" | "FULL";
type RiskBand = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
type Dimension =
  | "ACUTE_STRESS" | "SEVERE_TRAUMA" | "FEAR_ANXIETY" | "DEPRESSION"
  | "SUICIDAL_IDEATION" | "INTIMIDATION" | "SOCIAL_ISOLATION" | "EXTREME_VULNERABILITY";
type SignalSource = "TEXT_NLP" | "SAFETY_LEXICON" | "VOICE" | "CONTEXT";   // SCREENER removed (config v3)
type SupportType =
  | "COUNSELLING" | "LEGAL_AID" | "MEDICAL_ASSISTANCE" | "POLICE_INTERVENTION"
  | "WITNESS_PROTECTION" | "EMERGENCY_SUPPORT" | "REHABILITATION_RELIEF" | "INFORMATION";
type Urgency = "IMMEDIATE" | "WITHIN_15_MIN" | "WITHIN_24_H" | "WITHIN_72_H" | "NONE";
type Role =
  | "OPERATOR" | "NHAA_SUPERVISOR" | "COUNSELLOR" | "DISTRICT_OFFICER" | "POLICE_LIAISON"
  | "WELFARE_OFFICER" | "STATE_ADMIN" | "MINISTRY_ADMIN" | "SYS_ADMIN" | "AUDITOR";

/** Returned to the calling system to show the person (FR-REC-06). Scripted, pre-translated (ADR-3). */
interface EmergencyPanel {
  numbers: { label: string; number: string }[];  // 112, Tele-MANAS 14416, NHAA 14566
  message: string;                     // localised, calm wording
}

/** Staff-only. Never sent to victims. */
interface AssessmentDto {
  id: ObjectId;
  interactionId: ObjectId;
  seq: number;
  trigger: "TEXT_MESSAGE" | "VOICE_WINDOW" | "CONTEXT_UPDATE" | "INDICATOR_REVIEW" | "CONFIG_RESCORE";
  svi: number;                          // 0–100
  computedBand: RiskBand;
  band: RiskBand;
  overridesFired: string[];             // ["OV-2"]
  dimensions: Record<Dimension, {
    score: number; confidence: number; contribution: number;
    bySource: Partial<Record<SignalSource, number>>;
  }>;
  confidence: number;
  limitedConfidence: boolean;
  topEvidence: { indicatorId: ObjectId; dimension: Dimension; label: string }[];
  explanation: string;
  configVersion: number;
  createdAt: Iso;
}

interface IndicatorDto {
  id: ObjectId;
  dimension: Dimension;
  source: SignalSource;
  score: number;
  confidence: number;
  negated: boolean;
  status: "ACTIVE" | "CONFIRMED" | "REJECTED" | "ADJUSTED";
  evidence:
    | { type: "TEXT_SPAN"; messageId: ObjectId; spanStart: number; spanEnd: number; quote: string; quoteTranslated?: string }
    | { type: "ACOUSTIC_EVENT"; voiceWindowId: ObjectId; eventType: string; atMs: number }
    | { type: "CONTEXT_FIELD"; field: string };
  review?: { score?: number; reason: string; by: { id: ObjectId; name: string }; at: Iso };
  createdAt: Iso;
}

interface RecommendationDto {
  id: ObjectId;
  type: SupportType;
  ruleId: string;
  reason: string;
  urgency: Urgency;
  dueAt?: Iso;
  responsibleRole: Role;
  legalBasis?: string;
  status: "PROPOSED" | "APPROVED" | "REJECTED" | "AUTO_TRIGGERED" | "SUPERSEDED";
  decision?: { by: { id: ObjectId; name: string }; at: Iso; reason?: string };
  referralId?: ObjectId;
}

/** The ONLY case data police and welfare roles receive (C-ETH-02) */
interface ReferralDto {
  id: ObjectId;
  docketNumber: string;
  type: SupportType;
  actionRequested: string;
  locationHint?: string;
  contactRoute: string;
  urgency: Urgency;
  dueAt?: Iso;
  status: "PENDING" | "ACCEPTED" | "IN_PROGRESS" | "DONE" | "DECLINED";
  outcomeNote?: string;
  createdAt: Iso;
  /** Created through the demo input layer (task M.7): shown as a Demo mark. A flag, never case content. */
  isDemo?: boolean;
}

interface Page<T> { items: T[]; nextCursor: string | null }
```

---

## 3. Victim API (removed)

*Removed 16 Nov 2026 (`PRODUCT_VISION.md` §5, decisions Q1 and Q3).* The module has no victim-facing API, no session token, no question flow (`/next`), no `/screeners`, no language switch and no callback request. NHAA's systems own the person's interface and send what the person said or wrote through the **integration API (§6)**, which is the module's only input. The request bodies the integration API reuses (consent, audio window, case context) are defined in §6.

---

## 4. Authorisation matrix

✅ = allowed · 🔸 = allowed within the user's district/state scope only · 🔒 = allowed with reduced fields · — = forbidden (`403`)

| Endpoint group | OPERATOR | NHAA_SUPERVISOR | COUNSELLOR | DISTRICT_OFFICER | POLICE_LIAISON | WELFARE_OFFICER | STATE_ADMIN | MINISTRY_ADMIN | SYS_ADMIN | AUDITOR |
|---|---|---|---|---|---|---|---|---|---|---|
| Queue `GET /cases` | ✅ | ✅ | ✅ | 🔸🔒 | — | — | 🔸🔒 | — | — | — |
| Case detail `GET /cases/{id}` | ✅ (own calls) | ✅ | ✅ (assigned or on-duty) | 🔸🔒 | — | — | 🔸🔒 (escalated only) | — | — | — |
| Transcript, indicators, evidence | ✅ (own calls) | ✅ (needs `shareWithCounsellor`, or handled the live call) | ✅ (needs `shareWithCounsellor`) | — | — | — | — | — | — | — |
| Assessments / SVI timeline | ✅ | ✅ | ✅ | 🔸🔒 (band + SVI only) | — | — | — | — | — | — |
| Review indicator, override band, notes | — | ✅ | ✅ | — | — | — | — | — | — | — |
| Decide recommendation | — | ✅ | ✅ | 🔸 (police/protection types) | — | — | — | — | — | — |
| Referrals `GET /referrals` | — | ✅ | ✅ | 🔸 | 🔸 (own role) | 🔸 (own role) | 🔸 | — | — | — |
| Update referral status | — | ✅ | — | 🔸 | 🔸 | 🔸 | — | — | — | — |
| Alerts (list, ack) | ✅ | ✅ | ✅ | 🔸 (escalated) | — | — | — | — | — | — |
| Follow-ups | — | ✅ | ✅ | 🔸 | — | — | — | — | — | — |
| Analytics | — | ✅ | — | 🔸 | — | — | 🔸 | ✅ | — | — |
| Identity (PII) `GET /cases/{id}/identity` | — | ✅ | ✅ (assigned + consent) | — | — | — | — | — | — | — |
| Scoring configs | — | — | — | — | — | — | — | — | ✅ | ✅ (read) |
| Users, API clients | — | — | — | — | — | — | — | — | ✅ | — |
| Audit logs, chain verify | — | — | — | — | — | — | — | — | — | ✅ |
| Demo input layer `/`, `/start`, `/start/write`, `/start/speak`, `/track`, `/api/demo/*` (public since Phase N, the portal journey since Phase P, only when `DEMO_ENABLED`, §6.5) | public | public | public | public | public | public | public | public | public | public |
| Take the live demo line over (`demo.use`, §6.5) | — | ✅ | — | — | — | — | — | — | — | — |

**Integration API keys** are not staff roles: they are authorised by **scope** (§6), checked in `core/integration` (`403 SCOPE_MISSING`), and only ever for the client's own interactions and cases (`404` otherwise):

| Scope | Endpoints |
|---|---|
| `interactions:write` | `POST /interactions`, `/messages`, `/audio`, `PUT /context`, `PUT /language` (§6.8), `/consent/withdraw`, `/end` |
| `assessments:read` | `GET /assessment`, `GET /recommendations` |
| `stream:read` | `GET /stream` |
| `indicators:read` | `GET /indicators` (§6.4a) |
| `status:read` | `GET /cases/{docket}/status` (§6.6) |
| `questions:read` | `GET /interactions/{id}/next-question` (§6.7, Phase P) |

The demo key's scopes include `interactions:write`, `status:read` and `questions:read` (`npm run api:client -- --demo` grants every scope unless `--scopes` is given).

Rules enforced in `src/core/policies`:
1. **Police and welfare roles have no route to case, interaction, message, indicator or assessment data.** Requests return `403` (AC-DSH-01).
2. **District and state roles** see band and SVI, never transcripts or indicator evidence.
3. **Transcripts and evidence** need the victim's `shareWithCounsellor` consent, except for the NHAA staff handling the live interaction.
4. Every read of case detail, transcript or identity writes an audit entry (`case.view`, `transcript.view`, `identity.view`).

---

## 5. Staff API

Base: `/api/v1/staff`. Auth.js session. Responses shaped by role (§4).

### 5.1 Session
| Method | Path | Body → Response |
|---|---|---|
| `POST` | `/auth/login` | `{ email, password }` → `200 { requiresTotp: boolean }` |
| `POST` | `/auth/totp` | `{ code }` → `200 { user: { id, name, role, districtId, stateId } }` |
| `POST` | `/auth/logout` | → `204` |
| `GET` | `/me` | → `200 { id, name, role, districtId, stateId, languages, isOnDuty }` |
| `PATCH` | `/me/duty` | `{ isOnDuty: boolean }` → `200` (alert routing, FR-ALR-01) |

### 5.2 Case queue and detail
#### `GET /cases`
Query: `status` (multi), `band` (multi), `districtId`, `assignedTo=me|unassigned|<id>`, `channel`, `language`, `from`, `to`, `docket` (docket number or its start, case-insensitive), `limit`, `cursor`.
Sorted by **band ↓, SVI ↓, waiting time ↑** (FR-CASE-01).

**200** `Page<CaseQueueItem>`
```json
{
  "items": [
    {
      "id": "6735a1f0c2a4b1e0f0a10001",
      "docketNumber": "NHAA-2026-MH-004512",
      "band": "CRITICAL",
      "svi": 81,
      "status": "UNDER_REVIEW",
      "channel": "CHATBOT",
      "language": "hi",
      "district": { "id": "…", "name": "Pune" },
      "assignedTo": { "id": "…", "name": "Dr. A. Kulkarni" },
      "waitingSince": "2026-11-14T11:32:05Z",
      "topReason": "Accused reported outside the house now",
      "isDemo": false,
      "limitedConfidence": false,
      "openAlert": { "id": "…", "level": "CRITICAL", "escalationLevel": 0 }
    }
  ],
  "nextCursor": null
}
```

#### `GET /cases/{id}`
**200** `CaseDetailDto` (full version for counsellor/supervisor):
```json
{
  "id": "…",
  "docketNumber": "…",
  "status": "UNDER_REVIEW",
  "band": "CRITICAL",
  "svi": 81,
  "overrideLockedBand": "CRITICAL",
  "summary": "…",
  "summaryTranslated": "…",
  "consent": { "textAnalysis": true, "voiceAnalysis": true, "shareWithCounsellor": true, "followUpContact": true },
  "context": { "accusedNearby": true, "ongoingThreats": true, "supportPersonPresent": false },
  "interactions": [{ "id": "…", "channel": "CHATBOT", "startedAt": "…", "endedAt": null, "status": "ACTIVE" }],
  "latestAssessment": "AssessmentDto",
  "recommendations": ["RecommendationDto"],
  "openAlerts": [{ "id": "…", "level": "CRITICAL", "createdAt": "…" }],
  "bandOverrides": [],
  "assignedTo": { "id": "…", "name": "…" }
}
```
For `DISTRICT_OFFICER` / `STATE_ADMIN` the response omits `summary`, `summaryTranslated`, `context` and the assessment `dimensions`/`topEvidence` (🔒).

#### `PATCH /cases/{id}`
`{ "status"?: CaseStatus, "assignedCounsellorId"?: ObjectId | null }` → `200 CaseDetailDto`. Closing a High/Critical case without a follow-up or a reason → `422 FOLLOW_UP_REQUIRED`.

#### `POST /cases/{id}/band-override`
`{ "toBand": "HIGH", "reason": "Spoke to victim; now with family and safe" }` → `201 { band, overrideLockedBand }`.
`reason` must be at least 5 characters, otherwise `422 REASON_REQUIRED` (FR-RISK-03, FR-CASE-04, AC-CASE-02).

#### `GET /cases/{id}/notes` · `POST /cases/{id}/notes`
`POST { "body": "…" }` → `201 { id, body, author, createdAt }`.

#### `GET /cases/{id}/identity`
→ `200 { fullName, phone, address }`, with an audit entry `identity.view`. Requires the assigned counsellor or a supervisor, plus consent (§4).

### 5.3 Interaction data
| Method | Path | Response |
|---|---|---|
| `GET` | `/interactions/{id}/transcript?cursor=` | `Page<{ id, seq, sender, modality, text, translation, language, sttConfidence, createdAt }>` |
| `GET` | `/interactions/{id}/assessments?from=&to=` | `{ items: AssessmentDto[] }` (SVI timeline, FR-SVI-05) |
| `GET` | `/interactions/{id}/assessments/current` | `AssessmentDto` |
| `GET` | `/interactions/{id}/indicators?dimension=&status=` | `{ items: IndicatorDto[] }` |
| `GET` | `/interactions/{id}/voice?fromWindow=` | `{ items: [{ windowIndex, startMs, endMs, pauses, pitch, speechRateWpm, energy, events, emotion }] }` |
| `GET` | `/interactions/{id}/emotions` | `{ items: [{ atMs, text: {label, confidence}, voice: {label, confidence}, fused: {label, confidence} }] }` (FR-EMO-03) |
| `POST` | `/interactions/{id}/operator-message` | Operator types what the caller said during a live call: `{ text }` → same pipeline as integration `/messages` with `sender: "VICTIM"`; `201 { messageId }` |
| `GET` | `/interactions/{id}/suggested-questions` | `{ items: [{ key, text, textEn, reason }] }` (operator console, FR-CH-04): scripted, pre-translated questions for the operator to ask **aloud**; safety questions first, then what the evidence points at. The module never asks them itself, and the answers arrive as speech. The same rules serve a calling system's chatbot through integration `GET …/next-question` (§6.7). |

### 5.4 Indicator review (FR-IND-05)
#### `PATCH /indicators/{id}`
```json
{ "action": "REJECT", "reason": "Quote refers to a film, not the caller" }
```
`action`: `CONFIRM` | `REJECT` | `ADJUST` (requires `score` 0–1).
**200** `{ "indicator": IndicatorDto, "assessment": AssessmentDto }`: the SVI is recalculated immediately with trigger `INDICATOR_REVIEW`. A safety-override lock is **not** released by this; only `band-override` can do that.

### 5.5 Recommendations and referrals
#### `GET /recommendations?status=PROPOSED&responsibleRole=&districtId=`
Approval inbox → `Page<RecommendationDto & { caseId, docketNumber, band }>`.

#### `POST /recommendations/{id}/decision`
```json
{
  "decision": "APPROVE",
  "reason": "Confirmed by phone",
  "referral": {
    "actionRequested": "Urgent protection visit today",
    "locationHint": "Ward 7, Village X",
    "assignedToId": null
  }
}
```
`decision`: `APPROVE` | `REJECT` | `POST_REVIEW` (for AUTO_TRIGGERED emergency recommendations, FR-REC-05).
**200** `{ "recommendation": RecommendationDto, "referral": ReferralDto | null }`.
The `referral` text is what police and welfare will see: the UI warns the counsellor not to include clinical detail, and the server rejects text over 300 characters (`422 REFERRAL_TOO_DETAILED`).

#### `GET /referrals?status=&type=`
Police/welfare: their role and district only → `Page<ReferralDto>`.

#### `GET /referrals/{id}` → `ReferralDto`

#### `PATCH /referrals/{id}`
`{ "status": "IN_PROGRESS" | "DONE" | "DECLINED", "outcomeNote"?: string, "declinedReason"?: string }` → `200 ReferralDto`.
Allowed transitions: PENDING → ACCEPTED → IN_PROGRESS → DONE; any open status → DECLINED (reason required). Otherwise `409 INVALID_TRANSITION`.

### 5.6 Alerts (FR-ALR)
| Method | Path | Body → Response |
|---|---|---|
| `GET` | `/alerts?status=OPEN&level=` | `Page<{ id, caseId, docketNumber, level, reason, status, escalationLevel, createdAt, acknowledgedAt }>` (also the polling fallback when real time is down) |
| `POST` | `/alerts/{id}/ack` | `{}` → `200 { id, status: "ACKNOWLEDGED", acknowledgedAt, acknowledgedBy }`; a second ack → `409 ALREADY_ACKNOWLEDGED` |
| `POST` | `/alerts/{id}/resolve` | `{ note }` → `200` |

### 5.7 Follow-ups (FR-REC-09)
| Method | Path | Body → Response |
|---|---|---|
| `GET` | `/follow-ups?status=SCHEDULED&due=today` | `Page<{ id, caseId, docketNumber, dueAt, channel, status, assignedTo }>` |
| `POST` | `/cases/{id}/follow-ups` | `{ dueAt, channel, assignedToId? }` → `201` |
| `PATCH` | `/follow-ups/{id}` | `{ status, outcomeNote? }` → `200` |

### 5.8 Analytics (FR-DSH-06): anonymised only
All analytics endpoints take `scope=national|state|district`, `stateId`, `districtId`, `from`, `to`, `channel`, `language`, and `demo=include|exclude|only` (default `include`; demo cases are tagged on the server, §6.5, task M.7). **Any group with a count below 5 is returned as `null` with `suppressed: true`.**

| Path | Response |
|---|---|
| `GET /analytics/summary` | `{ interactions, byBand: {LOW, MODERATE, HIGH, CRITICAL}, criticalAlerts, medianAckSec, medianFirstResponseSec, referralsCreated, referralsDone, slaBreaches }` |
| `GET /analytics/heatmap` | `{ items: [{ districtId, districtName, criticalPer1000, highPer1000, count, suppressed }] }` |
| `GET /analytics/trends?interval=day|week` | `{ items: [{ period, byBand, topDimensions: [{dimension, share}] }] }` |
| `GET /analytics/capacity` | `{ items: [{ districtId, supportType, demand, completed, avgDaysToComplete }] }` (demand vs. capacity, EO-4) |
| `GET /analytics/fairness` | `{ items: [{ group: "language:hi", n, bandAccuracy?, alertRate }] }` (evaluation mode only, NFR-ETH-04) |
| `GET /analytics/export.csv` | CSV of the summary (FR-DSH-08) |

### 5.9 Administration
| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/scoring-configs` | List versions |
| `POST` | `/admin/scoring-configs` | New version (inactive). Validates that weights sum to 1 and thresholds are increasing → `422 INVALID_CONFIG` otherwise |
| `POST` | `/admin/scoring-configs/{id}/activate` | Activates the version; queues `rescore` jobs for active interactions (bands never lowered below locks) |
| `POST` | `/admin/scoring-configs/{id}/simulate` | Runs the evaluation set with this config → `{ bandAccuracy, recallSuicidal, recallDanger, confusionMatrix }` (no data written) |
| `GET/POST/PATCH` | `/admin/users`, `/admin/users/{id}` | Create users, change role, deactivate |
| `GET/POST/DELETE` | `/admin/api-clients`, `/admin/api-clients/{id}` | The key secret is shown **once** at creation. `isDemo` (default false) marks the demo input layer's client: everything it creates is tagged demo (§6.5) |
| `GET` | `/admin/audit?entityType=&entityId=&actorId=&from=&to=` | Auditor only |
| `GET` | `/admin/audit/verify` | `{ ok: boolean, checked: number, firstBrokenId?: string }` (FR-AUD-03) |
| `GET` | `/health` | `{ db: "ok", analysis: "ok"|"degraded", realtime: "ok" }` |

---

## 6. Integration API

Base: `/api/v1/integration`. **The module's only input interface** (FR-API-05), for NHAA's systems (chatbot, helpline / call-centre software, IVRS platform, mobile app, portal, operator desk) and the demo input layer. `Authorization: ApiKey <prefix>.<secret>`.

| Scope | Allows |
|---|---|
| `interactions:write` | Start interactions, send text and audio, send case context, change the conversation's language, withdraw consent, end |
| `assessments:read` | Read current assessment and recommendations for interactions this client created |
| `stream:read` | Subscribe to the live stream of an interaction this client created |
| `indicators:read` | Read indicators with their evidence for interactions this client created (§6.4a, task M.5). Granted only to systems that need it; never shown to the person |
| `status:read` | Read a case's status and arranged support for cases this client created (§6.6, task N.3). Safe for a tracking page in the calling system |
| `questions:read` | Read the next scripted question for the calling system's chatbot, for interactions this client created (§6.7, task P.3). Safe to show the person: scripted wording only |

| Method | Path | Request → Response |
|---|---|---|
| `POST` | `/interactions` | `{ channel, language, docketNumber, districtCode?, externalRef?, consent: ConsentRequest }` → `201 { interactionId, mode }`. **The integrating system must have collected consent** and passes the exact notice version it showed. |
| `POST` | `/interactions/{id}/messages` | `{ text, sender: "VICTIM" \| "OPERATOR" }` → `201 { messageId, showEmergencyPanel, emergency }` (§6.2) |
| `POST` | `/interactions/{id}/audio` | Audio window (§6.3) → `202` |
| `PUT` | `/interactions/{id}/context` | Case context from NHAA's record (§6.4) → `200 { showEmergencyPanel, emergency }` |
| `PUT` | `/interactions/{id}/language` | `{ language }` → `200 { language, asked: [{ key, text }] }` (§6.8) |
| `POST` | `/interactions/{id}/consent/withdraw` | `{ reason?: string }` → `200 { mode: "SAFETY_ONLY" }` (§6.1) |
| `GET` | `/interactions/{id}/assessment` | `200 { svi, band, confidence, limitedConfidence, explanation, overridesFired, topDimensions: [{dimension, score}], updatedAt }` |
| `GET` | `/interactions/{id}/recommendations` | `200 { items: RecommendationDto[] }` |
| `GET` | `/interactions/{id}/indicators` | `200 { items: IntegrationIndicator[] }` (§6.4a), scope `indicators:read` |
| `GET` | `/cases/{docket}/status` | `200 CaseStatusResponse` (§6.6), scope `status:read` |
| `GET` | `/interactions/{id}/next-question` | `200 { question: { key, text } \| null }` (§6.7), scope `questions:read` |
| `GET` | `/interactions/{id}/stream` | **Server-Sent Events**: `event: assessment.updated` / `event: emergency.show` / `event: recommendation.created`, with the payloads in §7 (FR-API-03) |
| `POST` | `/interactions/{id}/end` | `{ reason }` → `200` |

Example SSE frame:
```
event: assessment.updated
id: 6735a1f0c2a4b1e0f0a1as07
data: {"interactionId":"6735a1f0c2a4b1e0f0a1in01","svi":81,"band":"CRITICAL","seq":7,"at":"2026-11-14T11:33:12Z"}
```

Errors specific to integration: `401 INVALID_API_KEY`, `403 SCOPE_MISSING`, `404` for interactions created by another client, `429 RATE_LIMITED`.

**Contract version (task M.6, gap V2).** Every integration response, errors included, carries `X-Contract-Version` (now `1.4`: `PUT /interactions/{id}/language` added to 1.3, which had added `GET /interactions/{id}/next-question` to 1.2, which had added `GET /cases/{docket}/status` to 1.1, which had added `inputMethod` and `GET …/indicators` to 1.0). The path stays `/api/v1`; additions are backwards compatible, and a breaking change would mean `/api/v2`.

### 6.1 Consent
The calling system obtains consent in its own workflow and sends it on start as `consent: ConsentRequest`:
```json
{
  "noticeVersion": "2026-11-v1",
  "language": "hi",
  "textAnalysis": true,
  "voiceAnalysis": true,
  "shareWithCounsellor": true,
  "followUpContact": false,
  "audioRetention": false,
  "guardianConsent": null
}
```
If every analysis option is `false` → `mode: "SAFETY_ONLY"`: the interaction is recorded and routed, and only the safety lexicon runs (FR-CON-03). For minors without a guardian: `SAFETY_ONLY` (FR-CON-05). `POST /interactions/{id}/consent/withdraw` stops analysis at once, sets `SAFETY_ONLY` and deletes any stored audio (FR-CON-04, AC-CON-04).

### 6.2 Text messages
Headers: `Idempotency-Key`. Optional `inputMethod` (task M.6): `"TEXT"` (typed, default) or `"TRANSCRIPT"` (the calling system's own speech-to-text); stored beside `modality`, separate from `channel`, never scored differently. `sender` is `"VICTIM"` (the person, default) or `"OPERATOR"` (NHAA's chatbot or operator, for example the question "Are you safe right now?"). Operator turns are stored as context and never scored (FR-CH-02, AC-CH-07). The person's next message is read with the operator turn just before it (FR-NLP-11, task M.9): question-aware rules score short answers to the four safety questions and to the PHQ-2, GAD-2 and PC-PTSD-5 wellbeing questions (REQUIREMENTS Appendix A, B), and the AI receives the question as `previousQuestion`. The scripted wording of these questions is in `messages/*.json` (`operatorQuestions.*`).

**201** (person's message):
```json
{
  "messageId": "6735a1f0c2a4b1e0f0a1ms09",
  "showEmergencyPanel": true,
  "emergency": {
    "numbers": [
      { "label": "Police / Emergency", "number": "112" },
      { "label": "Tele-MANAS", "number": "14416" },
      { "label": "NHAA", "number": "14566" }
    ],
    "message": "…"
  }
}
```
- Returns within **3 s** (NFR-PERF-01); analysis happens before the response, so `showEmergencyPanel` reflects this message. `emergency` is in the interaction's language, for the calling system to show the person.
- Text limit 2,000 characters. In `SAFETY_ONLY` mode the text is stored but only the safety lexicon runs.

### 6.3 Audio windows
`multipart/form-data`, headers: `Idempotency-Key`.

| Part | Type | Notes |
|---|---|---|
| `audio` | file | `audio/webm;codecs=opus` or `audio/ogg`, ≤ 6 s, ≤ 200 KB |
| `windowIndex` | int | 0, 1, 2… (order and de-duplication) |
| `startMs` | int | Offset from call start |
| `audioSource` | `CALLER_ONLY` \| `MIXED` | Optional, default **`MIXED`**. `CALLER_ONLY`: the caller's own channel (call centres usually record agent and caller separately). `MIXED`: both voices in one recording (FR-VOI-10). |
| `inputMethod` | `LIVE_AUDIO` \| `RECORDED_AUDIO` | Optional, default `LIVE_AUDIO` (task M.6): windows sent during the call, or cut from a recording. Stored with the window and its transcript. |
| `firstSpeaker` | `OPERATOR` \| `CALLER` | Optional, default `OPERATOR` (the helpline answers first). Only used for `MIXED` audio, to tell which of the two voices is the operator. |

**202 Accepted** `{ "windowIndex": 7, "transcript": "…", "analysed": true, "showEmergencyPanel": false, "emergency": null }`
- Needs `voiceAnalysis` consent; otherwise **409** `CONSENT_REQUIRED`.
- **Speaker separation (FR-VOI-10, task M.10).** For `MIXED` audio the analysis service labels each stretch of speech `OPERATOR` or `CALLER` (voice fingerprints, kept consistent across the call). Only the caller's words are scored and only the caller's speech is used for voice features; the operator's words are stored as an `OPERATOR` turn, so a spoken answer is read with the spoken question (FR-NLP-11). `transcript` in the response is the caller's words only. Until a second voice has been heard, nothing is discarded: all speech is scored as the caller's and that window's assessment is limited confidence (normal at the start of a call). When separation is not possible or not confident (voices too similar, too much speech too short to fingerprint, speaker model unavailable), the interaction's assessments are marked **limited confidence** from then on. Safety net: words labelled as the operator's that hold a first-person life-safety statement (not a question) are scored as the caller's and the call is marked limited (CLAUDE.md rule 4, NFR-ETH-05). The labels are anchored by the call's first window (`windowIndex` 0, operator first unless `firstSpeaker` says otherwise): if that window was never analysed (lost or timed out, so it may be retried), nothing tells the voices apart reliably, and every later window is analysed as the caller's own audio, with nothing dropped and the call limited confidence. `CALLER_ONLY` audio is used as it is; send it whenever the call system can.
- The raw audio is never written to disk unless `audioRetention` is true (FR-VOI-09). A calling system sends a recorded file as 5 s windows, in order, with `inputMethod: RECORDED_AUDIO` (gap V4). The demo layer no longer offers recordings (Phase P, P-D3).

### 6.4 Case context
Metadata from NHAA's own record, not something the person is asked (FR-CH-08). Every field optional; unknown → omit:
```json
{
  "offenceCategory": "THREAT_INTIMIDATION",
  "ageGroup": "18_59",
  "gender": "F",
  "hasDisability": false,
  "supportPersonPresent": false,
  "accusedNearby": true,
  "ongoingThreats": true,
  "pressureToWithdraw": true,
  "displaced": false
}
```

### 6.4a Indicators with evidence (task M.5, gap V1, FR-API-01, FR-IND-04)
`GET /interactions/{id}/indicators`, scope **`indicators:read`**, only for interactions this client created. Every indicator the module recorded, in order, with **why** it was found:
```ts
interface IntegrationIndicator {
  id: ObjectId;
  dimension: Dimension;
  source: "TEXT_NLP" | "SAFETY_LEXICON" | "VOICE" | "CONTEXT";
  score: number;          // 0–1, this signal only (the SVI comes from GET /assessment)
  confidence: number;
  negated: boolean;       // kept for audit, not scored (FR-NLP-08)
  status: "ACTIVE" | "CONFIRMED" | "REJECTED" | "ADJUSTED";  // after human review
  flags: string[];        // override facts the signal carries, e.g. THREAT_TO_LIFE
  evidence:
    | { type: "TEXT_SPAN"; messageId: ObjectId; start: number; end: number; quote: string | null }  // exact substring of the message (rule 12); null after the retention purge
    | { type: "ACOUSTIC_EVENT"; cue: string | null; windowIndex: number | null; startMs: number | null; endMs: number | null }  // where in the call
    | { type: "CONTEXT_FIELD"; field: string | null };
  createdAt: Iso;
}
```
Staff review details (who, why) are not included. Like the assessment, this is for the calling system's authorised reviewers: **never shown to the person** (CLAUDE.md rule 1). The staff indicator endpoint (§5.3) carries the same voice time positions.

### 6.5 Demo input layer (detachable; public; not part of the module)

Pages and routes for anyone who visits the site: a **reference portal built on Nivara** (`NIVARA_FLOW_AND_UI_PLAN.md` §5–§8; Phase N tasks N.4, N.7, N.8; Phase P tasks P.2, P.4, P.7). **Off unless `DEMO_ENABLED=true`**; when off, every portal page (`/start`, `/start/write`, `/start/speak`), the `/track` pages and every `/api/demo/*` route answer `404`, the home page hides **Start** and the track field, and the module is unchanged (FR-API-05). No sign-in is needed. The old URLs `/demo`, `/demo/text`, `/demo/call` and `/demo/recording` redirect permanently to `/start`.

The demo calls the module **only through this integration API**, over HTTP, with its own key `DEMO_API_KEY` (a server-only environment variable; the key never reaches the browser). The demo key's client has `isDemo: true` (set when the key is created, `npm run api:client -- --demo`, scopes include `status:read` and `questions:read`), so every case and interaction it creates is tagged demo **on the server** (M.7). Nothing in a request body can set or clear the tag.

**Two inputs (Phase P, P-D3).** `LIVE_TEXT` (Write, channel `CHATBOT`) and `LIVE_AUDIO` (Speak, channel `VOICE_CALL`), chosen once when the interaction is created (P-D2). The demo layer offers **no recordings**: no recording route, no WAV upload and no scenario library. The module's own `/audio` endpoint still accepts `inputMethod: RECORDED_AUDIO` from NHAA's systems (§6.3).

**Safeguards on every route (plan §7, `core/demo/public.ts`, `guard.ts`, `limits.ts`):** kill switch → unsafe methods must carry an `Origin` equal to this site (`403`) → per-visitor limit by hashed IP (new cases 5 / 10 min; messages and next-question requests together 30 / min; tracking 20 / min; `429`) → for `/interactions/{id}/…`, the id must be in the browser's signed, http-only `nivara_demo` cookie (otherwise `404`, so other people's cases cannot even be discovered). A daily cap of 150 new cases across all visitors (`429`). Per case: at most 40 messages, at most **6 assistant questions**, for Speak at most **3 minutes of speech** (the sum of the windows sent; `windowIndex` and `startMs` continue across turns), and the whole conversation ends itself after **15 minutes**.

**Assistant lines (P-D4).** The portal assistant's questions are scripted and pre-translated (`operatorQuestions.*`, CLAUDE.md rule 2), chosen by the module through `GET /integration/…/next-question` (§6.7). **Only the server records `OPERATOR` turns**, and only the text of a question the module returned: before a question is shown, the relay sends it to `POST /integration/…/messages` with `sender: "OPERATOR"`, so the person's answer is read with its question (FR-NLP-11, M.9). The public message body has **no `sender`**: a visitor can never write the assistant's lines.

**Nothing leaks.** Public responses carry only what the page needs: `{ ok, showEmergencyPanel }`, the emergency options, the **text** of the next assistant question (never its key or the reason it was chosen), for Speak the person's own words for that window (`heard`), and at the end the docket ID. No module body, case id, request id, timing, dimension, indicator, score or band.

| Method | Path | Request → Response |
|---|---|---|
| `POST` | `/api/demo/interactions` | `{ mode: "LIVE_TEXT" \| "LIVE_AUDIO", language, consent: ConsentRequest, districtCode, takeover? }` → `201 { interactionId, question: { text } }` and the `nivara_demo` cookie. Calls `POST /integration/interactions` with channel `CHATBOT` (Write) or `VOICE_CALL` (Speak) and the chosen seeded district (plan §6.3, default Pune). `language` is the site language at this moment; it changes only through `…/language` below (P-D7, task P.11). The relay then reads the opening question (§6.7, `operatorQuestions.opening`), records it as an `OPERATOR` turn and returns its text. `LIVE_AUDIO`: one call at a time on the free tier; while another call is live the answer is `409 LINE_BUSY`, unless `takeover: true` comes from a signed-in staff member with `demo.use` (a supervisor), which ends the older call. |
| `POST` | `/api/demo/interactions/{id}/messages` | `{ text, note? }` (no `sender`; `note: true` marks the Review note, after which no question is asked) → `200 DemoReceipt = { ok: true, showEmergencyPanel, emergency, question: { text } \| null }`. The person's message is sent with `sender: "VICTIM"`, `inputMethod: "TEXT"`; the relay then reads the next question, records it as an `OPERATOR` turn if there is one, and returns its text (`null` when nothing is left or six questions have been asked). Also used for the Review note (one more message before `…/end`) and, on Speak, for that note only. At most 40 messages per case (`429`). The module's `409 CONSENT_REQUIRED` / `INTERACTION_ENDED` pass through; anything else is `503 ANALYSIS_DEGRADED`. |
| `POST` | `/api/demo/interactions/{id}/audio` | One live-microphone window: multipart `audio`, `windowIndex`, `startMs`, relayed to `POST /integration/…/audio` as `audioSource: CALLER_ONLY`, `inputMethod: LIVE_AUDIO`. More than 3 minutes of speech in the case → `409 INTERACTION_ENDED`. → `200 { ok: true, analysed, showEmergencyPanel, emergency, heard }`, where `heard` is the person's own words for that window, taken from the module's `transcript` (the caller's words only; may be empty), shown as "We heard: …" and on the Review step. Nothing is stored. |
| `POST` | `/api/demo/interactions/{id}/next-question` | No body → `200 { question: { text } \| null }`. Used after **Done** on Speak and for **Skip this question** on both inputs: reads the next question (§6.7), records it as an `OPERATOR` turn, returns its text. A skipped question stays recorded as asked, so it is not suggested again. Counts toward the 30 / min limit. |
| `POST` | `/api/demo/interactions/{id}/language` | `{ language }` → `200 { questions: string[] }`. Sent by the page when the site language changes during the conversation (P-D7, task P.11). Calls `PUT /integration/…/language` (§6.8) and returns only the **text** of the assistant's questions asked so far, in the order asked, re-worded in the new language, so the page can replace the lines it shows (never their keys). Counts toward the 30 / min limit. `409 INTERACTION_ENDED` once the conversation is over. |
| `POST` | `/api/demo/interactions/{id}/end` | → `200 { docketNumber }`; calls `POST /integration/…/end`. The docket number is revealed only here, when the person presses **Submit** on the Review step (plan §6.3). |
| `GET` | `/api/demo/track?docket=` | → `200 CaseStatusResponse` (§6.6) read through `GET /integration/cases/{docket}/status` with the demo key; `404` for any other docket, demo or not; `400` for a malformed one |

Removed in Phase P (P-D3): `POST /api/demo/interactions/{id}/recording`, `GET /api/demo/library`, the `RECORDED_AUDIO` demo mode, the `scenarioId` field, the WAV upload limit, the recordings rate limit and `DEMO_RECORDING_BUDGET_MS`.

**Live microphone line.** One live call at a time (free tier). **Any activity** on the call keeps it alive: an audio window, a message, or a next-question request. It counts as over after **60 s** with no activity (`LIVE_IDLE_MS = 60_000`), and the line is freed. A newcomer while the line is taken gets `409 LINE_BUSY` ("The line is busy. You can write instead, or try again in a few minutes."); a signed-in supervisor can take the line over.

**To verify while building (task P.4; stop and ask if either fails):** the integration API accepts `OPERATOR` text turns and a `TEXT` message on a `VOICE_CALL` interaction; and the module's `transcript` holds only the caller's words for `CALLER_ONLY` audio.

**What a portal page shows.** The assistant's scripted questions (labelled as the assistant, never as a person or as AI), the person's own words (their messages, or "We heard: …" for Speak, and all of it again on the Review step), the scripted emergency options when the module raises them (`CLAUDE.md` rule 1), and at the end the docket ID. Never an AI summary, score, band, indicator or diagnostic wording. The assessment appears only in the staff portals, read by signed-in staff through the staff API (§5) with the same role rules as always.

### 6.6 Case status (task N.3, FR-API-06)

`GET /cases/{docketNumber}/status`, scope **`status:read`**, only for cases that this client's own interactions created; anything else, including a malformed docket, is `404 NOT_FOUND`.

```json
{ "docketNumber": "NHAA-2026-MH-004512", "status": "ACTION_TAKEN", "registeredAt": "…", "updatedAt": "…", "support": ["COUNSELLING", "EMERGENCY_SUPPORT"] }
```

`status` is the case status (`NEW`, `UNDER_REVIEW`, `ACTION_TAKEN`, `FOLLOW_UP_SCHEDULED`, `CLOSED`); `support` lists the support types whose recommendation is `APPROVED` or `AUTO_TRIGGERED`. The key set is exactly these five fields: never a score, band, urgency, indicator, note or staff name (rule 1). This is what a tracking page in NHAA's own portal, or the demo's `/track`, may show.

### 6.7 Next question for the calling system's chatbot (Phase P, task P.3, FR-API-07)

`GET /interactions/{id}/next-question`, scope **`questions:read`**, only for interactions that this client created (same ownership check as `core/integration/owned.ts`); anything else is `404`.

```json
{ "question": { "key": "operatorQuestions.safeNow", "text": "Are you in a safe place right now?" } }
```
or `{ "question": null }`.

- `key` is an `operatorQuestions.*` key; `text` is its scripted, pre-translated wording in the **interaction's language** (`messages/*.json`). The module suggests; the calling system's chatbot decides whether to ask it, and if it does, sends it back as an `OPERATOR` turn (§6.2) so the answer is read with its question. The module never talks to the person (CLAUDE.md rule 2), and there is no fixed order and no quiz.
- **Rules** (the pure function in `core/operator/suggest.ts`: no database, no clock; the same rules as the operator console's `suggested-questions`, §5.3):
  - `asked`: the keys whose scripted text, in **any** of the five languages, equals an `OPERATOR` turn already stored in the interaction (so a question asked before a language change, §6.8, still counts as asked). An asked question is never suggested again.
  - No turns yet: `operatorQuestions.opening`.
  - Otherwise: the first suggestion in the existing order that has not been asked: safety first (`safePlace` after "not safe now", else `safeNow`), suicide questions on any sign, the accused nearby, then what the evidence points at, then `sayMore`.
  - After `MAX_CHATBOT_QUESTIONS = 6` scripted questions in the interaction, or when nothing is left: `null`.
- The endpoint loads the latest dimensions and fired overrides exactly as the staff route `GET /staff/interactions/{id}/suggested-questions` does.
- The key set is exactly `question.key` and `question.text`. It never returns the staff-facing `reason`, dimensions, overrides, a score or a band (a unit test asserts the keys).
- Additive: contract version `1.3`.

### 6.8 Conversation language (task P.11, FR-LANG-07)

`PUT /interactions/{id}/language`, scope **`interactions:write`**, only for interactions that this client created (`404` otherwise). Body `{ "language": "hi" }` (a `VictimLang`). Only while the interaction is `ACTIVE` (`409 INTERACTION_ENDED` otherwise).

```json
{ "language": "hi", "asked": [{ "key": "operatorQuestions.opening", "text": "आप केवल उतना ही बताएँ जितना बताने में आप सहज हों। आप हमें क्या बताना चाहेंगे?" }] }
```

- Stores the interaction's language (`uiLanguage`). From then on the scripted questions (§6.7), the emergency options (§6.2) and the speech-to-text language hint for audio (§6.3) use it.
- `asked` lists the scripted questions already sent as `OPERATOR` turns, in the order they were sent, each with its wording in the new language, so the calling system can re-show them. An `OPERATOR` turn that is not a scripted question (an operator's own words) is left out. Stored turns are never rewritten: what was said stays as it was said, and the person's answers are still read with the question as it was asked (FR-NLP-11).
- The key set is exactly `language` and `asked[].key`, `asked[].text`. Never a score, band or indicator (rule 1).
- Setting the language it already has is allowed and changes nothing.
- Additive: contract version `1.4`.

---

## 7. Real-time events

Transport: Pusher private channels (SSE fallback in local dev). Channel subscription goes through **`POST /api/v1/realtime/auth`** (`{ socket_id, channel_name }` → Pusher signature), which applies the §4 policies.

| Channel | Subscribers |
|---|---|
| `private-interaction-{interactionId}` | Operator/counsellor on that interaction, supervisors |
| `private-queue-{districtId}` / `private-queue-national` | Counsellors, operators, supervisors in scope |
| `private-oncall` | On-duty counsellors |
| `private-supervisors` | NHAA supervisors |
| `private-role-{ROLE}-{districtId}` | District officers, police liaisons, welfare officers |

**Envelope** (every event):
```json
{ "event": "assessment.updated", "id": "evt_01J…", "at": "2026-11-14T11:33:12Z", "data": { } }
```

| Event | Channel(s) | `data` |
|---|---|---|
| `transcript.appended` | interaction | `{ interactionId, messageId, seq, sender, text, language }` (staff only) |
| `assessment.updated` | interaction, queue | interaction channel: `{ interactionId, assessmentId, seq, svi, band, previousBand, overridesFired, topEvidence, confidence, limitedConfidence }` · queue channel: `{ caseId, band, svi }` only |
| `emergency.show` | interaction; integration SSE stream | `{ emergency: EmergencyPanel }`: for the calling system to show the person |
| `case.created` / `case.updated` | queue | `{ caseId, docketNumber, band, svi, status, assignedToId, waitingSince }` |
| `alert.created` | oncall, queue | `{ alertId, caseId, docketNumber, level, reason, createdAt }` |
| `alert.acknowledged` | oncall, supervisors | `{ alertId, acknowledgedBy: { id, name }, acknowledgedAt }` |
| `alert.escalated` | supervisors, then `role-DISTRICT_OFFICER-{district}` | `{ alertId, caseId, docketNumber, level, escalationLevel, waitingSec }` |
| `recommendation.created` | interaction | `{ recommendationId, type, urgency, status }` |
| `referral.created` / `referral.updated` | role-{ROLE}-{district} | `ReferralDto` (already minimal) |

Delivery is at-least-once; clients de-duplicate by `id` and re-fetch over REST when they need details.

---

## 8. Internal analysis-service API

Python FastAPI, reachable only from the web app and worker. **Not public.**

| Topic | Rule |
|---|---|
| Base | `${ANALYSIS_URL}/v1` |
| Auth | `X-Signature: sha256=<HMAC(body, ANALYSIS_HMAC_SECRET)>` + `X-Timestamp` (rejected if older than 60 s) |
| Input privacy | Text arrives **already redacted** (`[PHONE]`, `[NAME]`, `[ADDRESS]`) |
| Timeouts (client side) | Text 2.5 s, audio 4 s, summary 6 s |
| Determinism | Model temperature 0; `modelVersion` returned on every response |

### 8.1 `POST /v1/analyze/text`
**Request**
```json
{
  "requestId": "6735a1f0c2a4b1e0f0a1ms09",
  "text": "वो लोग घर के बाहर खड़े हैं, कह रहे हैं केस वापस लो",
  "languageHint": "hi",
  "conversation": [{ "role": "OPERATOR", "text": "Are you safe right now?" }],   // previous turn (FR-NLP-11, Phase M)
  "context": { "isSexualOffence": false, "isMinor": false },
  "tasks": ["language", "translation", "indicators", "emotion"]
}
```
**200**
```json
{
  "language": { "code": "hi", "confidence": 0.98, "script": "Deva" },
  "translation": { "en": "Those people are standing outside the house, saying withdraw the case" },
  "indicators": [
    {
      "dimension": "INTIMIDATION",
      "score": 0.95,
      "confidence": 0.9,
      "negated": false,
      "evidence": { "quote": "कह रहे हैं केस वापस लो", "start": 28, "end": 50 },
      "rationale": "Pressure to withdraw complaint"
    },
    {
      "dimension": "FEAR_ANXIETY",
      "score": 0.7,
      "confidence": 0.75,
      "negated": false,
      "evidence": { "quote": "घर के बाहर खड़े हैं", "start": 7, "end": 26 },
      "rationale": "Perceived immediate threat near home"
    }
  ],
  "immediateDanger": { "detected": true, "confidence": 0.85, "evidence": { "quote": "घर के बाहर खड़े हैं", "start": 7, "end": 26 } },
  "emotion": { "label": "fear", "confidence": 0.81, "distribution": { "fear": 0.81, "anger": 0.08, "sadness": 0.07, "neutral": 0.04 } },
  "modelVersion": { "nlp": "groq:openai/gpt-oss-120b@prompt-v1", "lid": "script+llm", "mt": "llm", "emotion": "llm" },
  "latencyMs": 1430
}
```
**Web-app validation (ARCHITECTURE §7 guardrails):** `text.slice(start, end) === quote`, otherwise the indicator is dropped; `dimension` must be one of the 8; scores are clamped to 0–1. `rationale` is used for the case summary only and is never shown to the victim.

### 8.2 `POST /v1/analyze/audio`
`multipart/form-data`: `audio` (opus/webm), `meta` (JSON):
```json
{ "requestId": "…", "windowIndex": 7, "startMs": 35000, "languageHint": "hi",
  "baseline": { "pitchMeanHz": 212.4, "pitchStdHz": 31.0, "speechRateWpm": 128, "energyMeanDb": -24.1 } }
```
**200**
```json
{
  "transcript": { "text": "…", "language": "hi", "confidence": 0.86,
                  "words": [{ "w": "वो", "startMs": 35120, "endMs": 35290 }] },
  "pauses": { "count": 3, "meanMs": 820, "maxMs": 1650, "silenceRatio": 0.34 },
  "pitch": { "meanHz": 236.8, "stdHz": 52.3, "rangeHz": 190.2 },
  "speechRateWpm": 96,
  "energy": { "meanDb": -27.5, "deltaDb": 6.2 },
  "voiceQuality": { "jitter": 0.021, "shimmer": 0.094 },
  "events": [{ "type": "SOBBING", "startMs": 38200, "endMs": 39900, "confidence": 0.72 }],
  "emotion": { "label": "fear", "confidence": 0.64, "distribution": { "fear": 0.64, "sadness": 0.21, "neutral": 0.1, "anger": 0.05 } },
  "baselineDeviation": { "pitchStdZ": 1.9, "speechRateZ": -1.4, "silenceRatioZ": 1.6 },
  "baselineUpdate": null,
  "modelVersion": { "stt": "groq:whisper-large-v3-turbo", "vad": "silero-vad@6", "ser": "emotion2vec_plus_base", "events": "yamnet@1" },
  "latencyMs": 2210
}
```
The first windows (until 20–30 s of speech) return `baselineUpdate` instead of deviations; the web app stores it in `interactions.voiceBaseline`. The web app then calls `/v1/analyze/text` on the redacted transcript.

### 8.3 `POST /v1/summarize`
`{ requestId, messages: [{ sender, text }], language }` → `{ summary, summaryEn, modelVersion }`: neutral, factual, no diagnosis (FR-NLP-09).

### 8.4 `GET /v1/health`
`{ status: "ok", models: { stt: "loaded", ser: "loaded", nlp: "reachable" } }`

### 8.5 Errors
`400 BAD_AUDIO` (decode failed) · `413 PAYLOAD_TOO_LARGE` · `422 UNSUPPORTED_LANGUAGE` · `503 MODEL_UNAVAILABLE` (the web app switches to fallback mode, NFR-REL-01).

---

## 9. Errors

Every error uses `application/problem+json`:
```json
{
  "type": "https://nhaa-assess.example/errors/consent-required",
  "title": "Consent required",
  "status": 409,
  "code": "CONSENT_REQUIRED",
  "detail": "Voice analysis consent has not been given for this interaction.",
  "instance": "/api/v1/integration/interactions/6735…/audio",
  "requestId": "req_01J…"
}
```
Error responses never contain message text or other victim content.

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Zod validation failed (`errors[]` lists the fields) |
| 400 | `BAD_AUDIO` | Audio could not be decoded |
| 401 | `UNAUTHENTICATED` / `INVALID_API_KEY` / `TOTP_REQUIRED` | Missing or invalid credentials |
| 403 | `FORBIDDEN` / `SCOPE_MISSING` / `CONSENT_NOT_GIVEN_FOR_SHARING` | Role, scope or consent does not allow it |
| 404 | `NOT_FOUND` | Unknown ID, or not visible to this caller (never reveals existence) |
| 409 | `CONSENT_REQUIRED` | Analysis endpoint called without the matching consent |
| 409 | `INTERACTION_ENDED` | Writing to an ended interaction |
| 409 | `ALREADY_ACKNOWLEDGED` / `INVALID_TRANSITION` / `DUPLICATE_WINDOW` | State conflicts |
| `LINE_BUSY` | 409 | Public demo only: another live microphone call is in progress (§6.5) |
| 413 | `PAYLOAD_TOO_LARGE` | Text > 2,000 characters or audio chunk > 200 KB |
| 422 | `REASON_REQUIRED` / `FOLLOW_UP_REQUIRED` / `INVALID_CONFIG` / `REFERRAL_TOO_DETAILED` | Business rule failed |
| 429 | `RATE_LIMITED` | Too many requests (`Retry-After` header) |
| 503 | `ANALYSIS_DEGRADED` | Only for diagnostics; **integration input endpoints never fail because of the AI**, they continue in fallback mode |

---

## 10. Endpoint ↔ requirement map

| Requirement | Endpoints / events |
|---|---|
| FR-CH-01/02 | integration `POST /interactions`, `/messages` (`sender`), `/audio` |
| FR-CH-03/04 | integration `/audio`, `/staff/interactions/{id}/transcript`, `/suggested-questions`, `/operator-message`, `transcript.appended` |
| FR-CH-07 | `docketNumber` on interaction and case; integration `POST /interactions` |
| FR-API-06, FR-DEMO-02 | integration `GET /cases/{docket}/status`; demo `GET /api/demo/track` |
| FR-API-07 | integration `GET /interactions/{id}/next-question` (§6.7); staff `/suggested-questions` shares its rules |
| FR-DEMO-01, FR-DEMO-03…06 | `/api/demo/*` (§6.5) behind the public safeguards; `POST /api/demo/interactions/{id}/next-question` |
| FR-CH-08 | integration `PUT /…/context` |
| FR-CON-01…06 | `consent` on integration start, integration `/consent/withdraw`, `CONSENT_REQUIRED` |
| FR-VOI-01…10 | integration `/audio`, `/v1/analyze/audio`, `/staff/interactions/{id}/voice` |
| FR-NLP-01…10, FR-EMO-* | `/v1/analyze/text`, `/v1/summarize`, `/staff/interactions/{id}/indicators`, `/emotions` |
| FR-IND-01…05 | `IndicatorDto`, `PATCH /indicators/{id}` |
| FR-SVI-01…07 | `AssessmentDto`, `/assessments`, `/assessments/current`, `/admin/scoring-configs*` |
| FR-RISK-01…05 | `band`, `overridesFired`, `explanation`, `/band-override` |
| FR-REC-01…09 | `/recommendations*`, `/referrals*`, `/follow-ups*`, `emergency.show` |
| FR-LANG-01…06 | `language` fields, localised `emergency`, suggested questions and next question, `translation` in transcript and evidence |
| FR-LANG-07 | No endpoint: the site language comes from the `NEXT_LOCALE` cookie; it becomes `language` on `POST /api/demo/interactions` |
| FR-CASE-01…05 | `GET /cases` (sorted), `PATCH /cases/{id}`, `/notes` |
| FR-ALR-01…04 | `/alerts*`, `alert.created`, `alert.escalated`, `alert.acknowledged` |
| FR-DSH-01…08 | Staff API per role (§4), `/analytics/*` |
| FR-API-01…05 | `/integration/*`, SSE `/stream`, API keys and scopes |
| FR-AUD-01…03 | Audit entries on reads/writes, `/admin/audit`, `/admin/audit/verify` |
| NFR-ETH-02 | Integration input responses limited to `messageId`, `showEmergencyPanel`, `emergency` (and `transcript` for audio) |
| NFR-PRI-02, C-ETH-02 | §4 matrix, `ReferralDto`, `REFERRAL_TOO_DETAILED` |
| NFR-SEC-05 | §8 redacted input |
| NFR-REL-01 | Integration input endpoints never return `503`; `limitedConfidence` |
