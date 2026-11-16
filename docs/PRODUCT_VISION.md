# Product Vision and Demo Architecture (updated)
## AI-Based Real-Time Stress and Trauma Assessment Module (SIH26093)

**Status:** updated 16 November 2026 from the team's product vision brief, checked against the repository. Where this document and an older document disagree about *what the product is*, this one wins. The older documents are brought into line in §11. Items marked **OPEN** need a team decision.

---

## 1. The product in one sentence

A **channel-independent, plug-in assessment module** that NHAA's existing systems (chatbot, helpline, IVRS, mobile app, operator desk) can call. They send it what the person said or wrote; it returns a structured assessment for authorised human review.

**The module is the product. The demo input layer is only a presentation and testing harness.**

## 2. What the product is not

- Not a new chatbot, helpline, IVRS, mobile app or complaint portal for NHAA to adopt.
- **Not a quiz.** The module does not question the person. It analyses what they already said or wrote in NHAA's own channel (§5).
- Not a clinical diagnosis tool, and not a replacement for human review.

## 3. How NHAA's systems use it

1. An NHAA system collects the conversation in its own interface and obtains consent in its own workflow.
2. It sends the content and metadata to the module through the documented integration API with its API key.
3. The module validates, analyses and scores the input.
4. The module returns a structured result.
5. The NHAA system decides how to show, store or route it to an authorised reviewer.

**Boundary:** NHAA's system owns the user experience. The module owns the assessment.

```text
  NHAA chatbot   Helpline   IVRS   Mobile app / portal   Operator desk
        \           |         |            |                /
         +----------------------------------------------+
         |  Integration API  /api/v1/integration/*      |
         |  (API key, scopes, rate limit, consent state)|
         +----------------------------------------------+
                              |
                              v
         +----------------------------------------------+
         |            CORE ASSESSMENT MODULE            |
         |  validate -> safety lexicon -> redact PII    |
         |  -> AI analysis (text, audio) -> guardrails  |
         |  -> fuse -> SVI -> band -> safety overrides  |
         |  -> evidence -> recommendations (proposals)  |
         +----------------------------------------------+
                              |
                              v
         Structured result -> NHAA consuming system
         (case workflow, authorised human review, referrals)


  SEPARATE: DEMO INPUT LAYER (detachable)
  Live text | Live microphone | Recorded audio library | Generated text
                              |
                 same integration API, a demo API key
                              |
                    CORE ASSESSMENT MODULE
                              |
                     Demo results view
```

## 4. What already exists in the repository

| Part of the vision | Where it is today | State |
|---|---|---|
| Core assessment logic | `web/src/core/` (`safety-lexicon`, `scoring`, `recommendations`, `pipeline`, `privacy`, `analysis-client`) and `analysis-service/` (Python: speech-to-text, voice features, text analysis) | Built and tested (621 unit tests). No assessment logic lives in UI components. |
| Integration API | `/api/v1/integration/*`: start interaction, `/messages`, `/audio`, `/context`, `/screeners` (to be removed, §5), `/assessment`, `/recommendations`, `/stream` (live updates), `/end`. API keys, scopes, per-key rate limits. | Built and tested (`integration.spec.ts`, `npm run api:example`). **This is the product's front door.** |
| Source channel | `interactions.channel`: `PORTAL`, `CHATBOT`, `VOICE_CALL`, `IVRS`, `MOBILE_APP`, `OPERATOR_ASSISTED`, `API` | Built. No demo value yet (§8). |
| Input method | `messages.modality`: `TEXT`, `VOICE_TRANSCRIPT`, `IVR_KEYPRESS` | Built, and already separate from channel. Does not yet tell live audio from recorded audio (§8). |
| Structured output | `GET /integration/…/assessment` returns SVI, band, confidence, limited-confidence flag, explanation, overrides fired, top dimensions | Built, but **does not return indicators with evidence quotes** (only the staff API does). Gap, see §8. |
| Audio path | `/audio` accepts 5-second windows (limit 6 s, 200 KB each): speech-to-text, pauses, pitch, energy, voice emotion, then the transcript goes through the text pipeline | Built for live windows. A whole recorded file must be cut into windows first (§8). |
| Consent, privacy, audit, human approval | Consent state required on integration start; PII redaction; encryption; audit chain; recommendations are proposals | Built. Stays unchanged. |
| Staff dashboards | `(staff)` pages: operator console, counsellor queue and case detail, approvals, district, police, welfare, analytics, admin | Built. **Kept** as the reference consuming system: every demo case appears on the right staff dashboards (§7). |
| Victim-facing website | `/` homepage (built 15 Nov, task F.2), `/portal/<lang>` start, consent, chat with questions, IVRS keypad page | Built, but not part of the product. **Decided: delete** (homepage, `/portal` pages, keypad page). |

## 5. Two inputs only: text and voice. No quiz, no structured answers

**Decided 16 Nov 2026.** A person communicates with NHAA in one of two ways, and the module accepts exactly those two:

- **Text:** the messages of a chat. If safety or wellbeing questions are asked, NHAA's chatbot asks them inside the chat, and the answers arrive as ordinary messages.
- **Voice:** the audio of a call. If those questions are asked, the helpline operator asks them aloud, and the answers arrive as ordinary speech.

There is no third input. The module never asks questions, has no questionnaire, and has no endpoint for structured answers or key presses.

**What is removed:** the question flow and screeners (`core/conversation`, `core/screeners`), the `/screeners` endpoints on the victim and integration APIs, the `SCREENER` signal source and its 30% source weight, the `IVR_KEYPRESS` modality, and the keypad page.

**What this requires of the module:**
1. **Answers must be read with their question.** "No" means nothing alone; after "Are you safe right now?" it is a safety signal. The module needs the preceding question (the chatbot's or operator's turn) as context for both the AI analysis and the safety rules. Today the safety lexicon reads one message at a time, so short answers are a gap (V7).
2. **The questioner's words must not be scored as the person's.** In chat this is already handled (`sender: OPERATOR` vs `VICTIM`). Call audio contains both voices (operator and caller), so **speaker separation is required**: each transcript sentence is labelled `OPERATOR` or `CALLER`, only the caller's words are scored, and voice features are taken from the caller's segments only. It is not built yet; **until it is, any assessment from two-voice audio must be marked limited confidence** (V8, task M.10, FR-VOI-10).

**Decided 16 Nov 2026:** there is no quiz inside the module, and inputs stay text and voice only, but where NHAA's chatbot or operator asks safety or wellbeing (PHQ-2, GAD-2, PC-PTSD-5) questions in the conversation, the person's answers are scored, read with the question just before them (task M.9).

**Trade-offs accepted:** risk the person never puts into words is not detected; the safety overrides for "not safe now", "accused nearby" and "suicidal intent" fire only from what is said or from case details; low mood, anxiety and trauma rest on language and voice alone; scores and confidence will drop and must be re-measured (`EVALUATION_REPORT.md`), with scenarios that relied on answers rewritten as conversations.

**OPEN:** whether case details that NHAA's record already holds (offence type, age group) may still be sent as metadata. They are not something the person communicates, and two safety overrides depend on them (§10).

## 6. The demo input layer

A separate set of pages for presenters and testers, with **four input modes**. These modes are demo inputs, not module features: the module only sees API calls. Audio is never generated; voice comes from the live microphone or the team's own recordings. It calls the module **only through the integration API** with its own demo API key, exactly as an NHAA system would. The module must work with the demo switched off.

| # | Mode | Represents | Data path | What is needed |
|---|---|---|---|---|
| 1 | **Live text** | Chatbot | `/messages`, one message at a time | Chat-style page. Small build. |
| 2 | **Live microphone** | Helpline call | `/audio`, 5 s windows | The existing recorder is moved from the victim pages into the demo. Free-tier limit: one live call at a time. |
| 3 | **Recorded audio library** | Repeatable helpline cases | `/audio` | Team recordings with stable scenario IDs; a step that cuts each file into 5 s windows. The real audio is sent, never a prewritten transcript. |
| 4 | **Generated text** | Synthetic chatbot conversations | `/messages` | An LLM writes a synthetic conversation from chosen options (category, language, length). Uses the free Groq quota; output labelled synthetic. |

Rules for every mode:
- One module, one scoring implementation. No mode has its own scoring.
- A scenario's label and expected result are test metadata. They are never sent to the module and never shown as if the module produced them.
- If audio could not be fully analysed, the result says so ("transcript-based" or "limited confidence"). Nothing is faked.
- Everything is visibly marked **synthetic / demonstration**.

## 7. Demo results view and staff dashboards

Every demo case is a normal case inside the module, so it also shows up where it belongs in the existing staff dashboards, with the same server-side role rules: the counsellor queue in risk order with live alerts, the approvals inbox, and after approval the police, welfare and district views (referral only for police and welfare). Demo cases carry a visible "demo" mark.

The results view below is the presenter's quick look at one case.

One consistent view for all four modes, built only from what the module returned:

1. Input summary: mode, simulated source channel, scenario ID, language.
2. Processing timeline: received, validated, transcribed (audio), analysed, done or failed.
3. Transcript or text.
4. Assessment: SVI, band, explanation, overrides fired, limited-confidence flag.
5. Indicators with their evidence: exact quotes for text, time positions for voice.
6. Proposed support and the human-review flag.
7. Technical details: request ID, duration, model and scoring versions, errors.
8. Kept visually apart: **expected** annotations of the scenario, for comparison only.

This view is for presenters and reviewers. A victim-facing screen in an NHAA system must still never show scores, bands or indicators (`CLAUDE.md` rule 1).

## 8. Gaps between the vision and the code

| # | Gap | Smallest fix |
|---|---|---|
| V1 | The integration result has no indicators or evidence. | Add a read endpoint or fields for indicators with evidence, behind a new API scope so each NHAA system only receives what it is authorised to. |
| V2 | The contract is not versioned beyond `/api/v1`, and the request has no explicit input method. | Add an optional `inputMethod` on `/messages` and `/audio` (`TEXT`, `LIVE_AUDIO`, `RECORDED_AUDIO`, `TRANSCRIPT`, `STRUCTURED`), stored beside `modality`; state the contract version in responses. |
| V3 | Demo cases are not marked. | Tag records created by the demo API key on the server (never from the request body), show the mark on staff screens, and let analytics filter them. They stay in the staff queues on purpose (§7). |
| V4 | Recorded audio files are longer than one window. | A server-side step that cuts a file into 5 s windows and feeds them in order. |
| V5 | No scenario text generation. | New, demo-only, on the free Groq quota. |
| V6 | Requirements, plan and frontend brief describe a victim-facing product with a questionnaire. | Rewrite per §11 after the open questions are answered. |
| V7 | Short answers are analysed without their question. | Pass the previous question turn as context to the AI call and add question-aware rules to the safety lexicon (yes/no after a known safety question). |
| V8 | No speaker separation in audio. Call audio holds both voices, so the operator's question ("are you thinking of ending your life?") would be scored as the caller's words and the operator's voice would skew pitch and emotion. | **Required** (decided 16 Nov 2026): label each transcript sentence `OPERATOR` or `CALLER`, score only the caller's words, and take voice features from the caller's segments only (task M.10). Until it is built, every assessment from two-voice audio is marked limited confidence. Where a call centre records agent and caller on separate channels, sending the caller's channel alone avoids the problem. |

## 9. Evaluation and honest claims

- Each scenario has a stable ID and, where practical, a text version and a recorded version, so modes can be compared.
- Expected results are fixed before running and are not edited afterwards to match the output.
- Record speech-to-text errors and missing voice features per run.
- Report sample sizes and limits. A working demo is not proof of clinical validity, production readiness or a live NHAA integration.
- Synthetic material only; nothing from the demo enters a real case workflow.

## 10. Decisions

| # | Decision (16 Nov 2026) |
|---|---|
| Q1 | The question flow and structured answers are removed entirely. Only text and voice are accepted; any questions are asked by NHAA's chatbot or operator inside the conversation (§5). |
| Q2 | Staff dashboards stay. Demo cases flow into them. |
| Q3 | The victim website is deleted. |
| Q4 | No generated audio. Voice input is live microphone or pre-recorded files only. |
| Q5 | The old simulator cases are not brought back. |

## 11. What happens to the existing documents

| Document | Change |
|---|---|
| `CLAUDE.md` | "What this project is" restated as a plug-in module; rules 1–12 stay. |
| `REQUIREMENTS.md` | Scope: module plus integration API. FR-CH (portal, chatbot UI, IVRS page) and FR-SCR rewritten or moved to "demo only / out of scope"; new requirements for the demo modes and the result contract. |
| `ARCHITECTURE.md`, `API_CONTRACTS.md`, `DATABASE.md`, `models.ts` | Integration API becomes the primary interface; add V1–V4. |
| `FRONTEND_UX_PRODUCT_BRIEF.md`, `checklist.md`, `FRONTEND_AUDIT.md` | **Superseded.** They describe a victim-facing website. Phase F stops after F.2. |
| `IMPLEMENTATION_PLAN.md` | New phase for the module contract and the demo input layer, replacing F.3–F.6. |
| `EVALUATION_REPORT.md` | Re-run without question answers; add per-mode comparison. |

## 12. Definition of done

- [ ] The module runs and is tested with the demo pages switched off.
- [ ] Input and output contracts are documented and versioned; source channel and input method are separate.
- [ ] The result contract carries indicators and evidence for authorised callers.
- [ ] No questionnaire is asked by the module or the demo.
- [ ] All four demo modes go through the integration API to the same module.
- [ ] Recorded audio goes through the real audio path.
- [ ] Each demo case appears on the right staff dashboards, marked as demo.
- [ ] The results view shows only real module output, apart from clearly separated expected annotations.
- [ ] Consent, privacy, audit and human-review controls are unchanged.
- [ ] Every document says the module is the product.

> **The module is the product. The input layer is the demonstration.**
