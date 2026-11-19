# Product Vision and Architecture (updated)
## AI-Based Real-Time Stress and Trauma Assessment Module (SIH26093)

**Status:** updated 16 November 2026 from the team's product vision brief, checked against the repository; **reframed 19 November 2026: Nivara is an integrated portal with the assessment module plugged in**; **amended the same day by `NIVARA_FLOW_AND_UI_PLAN.md` (Phase N) and on 17 November 2026 by its Phase P revision (the portal journey)**, which decides the public site, the portal, languages and the look and wins over this document on those topics. Where this document and an older document disagree about *what the product is*, this one wins. The older documents are brought into line in §11.

---

## 1. The product in one sentence

**Nivara is an integrated portal** for people contacting the National Helpline Against Atrocities, with a **channel-independent assessment module plugged into it**. The public Nivara portal (write or speak, register, track) and the staff portals (operator, counsellor, district, police, welfare, analytics, admin, audit) are one working product; the module inside it analyses what the person said or wrote and returns a structured assessment for authorised human review.

The module stays plug-in: NHAA's existing systems (chatbot, helpline, IVRS, mobile app, operator desk) call the same integration API the Nivara portal uses, so the same engine serves every channel.

**Nivara is the integrated portal; the assessment module is plugged into it and into any NHAA channel.**

## 2. What the product is not

- Not a replacement for NHAA's helpline, IVRS or chatbot. The Nivara portal is one way in; "the same engine plugs into NHAA's helpline, IVRS and chatbot."
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


  NIVARA PORTAL (public, integrated, built on the same integration API)
  Header on every page: NHAA helpline 14566 · Emergency 112 · Quick exit · Language · Staff login
  Home -> Start -> Before we begin (language, district, consent)
       -> How to share: Write | Speak (chosen once)
       -> Conversation: scripted portal-assistant questions, chosen by the
          module's rules (next-question); answers in the person's own words
       -> Review (own words + a note) -> Submit
                              |
                 same integration API, a portal API key
                              |
                    CORE ASSESSMENT MODULE
                              |
          "Case registered" + docket ID -> Track a case (status only)
                              |
                    Staff portals (the assessment)
```

## 4. What already exists in the repository

| Part of the vision | Where it is today | State |
|---|---|---|
| Core assessment logic | `web/src/core/` (`safety-lexicon`, `scoring`, `recommendations`, `pipeline`, `privacy`, `analysis-client`) and `analysis-service/` (Python: speech-to-text, voice features, text analysis) | Built and tested (621 unit tests). No assessment logic lives in UI components. |
| Integration API | `/api/v1/integration/*`: start interaction, `/messages`, `/audio`, `/context`, `/screeners` (to be removed, §5), `/assessment`, `/recommendations`, `/stream` (live updates), `/end`. API keys, scopes, per-key rate limits. | Built and tested (`integration.spec.ts`, `npm run api:example`). **This is the product's front door.** |
| Source channel | `interactions.channel`: `PORTAL`, `CHATBOT`, `VOICE_CALL`, `IVRS`, `MOBILE_APP`, `OPERATOR_ASSISTED`, `API` | Built. No separate portal value yet (§8). |
| Input method | `messages.modality`: `TEXT`, `VOICE_TRANSCRIPT`, `IVR_KEYPRESS` | Built, and already separate from channel. Does not yet tell live audio from recorded audio (§8). |
| Structured output | `GET /integration/…/assessment` returns SVI, band, confidence, limited-confidence flag, explanation, overrides fired, top dimensions | Built, but **does not return indicators with evidence quotes** (only the staff API does). Gap, see §8. |
| Audio path | `/audio` accepts 5-second windows (limit 6 s, 200 KB each): speech-to-text, pauses, pitch, energy, voice emotion, then the transcript goes through the text pipeline | Built for live windows. A whole recorded file must be cut into windows first (§8). |
| Consent, privacy, audit, human approval | Consent state required on integration start; PII redaction; encryption; audit chain; recommendations are proposals | Built. Stays unchanged. |
| Staff dashboards | `(staff)` pages: operator console, counsellor queue and case detail, approvals, district, police, welfare, analytics, admin | Built. **Part of Nivara**: every case appears on the right staff dashboards (§7). |
| Victim-facing website | The old `/portal` pages and keypad page were deleted (M.2). Since Phase N, `/` is a **public home page of the Nivara portal**; Phase P turns it into the portal journey (Start → Before we begin → Write or speak → Conversation → Review → Registered → Track) with two inputs, a tracking page and the staff login button (`NIVARA_FLOW_AND_UI_PLAN.md` §5–§6). | Phase N public site built (N.6–N.9); the Phase P portal journey is planned (P.2–P.9). It belongs to the portal; the module still has no victim website. |

## 5. Two inputs only: text and voice. No quiz, no structured answers

**Decided 16 Nov 2026.** A person communicates with NHAA in one of two ways, and the module accepts exactly those two:

- **Text:** the messages of a chat. If safety or wellbeing questions are asked, NHAA's chatbot asks them inside the chat, and the answers arrive as ordinary messages.
- **Voice:** the audio of a call. If those questions are asked, the helpline operator asks them aloud, and the answers arrive as ordinary speech.

There is no third input. The module never asks questions, has no questionnaire, and has no endpoint for structured answers or key presses.

**Phase P (17 Nov 2026):** the module can *suggest* the next scripted question to a calling system's chatbot (`GET /integration/interactions/{id}/next-question`, scope `questions:read`), using the same rules as the operator console's suggested questions. The calling system decides whether to ask it; the module still never talks to the person (rule 2), there is no fixed order and no quiz, the person answers in their own words, and any question can be skipped.

**What is removed:** the question flow and screeners (`core/conversation`, `core/screeners`), the `/screeners` endpoints on the victim and integration APIs, the `SCREENER` signal source and its 30% source weight, the `IVR_KEYPRESS` modality, and the keypad page.

**What this requires of the module:**
1. **Answers must be read with their question.** "No" means nothing alone; after "Are you safe right now?" it is a safety signal. The module needs the preceding question (the chatbot's or operator's turn) as context for both the AI analysis and the safety rules. Today the safety lexicon reads one message at a time, so short answers are a gap (V7).
2. **The questioner's words must not be scored as the person's.** In chat this is already handled (`sender: OPERATOR` vs `VICTIM`). Call audio contains both voices (operator and caller), so **speaker separation is required**: each transcript sentence is labelled `OPERATOR` or `CALLER`, only the caller's words are scored, and voice features are taken from the caller's segments only. It is not built yet; **until it is, any assessment from two-voice audio must be marked limited confidence** (V8, task M.10, FR-VOI-10).

**Decided 16 Nov 2026:** there is no quiz inside the module, and inputs stay text and voice only, but where NHAA's chatbot or operator asks safety or wellbeing (PHQ-2, GAD-2, PC-PTSD-5) questions in the conversation, the person's answers are scored, read with the question just before them (task M.9).

**Trade-offs accepted:** risk the person never puts into words is not detected; the safety overrides for "not safe now", "accused nearby" and "suicidal intent" fire only from what is said or from case details; low mood, anxiety and trauma rest on language and voice alone; scores and confidence will drop and must be re-measured (`EVALUATION_REPORT.md`), with scenarios that relied on answers rewritten as conversations.

**OPEN:** whether case details that NHAA's record already holds (offence type, age group) may still be sent as metadata. They are not something the person communicates, and two safety overrides depend on them (§10).

## 6. The Nivara portal

The **public** side of Nivara (no sign-in; `NIVARA_FLOW_AND_UI_PLAN.md` §5–§7): "The same engine plugs into NHAA's helpline, IVRS and chatbot." It has **two inputs**, chosen once at the start of the portal journey. These are portal features, not module features: the module only sees API calls. Audio is never generated; voice comes from the live microphone only. The portal calls the module **only through the integration API** with its own portal API key, exactly as any NHAA system does, so the module keeps working on its own when the portal is switched off (`PORTAL_ENABLED`). The generated-text mode was removed in Phase N (N-D6); recorded audio was removed from the public site and the portal in Phase P (P-D3). The module's own `/audio` endpoint still accepts recorded audio (`inputMethod: RECORDED_AUDIO`) from NHAA's systems.

| # | Input | Represents | Data path | Page |
|---|---|---|---|---|
| 1 | **Write** (live text) | Chatbot | `/messages`, one message at a time | `/start/write`: a chat window |
| 2 | **Speak** (live microphone) | Helpline call | `/audio`, 5 s windows, caller's voice only | `/start/speak`: turn by turn (speak, **Done**, next question). Free-tier limit: one live call at a time. |

**The portal journey (P-D1):** Home → **Before we begin** (language, district, consent, "I'd rather talk to someone") → **How to share** (Write or Speak, chosen once, P-D2) → **Conversation** → **Review** → **Registered** (docket ID) → **Track**.
- In the conversation a **portal assistant** asks scripted, pre-translated questions (`operatorQuestions.*`). The next one comes from the module's next-question rules (§5): no fixed order, no quiz, no Yes/No buttons; the person answers in their own words, can skip any question and can finish at any time (P-D4). Each question is recorded in the module as an `OPERATOR` turn **by the server**, so the answer is read with its question; a visitor can never send `OPERATOR` turns. The AI never writes or says anything to the person (rule 2).
- **Review** shows the person their own words (for Speak, "what we heard": their own transcribed words, the caller's words only) and lets them add one note, sent as one more message. Never an AI summary (P-D5).
- A header on every public page shows **NHAA helpline 14566**, **Emergency 112**, a **Quick exit**, the language switcher and Staff login (P-D6).
- **Languages (P-D7):** English by default; the choice switches the whole website (public pages, login and staff portals) and sets the conversation's language, also when it is changed mid-conversation (the assistant's questions switch with it).

Rules for every input:
- One module, one scoring implementation. No mode has its own scoring.
- A scenario's label and expected result are test metadata. They are never sent to the module and never shown as if the module produced them.
- A portal page shows **nothing about the assessment**: only the assistant's scripted questions, the person's own words (Review, and "We heard" for Speak), the scripted emergency options when the module raises them (the one allowed risk signal, rule 1), and at the end "your case is registered" with the docket ID. A public **track a case** page shows the case status and the support arranged, through `GET /integration/cases/{docket}/status`.
- Public safeguards (plan §7): kill switch, same-site posts only, per-visitor and daily limits, per-case caps (40 messages, six assistant questions, three minutes of speech, fifteen minutes in all), a signed cookie so a browser reaches only its own cases, trimmed responses, no `sender` in the public message body, one live call at a time with a "line busy" message (over after 60 s with no activity).

## 7. Staff dashboards

Every portal case is a normal case inside the module, so it also shows up where it belongs in the existing staff dashboards, with the same server-side role rules: the counsellor queue in risk order with live alerts, the approvals inbox, and after approval the police, welfare and district views (referral only for police and welfare). Portal cases are tagged on the server (`isPortal`) so analytics can tell them apart from other channels; staff screens show them like any other case.

**There is no separate results view (decision N-D4).** The staff case screens are the only place results appear: a person files a case on the public portal, and a counsellor sees the score, band, warning signs with their exact words, and the proposed support. A victim-facing screen, the portal pages included, never shows scores, bands or indicators (`CLAUDE.md` rule 1). Scenario `expected` labels stay on the server as test metadata.

## 8. Gaps between the vision and the code

| # | Gap | Smallest fix |
|---|---|---|
| V1 | The integration result has no indicators or evidence. | Add a read endpoint or fields for indicators with evidence, behind a new API scope so each NHAA system only receives what it is authorised to. |
| V2 | The contract is not versioned beyond `/api/v1`, and the request has no explicit input method. | Add an optional `inputMethod` on `/messages` and `/audio` (`TEXT`, `LIVE_AUDIO`, `RECORDED_AUDIO`, `TRANSCRIPT`, `STRUCTURED`), stored beside `modality`; state the contract version in responses. |
| V3 | Portal cases cannot be told apart from other channels. | Tag records created by the portal API key on the server (never from the request body) and let analytics filter them. They stay in the staff queues like every case (§7). |
| V4 | Recorded audio files are longer than one window. | A server-side step that cuts a file into 5 s windows and feeds them in order. *Built in M.8; removed from the portal in Phase P (P-D3). NHAA's systems still send recorded audio as windows to `/audio`.* |
| V5 | No scenario text generation. | Removed in Phase N (N-D6). |
| V6 | Requirements, plan and frontend brief describe a victim-facing product with a questionnaire. | Rewrite per §11 after the open questions are answered. |
| V7 | Short answers are analysed without their question. | Pass the previous question turn as context to the AI call and add question-aware rules to the safety lexicon (yes/no after a known safety question). |
| V8 | No speaker separation in audio. Call audio holds both voices, so the operator's question ("are you thinking of ending your life?") would be scored as the caller's words and the operator's voice would skew pitch and emotion. | **Required** (decided 16 Nov 2026): label each transcript sentence `OPERATOR` or `CALLER`, score only the caller's words, and take voice features from the caller's segments only (task M.10). Until it is built, every assessment from two-voice audio is marked limited confidence. Where a call centre records agent and caller on separate channels, sending the caller's channel alone avoids the problem. |

## 9. Evaluation and honest claims

- Each scenario has a stable ID and, where practical, a text version and a recorded version, so modes can be compared.
- Expected results are fixed before running and are not edited afterwards to match the output.
- Record speech-to-text errors and missing voice features per run.
- Report sample sizes and limits. A working portal is not proof of clinical validity.
- Evaluation scenarios are synthetic and stay on the server as test metadata.

## 10. Decisions

| # | Decision (16 Nov 2026) |
|---|---|
| Q1 | The question flow and structured answers are removed entirely. Only text and voice are accepted; any questions are asked by NHAA's chatbot or operator inside the conversation (§5). |
| Q2 | Staff dashboards stay. portal cases flow into them. |
| Q3 | The victim website is deleted. |
| Q4 | No generated audio. The module's voice input is live or pre-recorded audio from NHAA's systems; since Phase P (P-D3) the portal offers the live microphone only. |
| Q5 | The old simulator cases are not brought back. |
| N-D1…N-D10 | **Phase N (16 Nov 2026, `NIVARA_FLOW_AND_UI_PLAN.md` §2):** `/` is a public home page with the portal's Start in the hero; a Staff login button in the navbar; the portal is public, shows no result and ends with a docket ID; a public tracking page shows status and support arranged; three portal inputs (generated text removed; **changed by P-D3 to two**); one login page, a portal per role; the assessment is shown only in the staff portals; the UI is redesigned; the product is named **Nivara**. |
| P-D1…P-D9 | **Phase P (17 Nov 2026, `NIVARA_FLOW_AND_UI_PLAN.md` §2.2):** the public side is a **portal journey** (Home → Before we begin → Write or speak → Conversation → Review → Registered → Track) belonging to the portal; Write or Speak is chosen once; **recorded audio is removed** from the public site and the portal (two inputs); a **portal assistant** asks scripted, pre-translated questions chosen by rules, answered in the person's own words and skippable; a **Review** step shows the person's own words and takes a note, never an AI summary; every public page shows **NHAA helpline 14566**, **Emergency 112** and a **Quick exit**; the site is **multilingual**, English by default, and the choice switches the whole website including the staff portals; branding is Nivara only; theme, colours, fonts and shapes stay as in Phase N. |

## 11. What happens to the existing documents

| Document | Change |
|---|---|
| `CLAUDE.md` | "What this project is" restated as a plug-in module; rules 1–12 stay. |
| `REQUIREMENTS.md` | Scope: module plus integration API. FR-CH (portal, chatbot UI, IVRS page) and FR-SCR rewritten or moved to "portal only / out of scope"; new requirements for the portal input modes and the result contract. |
| `ARCHITECTURE.md`, `API_CONTRACTS.md`, `DATABASE.md`, `models.ts` | Integration API becomes the primary interface; add V1–V4. |
| `FRONTEND_UX_PRODUCT_BRIEF.md`, `checklist.md`, `FRONTEND_AUDIT.md` | **Superseded and deleted (17 Nov 2026).** They described a victim-facing website; Phase F stopped after F.2. Git history keeps them. |
| `IMPLEMENTATION_PLAN.md` | New phase for the module contract and the Nivara portal, replacing F.3–F.6. |
| `EVALUATION_REPORT.md` | Re-run without question answers; add per-mode comparison. |

## 12. Definition of done

- [ ] The module runs and is tested with the portal pages switched off.
- [ ] Input and output contracts are documented and versioned; source channel and input method are separate.
- [ ] The result contract carries indicators and evidence for authorised callers.
- [ ] No questionnaire is asked by the module or the portal. The portal assistant's questions are scripted, chosen by rules, skippable and answered in the person's own words.
- [ ] Both public inputs (Write and Speak) go through the integration API to the same module, from the portal journey.
- [ ] Recorded audio from NHAA's systems goes through the real audio path (the portal no longer offers recordings).
- [ ] Each portal case appears on the right staff dashboards.
- [ ] A portal page shows nothing about the assessment; a visitor gets a docket ID and can track the case status.
- [ ] The whole website, staff portals included, switches language; English is the default.
- [ ] Consent, privacy, audit and human-review controls are unchanged.
- [ ] Every document describes Nivara as an integrated portal with the module plugged in.

> **Nivara is the integrated portal. The assessment module is plugged into it.**
