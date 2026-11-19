# Requirements Specification
## AI-Based Real-Time Stress and Trauma Assessment Module for Victims/Complainants Accessing NHAA (14566) and Integrated Portal

| Field | Value |
|---|---|
| Problem statement | SIH26093, Ministry of Social Justice and Empowerment (MoSJE), Department of Social Justice and Empowerment |
| Project name | **Nivara** |
| Platform | Plug-in assessment module (Next.js API and staff dashboards, Python analysis service) called by NHAA's systems through an integration API |
| Version | 0.3 (draft): module scope, no questionnaire (PRODUCT_VISION.md); Phase P portal journey and site-wide languages (NIVARA_FLOW_AND_UI_PLAN.md) |
| Date | 17 Nov 2026 |

---

## Contents
1. [Overview](#1-overview)
2. [Stakeholders and user roles](#2-stakeholders-and-user-roles)
3. [Functional requirements](#3-functional-requirements)
4. [Non-functional requirements](#4-non-functional-requirements)
5. [Constraints](#5-constraints)
6. [Acceptance criteria](#6-acceptance-criteria)
7. [Traceability matrix](#7-traceability-matrix)
8. [Out of scope and assumptions](#8-out-of-scope-and-assumptions)
9. [Appendices](#9-appendices)

**How to read requirement IDs:** `FR` = functional requirement, `NFR` = non-functional requirement, `C` = constraint, `AC` = acceptance criterion. **Priority:** **M** = Must (needed to meet the problem statement), **S** = Should (strengthens the solution), **C** = Could (stretch goal).

---

## 1. Overview

### 1.1 Problem
Victims and complainants from Scheduled Castes and Scheduled Tribes reach NHAA (14566) through the helpline, the Integrated Portal, the chatbot, the mobile app, IVRS and other digital channels. Many are in severe emotional distress after caste-based discrimination, violence, rape, gang rape, the murder of family members, social boycott, displacement, threats or long legal proceedings. **There is currently no standard way to assess a victim's psychological condition and vulnerability at first contact with the authorities.** As a result, every case is handled the same way, people at high risk can be missed, and support (counselling, medical help, protection) isn't linked to the person's actual state.

### 1.2 Goal
Build an **AI-enabled, real-time stress and trauma assessment module** that:
- assesses stress, trauma, fear, anxiety and vulnerability from what the person says or writes (voice and text only; no questionnaire),
- calculates an explainable **Stress Vulnerability Index (SVI)** and a **risk category** (Low / Moderate / High / Critical),
- recommends the right support, and
- puts high-risk victims in front of the right human responder first,

while keeping **privacy, informed consent, confidentiality and ethical AI** at the centre.

### 1.3 Scope
The module sits **between NHAA's contact channels and the human responders**. It is a plug-in layer, not a replacement for NHAA (`PRODUCT_VISION.md`). NHAA's systems (chatbot, helpline, IVRS, mobile app, portal, operator desk) own the conversation with the person, obtain consent in their own workflow, and call the module through the **integration API**. The module covers:
- assessment of the two inputs a person gives on any channel: **text messages and voice audio**,
- live operator assistance during calls,
- risk-based queues, alerts and recommendations,
- dashboards for every stakeholder (the reference consuming system),
- the integration API, which is the module's only input interface.

The module never questions the person. If safety or wellbeing questions are asked, NHAA's chatbot asks them in the chat or the operator asks them aloud, and the answers arrive as ordinary text or speech. A detachable, public **demo input layer**, a reference portal built on Nivara with two inputs (write, speak), exists only to present and test the module through the same API; its portal assistant asks only scripted questions chosen by rules, and it ends with a docket ID and a tracking page, never a result (`NIVARA_FLOW_AND_UI_PLAN.md`). The whole website, staff portals included, is available in five languages, English by default.

Long-term monitoring after the complaint is filed is covered by the sister problem **SIH26094** and is **out of scope**. This module provides a hook for it (scheduled follow-ups for High/Critical cases).

### 1.4 Key definitions
| Term | Meaning |
|---|---|
| **Interaction** | One contact session between a victim/complainant and NHAA on any channel |
| **Indicator** | A detected sign of a specific risk dimension (e.g. intimidation), with a score, confidence and evidence |
| **Dimension score** | A 0–1 score for one risk dimension, fused from all available signals |
| **SVI** | Stress Vulnerability Index: a 0–100 weighted combination of dimension scores |
| **Risk band** | Low / Moderate / High / Critical, derived from the SVI plus safety overrides |
| **Safety override** | A rule that forces a minimum risk band whatever the SVI (e.g. active suicidal intent → Critical) |
| **Evidence** | The exact phrase, acoustic event or case-context field that triggered an indicator |
| **Responder** | A human who acts on a case: operator, counsellor, district officer, police liaison, welfare officer |
| **Docket number** | NHAA's existing complaint ID, linked to each assessment |

---

## 2. Stakeholders and user roles

| # | Stakeholder (from the problem statement) | System role | What they need from the module | Data access |
|---|---|---|---|---|
| 0 | **Victim / complainant** (primary beneficiary) | none: reaches NHAA through NHAA's own channels | To be heard once, prioritised when at risk, and offered help in their language (through the calling system) | No direct access to the module |
| 1 | **Department of Social Justice and Empowerment** | `ministry_admin` | National view of distress trends, response times, resource gaps; policy evidence | Aggregated, anonymised only |
| 2 | **National Helpline Against Atrocities (14566)** | `operator`, `nhaa_supervisor` | Live risk guidance during calls/chats; a queue sorted by risk; supervisor oversight | Cases they handle; supervisors see all NHAA cases |
| 3 | **State Governments and Union Territories** | `state_admin` | State-level monitoring of high-risk cases and service capacity | Aggregated for the state; case-level only for escalated cases |
| 4 | **District Administrations** | `district_officer` | High-risk cases in their district, pending actions, deadlines (SLAs) | Cases in their district, minimal personal data |
| 5 | **Counsellors and Mental Health Professionals** | `counsellor` | Full clinical picture: SVI, indicators, evidence, history; approving recommendations; follow-up | Full case detail for assigned cases |
| 6 | **Law Enforcement Agencies** | `police_liaison` | Clear, actionable requests (protection, intervention), with no emotional or clinical detail | Action requests only: no narrative, no SVI breakdown |
| 7 | **Rehabilitation and Welfare Authorities** | `welfare_officer` | Referrals for relief, compensation, rehabilitation, shelter | Referral details needed for the service only |
| 8 | System administrator (implied) | `sys_admin` | Configure weights, thresholds, languages and users; audit | Configuration and audit logs; no case content by default |

---

## 3. Functional requirements

### 3.1 Inputs and channels (FR-CH)
| ID | Requirement | Priority |
|---|---|---|
| FR-CH-01 | The module shall accept exactly **two inputs** from any NHAA channel, through the integration API: **text messages** and **voice audio**. It shall have no questionnaire, no endpoint for structured answers and no key-press input. | M |
| FR-CH-02 | Every text message shall carry its **sender**: the person (`VICTIM`), or NHAA's chatbot or operator (`OPERATOR`, used for both). Only the person's words are scored; the questioner's turns are stored as context. | M |
| FR-CH-03 | The module shall analyse **voice audio** sent in short windows during a call (live) or cut from a recording, with live updates. Recorded audio is accepted from the calling system's own recordings. In the demo, voice comes from the browser microphone only (Phase P, P-D3). | M |
| FR-CH-04 | The system shall provide an **operator assist console**. While a human operator takes a call or chat, it shows the live transcript, live SVI, detected indicators and suggested next questions. | M |
| FR-CH-05 | ~~IVRS keypad simulation~~ *Removed 16 Nov 2026 (PRODUCT_VISION.md §5).* An IVRS can still send the caller's audio through the API. | – |
| FR-CH-06 | ~~Victim-facing PWA~~ *Removed 16 Nov 2026 (PRODUCT_VISION.md §5).* The calling system owns the victim's interface. | – |
| FR-CH-07 | Every interaction shall be linked to a **docket number**, either supplied by NHAA or generated, and to the channel it came from. | M |
| FR-CH-08 | The module shall accept **case context** from NHAA's own record as metadata (`/context`): offence category (as on the NHAA grievance form), victim age group, gender, whether the victim is alone or has support, whether the accused is nearby, and whether there are ongoing threats. Each field is optional. | M |
| FR-CH-09 | ~~Skip, pause and quick exit on victim screens~~ *Removed 16 Nov 2026 (PRODUCT_VISION.md §5).* These belong to the calling system's interface. | – |
| FR-CH-10 | The module shall keep a **case summary** so the person never has to retell the full incident: later responders see the summary already recorded. | S |

### 3.2 Informed consent and victim controls (FR-CON)
| ID | Requirement | Priority |
|---|---|---|
| FR-CON-01 | The calling system shall obtain consent in its own workflow before any analysis, and send the **consent state** (notice version, language, choices) when it starts the interaction. The module shall refuse to start an interaction without it. | M |
| FR-CON-02 | Consent shall be **granular**: (a) text analysis, (b) voice analysis, (c) sharing with counsellors, (d) follow-up contact. Each can be accepted or declined separately. | M |
| FR-CON-03 | If analysis consent is declined, the interaction shall still be recorded and routed, and only the rule-based **safety lexicon** shall run on what the person says (no AI analysis, no SVI). | M |
| FR-CON-04 | The calling system shall be able to **withdraw consent** for an interaction at any time through the API. Analysis stops immediately and already-collected raw audio is deleted. | M |
| FR-CON-05 | For **minors**, the module shall rely on a guardian or support person's consent recorded by the calling system, and shall otherwise route directly to a human counsellor without automated analysis beyond the safety lexicon. | S |
| FR-CON-06 | Every consent decision shall be **recorded with a timestamp, language and version of the notice** shown. | M |

### 3.3 Voice and speech analytics (FR-VOI)
*Problem statement: "Analyse voice interactions, speech patterns, pauses, pitch variation, emotional indicators."*

| ID | Requirement | Priority |
|---|---|---|
| FR-VOI-01 | The system shall capture audio (with consent) and convert speech to text (**STT**) in supported languages. | M |
| FR-VOI-02 | The system shall extract **pause features**: number of pauses, mean and maximum pause length, and the ratio of silence to speech. | M |
| FR-VOI-03 | The system shall extract **pitch features**: mean pitch, pitch range, and pitch variation (standard deviation). It shall flag unusually flat pitch (possible low mood) and unusually unstable pitch (possible fear or agitation) relative to the speaker's own baseline from the first 20–30 seconds. | M |
| FR-VOI-04 | The system shall extract **speech-rate and energy features**: words or syllables per minute, loudness, and sudden changes. | M |
| FR-VOI-05 | The system shall detect **paralinguistic events** where possible: crying or sobbing, voice tremor, sharp breaths, long silences after a question. | S |
| FR-VOI-06 | The system shall output a **voice emotion estimate** (fear, sadness, anger, neutral, numb or flat) with a confidence value. | M |
| FR-VOI-07 | Voice features shall be computed in **rolling windows** (e.g. every 5–10 seconds) so the SVI updates during the call. | M |
| FR-VOI-08 | Voice-based signals shall be **weighted lower than explicit statements**, and shall never by themselves move a case into Critical. Acoustic cues are supporting evidence, not proof. | M |
| FR-VOI-09 | Raw audio shall be **discarded after feature extraction and transcription** unless the victim consents to it being kept (see NFR-PRI-04). | M |
| FR-VOI-10 | Audio that holds **two voices** (operator and caller) shall be separated by speaker: each transcript sentence is labelled `OPERATOR` or `CALLER`, only the caller's words are scored, and voice features come from the caller's segments only. Until speaker separation is built, any assessment from two-voice audio shall be marked **limited confidence**. | M |

### 3.4 Text and narrative analysis, NLP (FR-NLP)
*Problem statement: "textual narratives… Natural Language Processing (NLP)."*

| ID | Requirement | Priority |
|---|---|---|
| FR-NLP-01 | The system shall analyse typed text and STT transcripts for **distress language**, such as hopelessness, helplessness, worthlessness, shame and self-blame. | M |
| FR-NLP-02 | The system shall detect **threat and intimidation statements**, for example threats to the victim or family, pressure to withdraw the complaint, or the accused being nearby. | M |
| FR-NLP-03 | The system shall detect **suicidal ideation and self-harm language**, both explicit and indirect ("there's no point anymore", "my family would be better without me"). | M |
| FR-NLP-04 | The system shall detect **social isolation signals**, such as boycott, eviction, being cut off by family or community, or having nobody to turn to. | M |
| FR-NLP-05 | The system shall detect **immediate danger signals**, such as current injury, the accused present, or being locked in or confined. | M |
| FR-NLP-06 | The system shall handle **Hindi, English and code-mixed (Hinglish)** text, plus the regional languages listed in FR-LANG. | M |
| FR-NLP-07 | Every NLP detection shall return the **exact supporting phrase** (evidence span), the dimension it maps to, a score and a confidence value. | M |
| FR-NLP-08 | The system shall handle **negation and context** correctly, e.g. "I would never hurt myself" must not count as suicidal ideation. | M |
| FR-NLP-09 | The system shall produce a short, neutral **case summary** for responders, so the victim doesn't have to repeat the story. | S |
| FR-NLP-10 | A **rule-based safety lexicon** shall run on every message the person sends, in every consent mode, alongside the ML/LLM model, so critical phrases are caught even if the model fails or is unavailable. | M |
| FR-NLP-11 | A short answer shall be **read with the question it answers**: the preceding chatbot or operator turn is passed as context to the AI analysis and to question-aware rules. For the four **safety** questions, "No" to "Are you safe right now?" or "Yes" to the accused-nearby or suicide questions raises the band (Appendix B). For the **wellbeing** questions (PHQ-2, GAD-2 and PC-PTSD-5 wording, asked by NHAA's chatbot or operator inside the conversation), a frequency or yes answer is scored per item (Appendix A). The module itself never asks these questions and has no questionnaire. | M |

### 3.5 Emotion AI (FR-EMO)
*Problem statement: "Emotion AI to identify signs of trauma and distress… emotional indicators."*

| ID | Requirement | Priority |
|---|---|---|
| FR-EMO-01 | The system shall classify emotions from **text** into at least: fear, sadness, anger, shame, shock or numbness, and neutral. | M |
| FR-EMO-02 | The system shall fuse **text emotion and voice emotion** into one emotion profile per window, weighting each by its confidence. | M |
| FR-EMO-03 | The system shall track the **emotion trajectory** across the session (e.g. calm → rising fear) and show it as a timeline. | S |
| FR-EMO-04 | Emotion outputs shall feed the dimension scores (Appendix A) and never be shown to the victim as labels. | M |

### 3.6 Structured screening and safety check (FR-SCR): removed
*Removed 16 Nov 2026 (PRODUCT_VISION.md §5, decision Q1).* The module never asks questions and has no screeners (PHQ-2, GAD-2, PC-PTSD-5, C-SSRS) and no structured safety check. If NHAA's chatbot or operator asks safety or wellbeing questions, the answers arrive as ordinary text or speech and are analysed like any other words (FR-NLP-10, FR-NLP-11). The safety path that FR-SCR-01 guaranteed in every mode is kept by the safety lexicon (FR-NLP-10, CLAUDE.md rule 4). The operator console may still *suggest* scripted questions for the operator to ask aloud (FR-DSH-01).

### 3.7 Indicator detection (FR-IND)
*Problem statement: "assess the psychological stress, trauma, fear, anxiety, and vulnerability levels" and "detect indicators of severe trauma, fear, depression, suicidal ideation, intimidation, social isolation, and extreme vulnerability."*

| ID | Requirement | Priority |
|---|---|---|
| FR-IND-01 | The system shall score these **eight dimensions**, each from 0 to 1, with confidence and evidence: **(1) acute stress/distress, (2) severe trauma, (3) fear/anxiety, (4) depression, (5) suicidal ideation/self-harm, (6) intimidation/threat, (7) social isolation, (8) extreme vulnerability**. | M |
| FR-IND-02 | **Extreme vulnerability** shall combine case context: victim is a minor, elderly or disabled; sexual offence; murder of a family member; displacement; no support person; economic dependence on the accused; repeat victimisation. | M |
| FR-IND-03 | Each dimension score shall be **fused from all available sources** (text NLP, safety lexicon, voice, case context), each with its own weight and confidence, as defined in Appendix A. | M |
| FR-IND-04 | Each indicator shown to responders shall include **why**: the evidence phrase, acoustic event or case-context field, and its source. | M |
| FR-IND-05 | Responders shall be able to **confirm, reject or adjust** an indicator. Their correction is stored, and the original AI value is kept for audit. | M |

### 3.8 Stress Vulnerability Index (FR-SVI)
*Problem statement: "Generate a Stress Vulnerability Index (SVI) on a predefined scale."*

| ID | Requirement | Priority |
|---|---|---|
| FR-SVI-01 | The system shall calculate an **SVI on a fixed 0–100 scale** as a weighted sum of the eight dimension scores (formula and default weights in Appendix A). | M |
| FR-SVI-02 | The SVI shall **update in real time** as new text, voice windows or case context arrive. | M |
| FR-SVI-03 | The system shall show an **SVI breakdown**: how much each dimension contributed, and the top three evidence items. | M |
| FR-SVI-04 | The system shall show an **SVI confidence value** that drops when little data is available (e.g. a very short interaction or a single channel). | S |
| FR-SVI-05 | The system shall keep the **SVI history** of each interaction (a timeline of SVI values). | M |
| FR-SVI-06 | Weights and thresholds shall be **configurable** by `sys_admin`. Every change is versioned, and each SVI stores the configuration version used. | S |
| FR-SVI-07 | The same input with the same configuration version shall always produce the **same SVI** (deterministic scoring). | M |

### 3.9 Risk categorisation (FR-RISK)
*Problem statement: "Categorize victims into Low, Moderate, High, and Critical Risk categories."*

| ID | Requirement | Priority |
|---|---|---|
| FR-RISK-01 | The system shall assign each interaction exactly **one of four bands: Low, Moderate, High, Critical**, using SVI thresholds (default: 0–29 Low, 30–54 Moderate, 55–74 High, 75–100 Critical). | M |
| FR-RISK-02 | **Safety overrides** shall raise the band whatever the SVI (full list in Appendix B), for example: active suicidal intent or plan → Critical; accused present or immediate physical danger → Critical; sexual offence against a minor → at least High; explicit threat to life → at least High. | M |
| FR-RISK-03 | The band shall **never be lowered automatically** during a session once a safety override has fired. Only a human responder can lower it, with a recorded reason. | M |
| FR-RISK-04 | Each band shall come with a **plain-language explanation** for responders (e.g. "Critical: caller reports the accused is outside the house"). | M |
| FR-RISK-05 | Band colours and labels shall be consistent across all screens and also shown as text, not only colour (accessibility). | M |

### 3.10 Support recommendation engine (FR-REC)
*Problem statement: "Automatically recommend counselling, legal aid, medical assistance, police intervention, witness protection, or emergency support based on risk level."*

| ID | Requirement | Priority |
|---|---|---|
| FR-REC-01 | The system shall automatically produce recommendations from **six support types: counselling, legal aid, medical assistance, police intervention, witness protection, emergency support**. | M |
| FR-REC-02 | Recommendations shall depend on **both the risk band and the specific indicators** (mapping in Appendix C), not on the band alone. | M |
| FR-REC-03 | Each recommendation shall state its **reason** (which indicator triggered it), its **urgency/SLA** (e.g. counsellor callback within 15 minutes for Critical) and the **responsible stakeholder**. | M |
| FR-REC-04 | Each recommendation shall show its **legal or policy basis** where applicable, e.g. victim and witness rights under the SC/ST (PoA) Act, 1989 and its Rules. | S |
| FR-REC-05 | Every recommendation shall need **human approval** (counsellor or supervisor) before it is sent to an external agency. Emergency support for Critical cases may be triggered immediately, but must be reviewed by a human afterwards. | M |
| FR-REC-06 | For Critical risk, the module shall immediately return **emergency options** (112, Tele-MANAS 14416, NHAA 14566) in the person's language to the calling system, which shows them to the person. | M |
| FR-REC-07 | Approved recommendations shall create **referral tasks** in the right stakeholder's queue (police liaison, welfare officer, district officer, counsellor). | M |
| FR-REC-08 | The status of each referral shall be tracked: pending → accepted → in progress → done, or declined with a reason. | S |
| FR-REC-09 | High and Critical cases shall get a **scheduled follow-up** (the hook for SIH26094). | S |

### 3.11 Multilingual support (FR-LANG)
*Problem statement: "Support multilingual interactions, including major Indian languages and dialects."*

| ID | Requirement | Priority |
|---|---|---|
| FR-LANG-01 | Text the module returns for the person (emergency options) and the questions it suggests to operators and to calling systems' chatbots (FR-API-07) shall be available in **at least: English, Hindi, and three regional languages** (proposed: Marathi, Tamil, Bengali). | M |
| FR-LANG-02 | Analysis (NLP and STT) shall support **English, Hindi and Hinglish** at minimum, and the three regional languages through native models or translate-then-analyse. | M |
| FR-LANG-03 | The system shall **auto-detect the language** of text and speech, and accept the interaction language from the calling system. | M |
| FR-LANG-04 | The design shall allow **adding a new language through configuration** (translation files plus a model mapping) without code changes. | S |
| FR-LANG-05 | The system shall tolerate **dialect variation and non-standard spelling** (e.g. Romanised Hindi spelled several ways). Evaluation shall include dialect samples. | S |
| FR-LANG-06 | Responders shall see the original text **and** an English/Hindi translation, with the evidence phrase highlighted in both. | M |
| FR-LANG-07 | The **whole website** (the public pages and portal journey of the demo layer, the login page and every staff portal) shall be available in English, Hindi, Marathi, Tamil and Bengali, with **English as the default**. A language switcher on every public page, the login page and the staff top bar changes the whole site; the choice is remembered in the browser (a cookie, no language prefix in URLs). The conversation's language is the site language when the interaction is created, and follows the site language if it is changed during the conversation: the assistant's scripted questions already shown are re-worded in the new language and later ones come in it; the person's own words are never changed (task P.11). Staff screens translate their labels, but always show case content as written, with the translation of FR-LANG-06 beside it. Non-English text stays marked as a draft until a native speaker has reviewed it (Phase P, P-D7). | M |

### 3.12 Case management and human review (FR-CASE)
| ID | Requirement | Priority |
|---|---|---|
| FR-CASE-01 | All assessed interactions shall appear in a **case queue sorted by risk band, then SVI, then waiting time**, not by arrival order. | M |
| FR-CASE-02 | A case shall be **assigned** to a counsellor or responder, manually or automatically, based on language, district and workload. | S |
| FR-CASE-03 | The case detail view shall show: the summary, SVI timeline, dimension breakdown, indicators with evidence, consent status, recommendations and referral status. | M |
| FR-CASE-04 | Responders shall be able to add **notes** and **override** the band or recommendations, with a mandatory reason. | M |
| FR-CASE-05 | Case statuses shall be: New → Under review → Action taken → Follow-up scheduled → Closed. | M |

### 3.13 Real-time alerts and escalation (FR-ALR)
| ID | Requirement | Priority |
|---|---|---|
| FR-ALR-01 | When a case becomes **Critical**, the system shall push a **real-time alert** to on-duty counsellors and NHAA supervisors, with no page refresh needed. | M |
| FR-ALR-02 | An alert shall stay active until a named responder **acknowledges** it. Acknowledgement time is recorded. | M |
| FR-ALR-03 | If a Critical alert is not acknowledged within a set time (default 2 minutes), it shall **escalate** to the next level (supervisor, then district officer). | S |
| FR-ALR-04 | High-risk cases shall raise a non-urgent notification. Low and Moderate cases shall not. | M |

### 3.14 Stakeholder dashboards (FR-DSH)
| ID | Requirement | Priority |
|---|---|---|
| FR-DSH-01 | **Operator console**: live call/chat view with transcript, SVI gauge, indicators and suggested questions (FR-CH-04). | M |
| FR-DSH-02 | **Counsellor dashboard**: risk-sorted queue, live alerts, case detail, recommendation approval and follow-ups. | M |
| FR-DSH-03 | **District dashboard**: High and Critical cases in the district, pending referrals, SLA breaches. | M |
| FR-DSH-04 | **Police liaison view**: action requests only (what, where, how urgent, contact route), with **no narrative, no SVI breakdown and no clinical data**. | M |
| FR-DSH-05 | **Welfare view**: referrals for relief, rehabilitation and shelter, with only the data needed to deliver them. | S |
| FR-DSH-06 | **State and ministry analytics**: anonymised counts by band, district heatmap, indicator trends, average time to first response, referral completion rates, demand vs. capacity. Small counts (below 5) shall be suppressed to prevent re-identification. | M |
| FR-DSH-07 | Dashboards shall support filtering by date range, district, channel, language and band. | S |
| FR-DSH-08 | Analytics shall be exportable as CSV or PDF (anonymised). | C |

### 3.15 Integration API (FR-API)
| ID | Requirement | Priority |
|---|---|---|
| FR-API-01 | The module shall expose a documented **REST API**: start an interaction (with consent state), send a text message or audio window, send case context, withdraw consent, get the current SVI, band and indicators, get recommendations, close the interaction. | M |
| FR-API-02 | The API shall be authenticated (API key or token per integrating system) and rate-limited. | M |
| FR-API-03 | The API shall support **streaming updates** (Server-Sent Events or WebSocket) for live SVI during calls. | S |
| FR-API-04 | The API shall accept and return the **NHAA docket number** to link with existing records. | M |
| FR-API-05 | The integration API shall be the module's **only input interface**. There is no victim-facing API; the module must run and be tested with the demo input layer switched off. | M |
| FR-API-06 | The integration API shall offer a **case status** read (`GET /cases/{docket}/status`, scope `status:read`): status, dates and the support arranged, for the calling system's own cases only, and never a score, band, urgency, indicator or staff detail (task N.3). | M |
| FR-API-07 | The integration API shall offer a **next question** read (`GET /interactions/{id}/next-question`, scope `questions:read`) for the calling system's own interactions: `{ question: { key, text } \| null }`, where `key` is an `operatorQuestions.*` key and `text` its scripted wording in the interaction's language. The rules are the operator console's suggested-question rules (pure, in `core/operator/suggest.ts`): the opening question when there are no turns yet; then safety first, suicide questions on any sign, then what the evidence points at, then "say more"; never a question already asked as an `OPERATOR` turn in the interaction; `null` after six scripted questions or when nothing is left. It never returns the staff-facing reason, dimensions or any score. The module suggests; the calling system decides whether to ask (Phase P, task P.3). | M |
| FR-DEMO-01 | The demo input layer shall be **public** and present a **portal journey**: Home → Before we begin (language, district, consent, "I'd rather talk to someone") → How to share (**Write** or **Speak**, chosen once) → Conversation → Review → Registered (docket ID) → Track. It offers exactly **two inputs**, live text and live microphone, and **no recordings**. Each goes through the integration API with the demo key. A portal page shows only the assistant's scripted questions, the person's own words, the scripted emergency options when raised, and at the end the docket ID; never a score, band, indicator or diagnostic wording (Phase P, P-D1 to P-D3, tasks P.2 and P.7). | M |
| FR-DEMO-02 | A public **track a case** page shall show, for a docket ID of a demo case, the case status and the support arranged, through FR-API-06, and nothing diagnostic (task N.8). | M |
| FR-DEMO-03 | The public demo shall be limited: a kill switch, same-site posts only, per-visitor and daily rate limits (messages and next-question requests together), a signed cookie so a browser reaches only its own cases, trimmed responses, per-case caps (40 messages, six assistant questions, three minutes of speech, fifteen minutes in all), one live microphone call at a time that counts as over after 60 s with no activity (tasks N.4 and P.4, plan §7). | M |
| FR-DEMO-04 | The portal's **assistant** shall ask only scripted, pre-translated questions (`operatorQuestions.*`), the next one chosen through FR-API-07, and label them as the assistant, never as a person or as AI. The person answers in their own words (no quick replies or Yes/No buttons), can skip any question and can finish at any time. Each question is recorded in the module as an `OPERATOR` turn **by the server**; the public message body has no `sender`, so a visitor can never send an `OPERATOR` turn (Phase P, P-D4, task P.4). | M |
| FR-DEMO-05 | Before submitting, a **Review** step shall show the person their own words in order (for Speak, the caller's own transcribed words for each answer) with each assistant question above its answer, and let them add one note, sent as one more message. It never shows an AI summary or interpretation (Phase P, P-D5, task P.7). | M |
| FR-DEMO-06 | Every public page shall show **NHAA helpline 14566** and **Emergency 112** (tap to call) and a **Quick exit** that replaces the page with a neutral site so Back does not return, and drops the conversation held in memory (Phase P, P-D6, task P.6). | M |

### 3.16 Audit and accountability (FR-AUD)
| ID | Requirement | Priority |
|---|---|---|
| FR-AUD-01 | The system shall log **who viewed, changed or exported** any case, and when. | M |
| FR-AUD-02 | The system shall log every AI output with its **model version and configuration version**. | M |
| FR-AUD-03 | Audit logs shall be **tamper-evident** (e.g. hash-chained entries) and readable only by authorised auditors. | S |

---

## 4. Non-functional requirements

### 4.1 Privacy and data protection (NFR-PRI)
| ID | Requirement | Priority |
|---|---|---|
| NFR-PRI-01 | Processing shall follow the **Digital Personal Data Protection Act, 2023**: purpose limitation, consent, data minimisation, the right to withdraw, and deletion. | M |
| NFR-PRI-02 | **Data minimisation by role**: each role sees only the fields in §2 "Data access". This is enforced on the server, not just hidden in the UI. | M |
| NFR-PRI-03 | Personal identifiers (name, phone, address) shall be stored **separately** from assessment data and linked by a pseudonymous ID. | M |
| NFR-PRI-04 | Raw audio shall be deleted right after processing by default. Transcripts and scores follow a set **retention period** (configurable, proposed 1 year) and are then deleted or anonymised. | M |
| NFR-PRI-05 | Analytics shall use **anonymised, aggregated data only**. | M |
| NFR-PRI-06 | No victim data shall be used to train models without separate, explicit consent. | M |

### 4.2 Security (NFR-SEC)
| ID | Requirement | Priority |
|---|---|---|
| NFR-SEC-01 | All traffic shall use **HTTPS/TLS**. Sensitive fields shall be **encrypted at rest**. | M |
| NFR-SEC-02 | Staff login shall use **role-based access control**. Admin and supervisor accounts shall support two-factor authentication. | M |
| NFR-SEC-03 | Staff sessions shall time out after inactivity (default 15 minutes). | M |
| NFR-SEC-04 | The app shall be protected against the **OWASP Top 10** (input validation, CSRF protection, secure headers, no secrets in client code). | M |
| NFR-SEC-05 | Third-party AI APIs, if used, shall receive **de-identified text only**: no names, phone numbers or addresses. | M |

### 4.3 Ethical and responsible AI (NFR-ETH)
| ID | Requirement | Priority |
|---|---|---|
| NFR-ETH-01 | **Human in the loop**: the AI only screens, prioritises and recommends. It never makes final decisions, diagnoses, or contacts police on its own (except the Critical emergency path, which is reviewed afterwards). | M |
| NFR-ETH-02 | **No diagnostic labels** shall be shown to victims ("you have depression"). Responders see "indicators", not diagnoses. | M |
| NFR-ETH-03 | **Explainability**: every SVI, band and recommendation can be traced to its evidence and rules (FR-IND-04, FR-SVI-03). | M |
| NFR-ETH-04 | **Fairness**: performance shall be evaluated separately by language, gender and channel. Gaps above the threshold in AC-ETH-02 must be reported and addressed. | M |
| NFR-ETH-05 | **Asymmetric error policy**: for suicidal ideation and immediate danger, the system prefers false alarms over misses (high recall), because a missed case costs far more. | M |
| NFR-ETH-06 | **Trauma-informed wording** in everything the module returns for the person and in the questions it suggests to operators: gentle, non-judgemental, no forced retelling, no time pressure. | M |
| NFR-ETH-07 | The calling system shall give the person a clear **AI disclosure** (an automated tool supports the human team); the integration guide supplies the wording. | M |

### 4.4 Performance and real-time behaviour (NFR-PERF)
| ID | Requirement | Priority |
|---|---|---|
| NFR-PERF-01 | The SVI shall update within **3 seconds** of a text message being submitted (95th percentile). | M |
| NFR-PERF-02 | The SVI shall update within **5 seconds** of each voice window ending (95th percentile). | M |
| NFR-PERF-03 | A Critical alert shall reach the counsellor dashboard within **5 seconds** of the band changing. | M |
| NFR-PERF-04 | Safety-lexicon checks (FR-NLP-10) shall run in **under 50 ms**, independent of the ML model. | M |
| NFR-PERF-05 | Dashboards shall load in under 3 seconds with 1,000 cases in the database. | S |

### 4.5 Accessibility and usability (NFR-ACC)
| ID | Requirement | Priority |
|---|---|---|
| NFR-ACC-01 | Staff screens and the public pages (home, the portal journey, track, login) shall meet **WCAG 2.1 AA** (contrast, keyboard navigation, screen-reader labels). Victim-facing screens of NHAA's own systems belong to the calling system. | M |
| NFR-ACC-02 | ~~Low-literacy victim screens~~ *Removed 16 Nov 2026: the calling system's interface.* | – |
| NFR-ACC-03 | ~~Victim flow on a low-end phone~~ *Removed 16 Nov 2026: the calling system's interface.* | – |
| NFR-ACC-04 | Text the module returns for the person and the operator's suggested questions shall be written at a simple reading level and reviewed by native speakers per language. | S |

### 4.6 Reliability and availability (NFR-REL)
| ID | Requirement | Priority |
|---|---|---|
| NFR-REL-01 | If the AI model or external API fails, the system shall **fall back** to the rule-based lexicon and case-context scoring, mark the SVI as "limited confidence", and still route the case. A failure must never block an API call from the calling system. | M |
| NFR-REL-02 | If voice analysis fails, the session shall continue in text mode without losing data. | M |
| NFR-REL-03 | Errors shall be logged without writing victim content into the logs. | M |

### 4.7 Maintainability and scalability (NFR-MNT)
| ID | Requirement | Priority |
|---|---|---|
| NFR-MNT-01 | The AI assessment logic shall be a **separate service/module** behind an interface, so models can be swapped (e.g. LLM → fine-tuned classifier) without UI changes. | M |
| NFR-MNT-02 | The codebase shall use TypeScript, linting and a consistent folder structure, with tests for scoring logic. | M |
| NFR-MNT-03 | Scoring logic (fusion, SVI, bands, overrides, recommendations) shall have **unit-test coverage of at least 80%**. | S |
| NFR-MNT-04 | The system design shall allow horizontal scaling (stateless API routes, external database and queue). | C |

---

## 5. Constraints

### 5.1 Legal and policy
| ID | Constraint |
|---|---|
| C-LEG-01 | Must follow the **Digital Personal Data Protection Act, 2023** for consent, purpose limitation and data-principal rights. |
| C-LEG-02 | Must respect the **SC/ST (Prevention of Atrocities) Act, 1989** and its Rules, including the rights of victims and witnesses. Recommendations must not contradict statutory procedures. |
| C-LEG-03 | Must respect patient-confidentiality principles under the **Mental Healthcare Act, 2017**: mental-health information is shared only with those who need it for care. |
| C-LEG-04 | Must follow the **IT Act, 2000** and its rules for reasonable security practices for sensitive personal data. |
| C-LEG-05 | The system must not present itself as a medical or diagnostic device. |

### 5.2 Ethical
| ID | Constraint |
|---|---|
| C-ETH-01 | A human must review every case that leads to action. No fully automated decisions about a person. |
| C-ETH-02 | Police and law enforcement must never receive emotional or clinical detail. |
| C-ETH-03 | Caste or community identity must **not** be used as a risk feature. Vulnerability comes from circumstances (threats, isolation, offence type), not identity. |
| C-ETH-04 | The victim's participation in the assessment must be voluntary at every step. |

### 5.3 Technical
| ID | Constraint |
|---|---|
| C-TEC-01 | Front end and API layer built with **Next.js (App Router) and TypeScript**. |
| C-TEC-02 | Real telephony (actual calls to 14566) is not available. Voice calls are **simulated in the demo input layer** (browser microphone only, sent through the integration API). Audio is never generated. |
| C-TEC-03 | AI services are limited to **free or student tiers or open-source models**: for example an LLM API for NLP, Whisper or Bhashini for STT, and a lightweight audio feature library for pitch and pauses. |
| C-TEC-04 | Browser microphone access requires HTTPS and user permission. The app must handle denial gracefully. |
| C-TEC-05 | Accuracy of Indian-language STT varies, especially for dialects. Scoring must account for transcript confidence. |

### 5.4 Data
| ID | Constraint |
|---|---|
| C-DAT-01 | **No real victim data** is available or may be used. All development and testing use **synthetic, scripted scenarios** written and labelled by the team. |
| C-DAT-02 | No public, labelled dataset exists for this population. Public emotion and speech datasets may be used for general model checks only, and the gap must be documented. |
| C-DAT-03 | Synthetic test scenarios must be written respectfully and must not contain graphic detail. |

### 5.5 Project (coursework)
| ID | Constraint |
|---|---|
| C-PRJ-01 | Fixed coursework deadline and team size *(to be filled in)*. Must-have requirements take priority. |
| C-PRJ-02 | Must be deployable as a live demo (e.g. Vercel plus a managed database). |
| C-PRJ-03 | Must include documentation: README, architecture diagram, API docs, and evaluation report. |

---

## 6. Acceptance criteria

**Test basis:** A labelled **synthetic evaluation set** (AC-EVAL-01) is the reference for every accuracy-based criterion.

### 6.0 Evaluation set
| ID | Criterion |
|---|---|
| AC-EVAL-01 | A synthetic evaluation set of **at least 60 scenarios** exists, each a conversation (the operator's or chatbot's questions and the person's replies; only the person's words are scored): at least 15 per risk band; at least 10 in Hindi, 10 in Hinglish, 10 in English and 5 per regional language; at least 15 as voice recordings; at least 10 negation or "tricky" cases (e.g. "I would never hurt myself"). Each is labelled with the expected band, expected indicators and expected recommendations, agreed by at least 2 team members. |

### 6.1 Channels and intake
| ID | Linked FR | Criterion (pass/fail) |
|---|---|---|
| AC-CH-01 | FR-CH-01, 02 | A calling system can complete a full assessment through the integration API with text messages and with audio windows, and gets valid responses. |
| AC-CH-02 | FR-CH-03, 04 | During a simulated voice call, the operator console shows a live transcript and an SVI that changes at least once per voice window. |
| AC-CH-03 | FR-CH-05 | ~~IVRS keypad~~ *Removed 16 Nov 2026.* |
| AC-CH-04 | FR-CH-07 | Every saved interaction has a docket number and a channel value; this is verified by a database query showing no missing values. |
| AC-CH-05 | FR-CH-09 | ~~Quick exit and skip~~ *Removed 16 Nov 2026: the calling system's interface.* |
| AC-CH-06 | FR-CH-06 | ~~PWA install~~ *Removed 16 Nov 2026.* |
| AC-CH-07 | FR-CH-01, 02 | Messages sent as `OPERATOR` are stored but never produce an indicator; the module has no endpoint that accepts structured answers or key presses (a request to one gets 404). |

### 6.2 Consent
| ID | Linked FR | Criterion |
|---|---|---|
| AC-CON-01 | FR-CON-01 | Starting an interaction without a consent state is rejected; an interaction whose consent does not allow analysis never sends text or audio to the AI service (verified in the analysis client's calls). |
| AC-CON-02 | FR-CON-02 | Declining voice consent but accepting text consent results in text-only analysis; audio for that interaction is not analysed. |
| AC-CON-03 | FR-CON-03 | Declining all consent still records and routes the interaction and runs the safety lexicon on every message; no SVI is calculated. |
| AC-CON-04 | FR-CON-04 | Withdrawing consent mid-session stops analysis within 1 second, and stored raw audio for that session is deleted (verified in storage). |
| AC-CON-05 | FR-CON-06 | Each consent record holds a timestamp, language, notice version and all four choices. |
| AC-CON-06 | FR-CON-01 | ~~Consent notice text and audio~~ *Removed 16 Nov 2026: the calling system shows its own notice; the module records its version.* |

### 6.3 Voice and speech analytics
| ID | Linked FR | Criterion |
|---|---|---|
| AC-VOI-01 | FR-VOI-02 | On a test recording with 5 inserted pauses of known length, the system detects all 5 with lengths within ±0.3 s. |
| AC-VOI-02 | FR-VOI-03 | On a synthetic tone or recorded sample of known pitch, mean pitch is within ±10% of the true value; a flat-voice sample is flagged "low variation" and an agitated sample "high variation". |
| AC-VOI-03 | FR-VOI-04 | Speech rate on a reference recording is within ±15% of a manual count. |
| AC-VOI-04 | FR-VOI-06 | Voice emotion output includes a label and a confidence value for every window. |
| AC-VOI-05 | FR-VOI-08 | No scenario in the evaluation set reaches Critical from voice features alone (verified by running the set with text disabled). |
| AC-VOI-06 | FR-VOI-09 | After a session without audio-retention consent, no raw audio file exists in storage. |
| AC-VOI-07 | FR-VOI-01 | STT word error rate is reported per language on the evaluation recordings (no fixed threshold; reported for transparency). |
| AC-VOI-08 | FR-VOI-10 | On a two-voice test recording, every transcript sentence is labelled `OPERATOR` or `CALLER`, no indicator comes from an operator sentence, and voice features come from caller segments only. Until then, every assessment from two-voice audio is marked limited confidence. |

### 6.4 NLP and emotion AI
| ID | Linked FR | Criterion |
|---|---|---|
| AC-NLP-01 | FR-NLP-03, NFR-ETH-05 | **Suicidal ideation recall = 100%** on evaluation scenarios labelled with suicidal ideation (no misses). Precision is reported. |
| AC-NLP-02 | FR-NLP-05 | **Immediate danger recall = 100%** on scenarios labelled with immediate danger. |
| AC-NLP-03 | FR-NLP-02, 04 | Intimidation and social isolation detection each reach **recall ≥ 85%** and **precision ≥ 70%** on the evaluation set. |
| AC-NLP-04 | FR-NLP-08 | At least 90% of negation/"tricky" scenarios are scored correctly (no false suicidal-ideation flag on "I would never hurt myself"). |
| AC-NLP-05 | FR-NLP-07 | Every indicator shown in the UI has a highlighted evidence phrase that appears word-for-word in the transcript. |
| AC-NLP-06 | FR-NLP-10, NFR-REL-01 | With the ML/LLM service switched off, the safety lexicon still flags 100% of the scenarios used in AC-NLP-01 and AC-NLP-02. |
| AC-NLP-07 | FR-NLP-06 | Hinglish scenarios reach at least 80% of the indicator F1 score of the English scenarios. |
| AC-NLP-08 | FR-NLP-11 | "No" sent after an operator turn "Are you safe right now?" raises the band to at least High (OV-9); the same "No" after an unrelated question does not. |
| AC-NLP-09 | FR-NLP-11 | "More than half the days" sent after an operator turn asking how often the person felt nervous or worried gives fear/anxiety ≥ 0.5; the same answer after an unrelated question gives nothing. |
| AC-EMO-01 | FR-EMO-01, 02 | The emotion profile includes at least the six required classes with confidence values; fused output exists for every window that has both text and voice. |

### 6.5 Screening and safety check: removed
*AC-SCR-01…03 removed 16 Nov 2026 with FR-SCR.* The safety path in every consent mode is checked by AC-CON-03; suicidal intent and "not safe now" stated in words are checked by AC-RISK-02 (OV-1, OV-9) and AC-NLP-01.

### 6.6 Indicators, SVI and risk bands
| ID | Linked FR | Criterion |
|---|---|---|
| AC-IND-01 | FR-IND-01 | Every assessed interaction stores all 8 dimension scores, each between 0 and 1, with confidence values. |
| AC-IND-02 | FR-IND-05 | A counsellor can reject an indicator; the SVI is recalculated, and the original AI value plus the correction and reason are visible in the audit log. |
| AC-SVI-01 | FR-SVI-01 | SVI is always an integer from 0 to 100; unit tests confirm the formula against 10 hand-calculated examples. |
| AC-SVI-02 | FR-SVI-02, NFR-PERF-01, 02 | The SVI updates within 3 s after a text message and within 5 s after a voice window (95th percentile over 50 runs). |
| AC-SVI-03 | FR-SVI-03 | The breakdown's dimension contributions add up to the displayed SVI (±1 for rounding). |
| AC-SVI-04 | FR-SVI-07 | Running the same input twice with the same config version gives the identical SVI and band. |
| AC-RISK-01 | FR-RISK-01 | **Band accuracy ≥ 80%** on the evaluation set, and **no Critical scenario is placed below High**. |
| AC-RISK-02 | FR-RISK-02 | Every safety override in Appendix B is triggered by at least one test, and each forces the correct minimum band regardless of SVI. |
| AC-RISK-03 | FR-RISK-03 | After an override fires, later calm messages do not lower the band; only a responder override (with reason) can. |
| AC-RISK-04 | FR-RISK-05 | Every band display shows a text label as well as a colour. |

### 6.7 Recommendations
| ID | Linked FR | Criterion |
|---|---|---|
| AC-REC-01 | FR-REC-01, 02 | Across the evaluation set, **all six support types** are recommended at least once, and **≥ 85%** of expected recommendations are produced. |
| AC-REC-02 | FR-REC-03 | Every recommendation shows its reason, its urgency or SLA, and the responsible stakeholder. |
| AC-REC-03 | FR-REC-05 | A non-emergency recommendation cannot reach an external queue until a counsellor or supervisor approves it (verified by attempting it through the API). |
| AC-REC-04 | FR-REC-06 | In a Critical scenario, the integration response (and the `emergency.show` stream event) carries emergency options in the interaction's language within 3 seconds of the band changing. |
| AC-REC-05 | FR-REC-07 | Approving a "police intervention" recommendation creates a task in the police liaison queue that contains **no narrative text and no SVI breakdown**. |

### 6.8 Multilingual
| ID | Linked FR | Criterion |
|---|---|---|
| AC-LANG-01 | FR-LANG-01 | The emergency options and the operator's suggested questions exist in the 5 required languages (an automated check finds no missing translation keys). |
| AC-LANG-02 | FR-LANG-03 | Language auto-detection is correct for ≥ 90% of evaluation scenarios. |
| AC-LANG-03 | FR-LANG-02 | Band accuracy for each language is reported; no required language falls more than 15 percentage points below English. |
| AC-LANG-04 | FR-LANG-06 | Responders see the original text and the translation, with the evidence phrase highlighted in both. |
| AC-LANG-05 | FR-LANG-07 | The site opens in English. Switching to Hindi changes every public page, the portal journey (including the assistant's questions), the login page and the staff portals' labels, and survives a reload; `npm run i18n:check` finds no missing key in the five message files. |

### 6.9 Case management, alerts and dashboards
| ID | Linked FR | Criterion |
|---|---|---|
| AC-CASE-01 | FR-CASE-01 | With 20 mixed cases loaded, the queue order is Critical → High → Moderate → Low, then SVI descending, then waiting time. |
| AC-CASE-02 | FR-CASE-04 | Overriding a band without entering a reason is blocked. |
| AC-ALR-01 | FR-ALR-01, NFR-PERF-03 | A Critical alert appears on a logged-in counsellor's screen within 5 s, without a page refresh. |
| AC-ALR-02 | FR-ALR-02, 03 | An unacknowledged Critical alert escalates to the supervisor after the set timeout; acknowledgement time is stored. |
| AC-DSH-01 | FR-DSH-04, NFR-PRI-02 | A `police_liaison` user who requests a case's narrative or SVI breakdown directly through the API gets **403 Forbidden**. |
| AC-DSH-02 | FR-DSH-06 | Ministry and state analytics show no personal identifiers, and any cell with a count below 5 is suppressed. |
| AC-DSH-03 | FR-DSH-01–06 | Each of the roles in §2 can log in and sees only its own dashboard (verified by a role-by-role test). |

### 6.10 API and audit
| ID | Linked FR | Criterion |
|---|---|---|
| AC-API-01 | FR-API-01, 04 | An API test script runs a full interaction (start → messages → SVI → recommendations → close) with a docket number and gets valid responses. |
| AC-API-02 | FR-API-02 | Requests without a valid key get 401; requests over the rate limit get 429. |
| AC-API-03 | FR-API-07 | Unit tests show: the opening question with no turns; asked questions never suggested again; safety first and `safePlace` after "not safe now"; suicide questions on any sign; `null` after six scripted questions; the response holds exactly `question.key` and `question.text`; another client's interaction gets 404 and a key without `questions:read` gets 403. |
| AC-AUD-01 | FR-AUD-01, 02 | Viewing, editing and exporting a case each create an audit entry with user, time and action; AI outputs record model and config versions. |

### 6.11 Non-functional
| ID | Linked NFR | Criterion |
|---|---|---|
| AC-SEC-01 | NFR-SEC-01, 04 | The app is served over HTTPS; a scan (e.g. OWASP ZAP baseline) finds no high-severity issues. |
| AC-SEC-02 | NFR-SEC-05 | Text sent to third-party AI APIs contains no names, phone numbers or addresses (tested with 10 scenarios that contain them). |
| AC-PRI-01 | NFR-PRI-03 | Personal identifiers and assessment data are in separate tables, linked only by a pseudonymous ID. |
| AC-ETH-01 | NFR-ETH-02 | Nothing the module returns for the person (the emergency options) contains a score, band, indicator name or diagnostic label (checked in the integration tests). |
| AC-ETH-02 | NFR-ETH-04 | A fairness report lists band accuracy by language, gender and channel; any gap above 15 percentage points is documented with a mitigation plan. |
| AC-ACC-01 | NFR-ACC-01 | axe finds no WCAG 2.1 AA violations on the sign-in page and the staff dashboards. |
| AC-REL-01 | NFR-REL-01 | With the AI service down, a new interaction is still accepted, scored in fallback mode, marked "limited confidence" and placed in the queue. |
| AC-MNT-01 | NFR-MNT-03 | Unit-test coverage of the scoring module is ≥ 80%. |

---

## 7. Traceability matrix

### 7.1 Expected Solution → requirements → acceptance
| # | Expected Solution point (problem statement) | Requirements | Acceptance criteria |
|---|---|---|---|
| ES-1 | Analyse voice interactions, speech patterns, pauses, pitch variation, emotional indicators, and textual narratives | FR-VOI-01…09, FR-NLP-01…09, FR-EMO-01…04, FR-CH-03, 04 | AC-VOI-01…07, AC-NLP-05, AC-EMO-01, AC-CH-02 |
| ES-2 | Use NLP, Speech Analytics and Emotion AI to identify signs of trauma and distress | FR-NLP-*, FR-VOI-*, FR-EMO-*, FR-IND-03 | AC-NLP-01…07, AC-VOI-*, AC-EMO-01 |
| ES-3 | Generate a Stress Vulnerability Index (SVI) on a predefined scale | FR-SVI-01…07, Appendix A | AC-SVI-01…04 |
| ES-4 | Categorise victims into Low, Moderate, High and Critical risk | FR-RISK-01…05, Appendix B | AC-RISK-01…04 |
| ES-5 | Detect severe trauma, fear, depression, suicidal ideation, intimidation, social isolation and extreme vulnerability | FR-IND-01…05, FR-NLP-02…05, FR-NLP-11 | AC-IND-01, 02, AC-NLP-01…04, AC-NLP-08 |
| ES-6 | Automatically recommend counselling, legal aid, medical help, police intervention, witness protection or emergency support based on risk | FR-REC-01…09, Appendix C | AC-REC-01…05 |
| ES-7 | Support multilingual interactions, including major Indian languages and dialects | FR-LANG-01…06, FR-NLP-06 | AC-LANG-01…04, AC-NLP-07 |
| ES-8 | Maintain privacy, informed consent, confidentiality and ethical AI standards | FR-CON-*, FR-AUD-*, NFR-PRI-*, NFR-SEC-*, NFR-ETH-*, C-LEG-*, C-ETH-* | AC-CON-01…06, AC-PRI-01, AC-SEC-01, 02, AC-ETH-01, 02, AC-DSH-01, 02, AC-AUD-01 |

### 7.2 Expected Outcomes → features → how it is shown
| # | Expected Outcome | Features that deliver it | Measured by (in the demo/evaluation) |
|---|---|---|---|
| EO-1 | Early identification of highly distressed victims | Real-time SVI, safety lexicon on every message, safety overrides, Critical alerts | AC-NLP-01, 02, AC-RISK-01, AC-ALR-01; **time from first message to Critical flag** reported |
| EO-2 | Prioritisation of counselling and rehabilitation services | Risk-sorted queue, counsellor assignment, recommendation engine, follow-ups | AC-CASE-01, AC-REC-01; comparison of **risk-sorted vs. first-come queue** on the evaluation set (average wait for Critical cases) |
| EO-3 | Improved victim-centric grievance redressal | Consent state per interaction, no retelling (case summary), multilingual, emergency options returned to the calling system | AC-CON-*, AC-LANG-01, AC-REC-04; short usability test with 5+ participants, using a post-session comfort rating |
| EO-4 | Better allocation of support resources | District dashboard, demand-vs-capacity analytics, referral routing by type and district | AC-DSH-02, 03, AC-REC-05; dashboard shows referrals by type and district |
| EO-5 | Enhanced responsiveness of the helpline and portal ecosystem | Operator assist console, live alerts, escalation, SLAs, integration API | AC-ALR-01, 02, AC-API-01, NFR-PERF-*; **alert-to-acknowledgement time** reported |

### 7.3 Stakeholders → what they get → acceptance
| Stakeholder | Role(s) | Features | Acceptance criteria |
|---|---|---|---|
| Department of Social Justice and Empowerment | `ministry_admin` | National anonymised analytics, trends, response-time metrics | AC-DSH-02, 03 |
| National Helpline Against Atrocities (14566) | `operator`, `nhaa_supervisor` | Operator console, live SVI, risk queue, alerts and escalation, API | AC-CH-02, AC-CASE-01, AC-ALR-01, 02, AC-API-01 |
| State Governments and Union Territories | `state_admin` | State analytics, escalated high-risk cases | AC-DSH-02, 03 |
| District Administrations | `district_officer` | District dashboard, pending referrals, SLA breaches, escalation target | AC-DSH-03, AC-ALR-02 |
| Counsellors and Mental Health Professionals | `counsellor` | Case detail, evidence, approvals, overrides, follow-ups | AC-IND-02, AC-REC-03, AC-CASE-02, AC-ALR-01 |
| Law Enforcement Agencies | `police_liaison` | Minimal action-request queue | AC-REC-05, AC-DSH-01 |
| Rehabilitation and Welfare Authorities | `welfare_officer` | Rehabilitation and relief referral queue | AC-DSH-03, AC-REC-01 |

---

## 8. Out of scope and assumptions

### 8.1 Out of scope
- Clinical diagnosis or treatment of any mental-health condition.
- Real telephony integration with the 14566 call centre (simulated instead).
- Integration with real police (CCTNS) or court systems.
- Long-term monitoring after the complaint (SIH26094); only a follow-up hook is provided.
- Training large models from scratch; existing models and APIs are used and adapted.
- Facial or video emotion analysis (not asked for in the problem statement, and it adds privacy risk).
- **Victim-facing screens** (portal, chatbot interface, IVRS menus, mobile app): NHAA's systems own them. The module provides the integration API, plus a detachable demo input layer for presentation only (PRODUCT_VISION.md §6).
- **Questionnaires and structured screening** (PHQ-2, GAD-2, PC-PTSD-5, C-SSRS, keypad answers): removed 16 Nov 2026 (PRODUCT_VISION.md §5).

### 8.2 Assumptions
- NHAA would provide a docket number and basic case context through an API in a real deployment.
- Counsellors and responders are available to act on alerts; the system supports their work and does not replace it.
- NHAA's systems obtain consent, show the AI disclosure and the emergency options, and send the person's words and audio through the integration API.
- Synthetic scenarios are a reasonable proxy for testing, but real-world validation with professionals would be needed before deployment.
- The default weights and thresholds in the appendices are starting values to be tuned on the evaluation set and reviewed by a mental-health professional if possible.

---

## 9. Appendices

### Appendix A: SVI formula (default)

**Step 1, dimension fusion.** For each dimension *d*, combine the available sources *s* (text NLP, safety lexicon, voice, case context):

```
dimension_score(d) = Σ_s ( w_s · c_s · x_s,d ) / Σ_s ( w_s · c_s )
```
where `x` is the source's 0–1 score for that dimension, `c` its confidence (0–1), and `w` the source weight:

| Source | Default weight `w_s` |
|---|---|
| Explicit statements: text NLP (AI) | 0.40 |
| Explicit statements: safety lexicon (rules) | 0.40 |
| Case context | 0.15 |
| Voice / acoustic features | 0.15 |

The weights are relative: the formula divides by the weights of the sources actually present, so it is defined for any subset of sources. The screener source (0.30) was removed in scoring config v3 (16 Nov 2026); the other weights are unchanged. A dimension counts as fully covered when the sources present weigh at least 0.70 together (for example text NLP plus the safety lexicon); with less, its confidence is reduced proportionally.

**Step 2, SVI.**
```
SVI = round( 100 · Σ_d ( W_d · dimension_score(d) ) )      with Σ_d W_d = 1
```

| Dimension | Default weight `W_d` |
|---|---|
| Suicidal ideation / self-harm | 0.20 |
| Intimidation / threat | 0.15 |
| Severe trauma | 0.15 |
| Extreme vulnerability | 0.12 |
| Fear / anxiety | 0.12 |
| Depression | 0.10 |
| Social isolation | 0.08 |
| Acute stress / distress | 0.08 |

**Step 3, band.** 0–29 Low · 30–54 Moderate · 55–74 High · 75–100 Critical, then apply the safety overrides in Appendix B.

**No structured answers.** Config v3 has no screener source and no "denial" scores. A spoken or written "no" is analysed like any other words (FR-NLP-11).

**Answers to wellbeing questions asked in the conversation** (FR-NLP-11, task M.9; decided 16 Nov 2026). If NHAA's chatbot or operator asks a PHQ-2, GAD-2 or PC-PTSD-5 question and the person's next message is a short answer, rules turn that answer into an indicator (source: safety lexicon, confidence 0.75), **one item at a time**: low-mood and anxiety items score frequency / 3 ("Several days" 0.33, "More than half the days" 0.67, "Nearly every day" 1.0; "Not at all" adds nothing); a "Yes" to a trauma item scores severe trauma 0.6. Within the source the strongest item counts (step 1). This is an approximation of the instruments, not their validated totals, and it applies only when the questions are actually asked.

### Appendix B: Safety overrides (default)
| # | Condition | Minimum band |
|---|---|---|
| OV-1 | Suicidal ideation with stated intent, plan or means | Critical |
| OV-2 | Accused present or nearby **now** (said, or `accusedNearby` in case details), or the victim is confined | Critical |
| OV-3 | Current serious injury needing urgent medical care | Critical |
| OV-4 | Explicit threat to life of the victim or family | High |
| OV-5 | Sexual offence and the victim is a minor | High |
| OV-6 | Passive suicidal ideation (wishing to be dead, without a plan) | High |
| OV-7 | Pressure or threats to withdraw the complaint or turn hostile as a witness | High |
| OV-8 | Displaced or homeless as a result of the atrocity | Moderate |
| OV-9 | Says they are **not safe right now**, in their own words ("I am not safe here"), or answers "no" to the chatbot's or operator's "Are you safe right now?" (FR-NLP-11) | High |

### Appendix C: Recommendation mapping (default)
| Trigger (indicator or band) | Recommendation | Responsible | Default urgency |
|---|---|---|---|
| Band = Critical (any cause) | **Emergency support**: show 112 and Tele-MANAS 14416, immediate counsellor callback | Counsellor / NHAA supervisor | Immediate; callback ≤ 15 min |
| Suicidal ideation ≥ 0.5 or OV-1/OV-6 | **Counselling** (crisis), plus emergency support if Critical | Counsellor | ≤ 15 min (Critical), ≤ 24 h (High) |
| Depression, trauma or fear ≥ 0.5 | **Counselling** (trauma-informed) | Counsellor | ≤ 24 h (High), ≤ 72 h (Moderate) |
| Intimidation ≥ 0.5 or OV-2/OV-4 | **Police intervention** (protection visit, patrolling) | Police liaison via district | Immediate (Critical), ≤ 24 h (High) |
| OV-7, or a witness under threat | **Witness protection** (per PoA Act provisions) | District officer, police liaison | ≤ 24 h |
| Current injury or sexual offence | **Medical assistance** (examination, treatment) | District health contact / welfare | Immediate (OV-3), ≤ 24 h otherwise |
| Confusion about rights, a long-running case, or a complaint not registered | **Legal aid** (District Legal Services Authority) | Welfare officer | ≤ 72 h |
| Social isolation ≥ 0.5, or OV-8 | Rehabilitation and relief referral, plus counselling | Welfare officer | ≤ 72 h |
| Band = Low | Information on rights, the self-help line, and an optional follow-up | Automatic (no approval needed) | Not applicable |

### Appendix D: Glossary of screeners (removed)
*Removed 16 Nov 2026 with FR-SCR.* The module uses no screening instruments. Operators may still be shown scripted, pre-translated questions to ask aloud (FR-DSH-01); the answers are analysed as speech.
