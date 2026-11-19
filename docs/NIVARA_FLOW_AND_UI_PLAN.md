# Nivara: public portal flow and UI plan (Phases N and P)

**Written:** 16 November 2026 (Phase N, built). **Revised:** 17 November 2026 (Phase P, the portal journey).
**Based on:** Anushka's decisions of 16 and 17 Nov 2026 and a read of the repository at commit `633fcc4` (Phase N done, N.1 to N.11).
**Where it wins:** on the website flow, the public pages, the demo layer, languages and the look, this file wins over `PRODUCT_VISION.md`, `CLAUDE.md`, `REQUIREMENTS.md`, `API_CONTRACTS.md`, `ARCHITECTURE.md` and `IMPLEMENTATION_PLAN.md` until task P.1 brings those documents into line. Everything it does not mention stays as it is.

**How to use it:** give Claude Code one task at a time from section 10 ("task P.3"). Do P.1 first, because `CLAUDE.md` tells Claude Code to stop when code and docs disagree. Commits carry no Claude co-author line.

---

## 1. The change in short

Phase N (done) made `/` a public home page with three demo inputs that end in a docket ID, a tracking page, one staff login and the Nivara design. Phase P turns the public side into a **portal journey** that a person would actually walk through, while Nivara stays a plug-in module underneath:

1. The home page has one main action, **Start**. The person goes: Before we begin → Write or speak → Conversation → Review → Registered → Track.
2. In the conversation a **portal assistant** asks scripted, pre-translated questions. Rules choose the next question from what the person has said and what has not been asked yet. The AI never writes or says anything to the person.
3. **Recorded audio is removed** from the public site and from the demo layer. Two inputs remain: write (live text) and speak (live microphone).
4. Every public page shows **NHAA helpline 14566**, **Emergency 112** and a **Quick exit**.
5. The site is **multilingual**: English by default, and choosing a language switches the whole website (public pages, login and staff portals).
6. The theme, colours, fonts and shapes from Phase N stay exactly as they are (section 9).

How it is presented: "This is a reference portal built on Nivara. The same engine plugs into NHAA's helpline, IVRS and chatbot." The public site is still the detachable **demo input layer**: it reaches the module only through the integration API, and the module still runs and is tested with it switched off.

---

## 2. Decisions

### 2.1 Phase N (Anushka, 16 Nov 2026)

| # | Decision | Now |
|---|---|---|
| N-D1 | `/` shows a public home page with a hero. It no longer redirects to `/login`. | In force |
| N-D2 | The navbar carries a **Staff login** button. | In force |
| N-D3 | The demo is **public**: no sign-in needed. | In force |
| N-D4 | The public pages show **nothing** about the assessment: only that the case is registered and its docket ID. | In force (P-D5 adds the person's own words on the Review step) |
| N-D5 | A public **track your case** page shows status plus the support arranged, never the score, band or warning signs. | In force |
| N-D6 | AI-generated conversation removed; three public inputs. | **Changed by P-D3**: two inputs |
| N-D7 | One login page for all staff. The role decides which portal opens. | In force |
| N-D8 | The assessment is shown only in the staff portals, each role seeing what its role allows. | In force |
| N-D9 | The UI is redesigned to look like a real product. | In force (section 9, unchanged) |
| N-D10 | The product name is **Nivara**. | In force |

### 2.2 Phase P (Anushka, 17 Nov 2026)

| # | Decision |
|---|---|
| P-D1 | The public side is a **portal journey** (section 5): Home → Before we begin → Write or speak → Conversation → Review → Registered → Track. It belongs to the demo layer, not to the module. |
| P-D2 | The person chooses **Write or Speak once**, at the start. The interaction's mode is fixed when it is created; switching mid-conversation is not in scope. |
| P-D3 | **Recorded audio is removed** from the public site and the demo layer for now. The inputs are live text and live microphone. |
| P-D4 | A **portal assistant** asks scripted, pre-translated questions. The next one is chosen by rules (the `core/operator/suggest.ts` logic) from what the person has said and what has not been asked yet. No fixed order and no quiz: the person always answers in their own words, can skip any question and can finish at any time. |
| P-D5 | A **Review** step before submitting shows the person their own words and lets them add a correction or a final note. It never shows an AI summary. |
| P-D6 | A header on every public page shows **NHAA helpline 14566** and **Emergency 112** (tap to call), a **Quick exit**, the language switcher and Staff login. |
| P-D7 | **Multilingual:** English by default. The choice is remembered in the browser and switches the **whole website**: public pages, login and staff portals. The conversation's language is taken from it, and follows it when it changes mid-conversation: the assistant's questions already shown are re-worded in the new language and later ones come in it (revised 19 Nov 2026, task P.11). |
| P-D8 | Branding is **Nivara only**. NHAA is the customer; its number appears as "NHAA helpline 14566". |
| P-D9 | Theme, colours, fonts and shapes stay as built in Phase N (section 9). |

---

## 3. Earlier decisions Phase P overrides

Each row is a real clash with something written or built in the repository. All are overridden on purpose.

| Earlier decision | Where it is written or built | New rule |
|---|---|---|
| Three public inputs: text, microphone, recording (N-D6) | `PRODUCT_VISION.md` §6; `API_CONTRACTS.md` §6.5; `/demo/recording`; `components/demo/recorded-audio-demo.tsx`; `/api/demo/interactions/{id}/recording`; `/api/demo/library` | Two inputs. The recording page, route, WAV cutting, upload limit, recordings rate limit and the public library route are removed (§8.1). The module's own audio endpoint is untouched. |
| The hero is a demo starter with three choices | `app/(public)/page.tsx` | One **Start** button; the hero speaks to the person (§6.2). |
| On the text page the visitor types "as the person", taps scripted questions "as the chatbot" and can replay a library conversation | `components/demo/live-text-demo.tsx`; `DemoMessage.sender` | The portal assistant asks the questions itself (P-D4). No question taps, no replay. The public message body loses `sender`, so a visitor can no longer write the assistant's lines (§8.3). |
| Each message or window is only "received"; transcripts never reach the browser | Phase N §6.3; `API_CONTRACTS.md` §6.5 | For Speak, the person's own transcribed words (the caller's words only) go back to the browser that owns the interaction, for the Review step (P-D5). Still never a score, band, indicator or diagnostic wording (rule 1). |
| Suggested questions exist only for the operator console (staff API) | `API_CONTRACTS.md` §5.3; `core/operator/suggest.ts` | The same rules also serve a calling system's chatbot through a new integration endpoint (§8.2). |
| `suggest.ts` keeps the safety questions at the top because it cannot tell which questions were already asked | `suggest.ts` header comment | Operator turns are stored since M.9, so questions already asked in the interaction are skipped (§8.2). |
| Public interface in English only for the first deployment; other languages "switched on later" | Phase N §14; public components with hard-coded English | The language switcher is live on every page and the whole site switches (P-D7, §6.7). |
| A live call with no audio for 20 s counts as over (`LIVE_IDLE_MS = 20_000`) | `core/demo/limits.ts`, `guard.ts` | The person now reads a question between spoken answers, so any activity (audio window, message, next question) keeps the call alive, and the idle limit is 60 s (§7). |
| Public URLs `/demo/text`, `/demo/call`, `/demo/recording` | Phase N §5 | `/start`, `/start/write`, `/start/speak`. The old URLs redirect to `/start`. |
| "If you need help, call 14566" in the footer only | Phase N §6.2 | The numbers are in the header on every public page. The footer keeps the demonstration notice. |

## 4. What does not change

- The module, the scoring, the safety rules and the integration API's existing endpoints. Phase P adds one read-only endpoint (§8.2); nothing existing changes shape.
- All twelve rules in `CLAUDE.md`. In particular: rule 1 (no score, band or indicator on any public screen), rule 2 (the AI never talks to the person: every assistant line is scripted), rule 6 (consent before analysis), rule 8 (police and welfare see referrals only), rule 11 (synthetic data only).
- The demo calls the module only through the integration API with its own demo key, and every case it creates is marked **Demo** on staff screens.
- The tracking page (§6.4), the status endpoint, the login behaviour (§6.5), staff roles, permissions and what each role's API returns (§6.6).
- The safeguards in §7, except the changes listed there.
- Theme, colours, fonts, shapes and motion (section 9).
- Everything stays free. No new paid service and no new npm dependency (`next-intl` is already installed).

---

## 5. Site map and flow

| Route | Who | What it is |
|---|---|---|
| `/` | Public | Home: hero with **Start**, how it works, who sees what you share, the engine behind the portal, track a case |
| `/start` | Public | Steps 1 and 2: Before we begin, then Write or speak |
| `/start/write` | Public | Steps 3 to 5 for writing: conversation, review, registered |
| `/start/speak` | Public | Steps 3 to 5 for speaking |
| `/track` and `/track/<docket>` | Public | Track a case by docket ID (unchanged) |
| `/login` | Staff | The one sign-in page (unchanged, plus the language switcher) |
| `/staff` and the role portals | Staff | Unchanged, plus the language switcher and translated labels |
| `/demo`, `/demo/text`, `/demo/call`, `/demo/recording` | – | Permanent redirect to `/start` |

```text
PUBLIC  (header on every page: NHAA helpline 14566 · Emergency 112 · Quick exit · Language · Staff login)
------
  /  Home
  |-- Start --> /start   1. Before we begin   language · district · consent · "I'd rather talk to someone"
  |                      2. How to share      [ Write ]  [ Speak ]
  |                                |                |
  |                        /start/write      /start/speak
  |                      3. Conversation      scripted assistant questions; the person answers in their own words
  |                                           (emergency options appear at once if the module raises them)
  |                      4. Review            their own words · add a note · Submit
  |                      5. Registered        docket NHAA-2026-MH-004512 · Copy · Track this case
  |                                                   |
  |-- Track a case --> /track/<docket>  <-------------+   status + support arranged
  |
  +-- Staff login --> /login --> /staff --> the role's own portal (the case is already there, marked Demo)
```

Behind the scenes nothing changes in kind: portal page → `/api/demo/*` → integration API with the demo key → module → staff dashboards. The one addition is that `/api/demo` also asks the module for the next scripted question (§8.2, §8.3).

---

## 6. Screen by screen

### 6.1 Header (every public page)

- Left: the Nivara wordmark, linking to `/`.
- Middle: **How it works** (anchor on the home page), **Track a case** (`/track`).
- Right: **NHAA helpline 14566** (`tel:14566`), **Emergency 112** (`tel:112`), the **language switcher** (§6.7), and **Staff login** (or **Open my portal** for a signed-in staff member, linking to `/staff`).
- **Quick exit:** always visible. Pressing it replaces the page with a neutral public site through `location.replace` (so Back does not return to Nivara) and drops the conversation held in memory. The target is a named constant (`QUICK_EXIT_URL`, default `https://www.google.com`).
- On small screens the middle links, the helpline number, the language switcher and Staff login fold into the menu. **Quick exit** and **Emergency 112** always stay visible.

### 6.2 Home page `/`

1. **Hero.** A short label ("Built on Nivara for the NHAA helpline 14566"), a calm headline that speaks to the person (for example "You are not alone. Tell us what happened, in your own words."), and one sentence on what happens next: trained helpline staff read it, and you get a case number to track it. One main button, **Start** (marigold), and a quiet secondary link, **Track a case**. Under them: "Prefer to talk? Call NHAA helpline 14566."
2. **How it works**, written for the person, in three steps: share in your own words, by writing or speaking; you get a case number; trained staff arrange support and you can follow it with the case number.
3. **Who sees what you share.** One plain line per staff role, matching `lib/staff-nav.ts` and the permissions exactly: counsellors and supervisors read what you share; the district officer sees cases from your district; police and welfare officers see only the referral approved for them, never your words; analytics shows only anonymised numbers. This reassures the person and doubles as the presenter's talking points.
4. **The engine behind this portal.** One simple diagram: Portal, Helpline 14566, IVRS, Chatbot and Mobile app all feeding Nivara, which feeds the staff portals. One line: "Nivara is a plug-in module. This portal is one of the ways in." No invented numbers.
5. **Track a case.** A docket ID field that opens `/track/<docket>`.
6. **Footer.** "Demonstration. Do not enter real names, numbers or addresses." The problem statement credit SIH26093, and a **For integrators** link to the existing API documentation at `/api/docs`.

Rules for this page: no score, band, indicator or sample staff screenshot anywhere on it (rule 1). No invented statistics, testimonials or partner logos.

When `DEMO_ENABLED` is not `true`, the home page still renders without **Start** and the track field. It shows the description, the header numbers and Staff login. The module is unaffected (FR-API-05).

### 6.3 The portal journey (`/start`, `/start/write`, `/start/speak`)

A quiet five-step indicator sits at the top: **Before we begin · How to share · Conversation · Review · Registered**. A slim "Demonstration, please don't enter real names, numbers or addresses" notice stays on every step (rule 11).

**Step 1, Before we begin (`/start`).**
- Two or three calm sentences: what they share is read by trained helpline staff to arrange support; they can skip any question or stop at any time; this is not a medical diagnosis.
- **Language:** preselected from the site language. Changing it here changes the site language too (§6.7).
- **Your district:** the seeded districts, default Pune (Phase N §8.4), so the district, police and welfare portals receive the case.
- **Consent:** the existing choices (`components/demo/consent-fields.tsx`), reworded calmly. The voice line says plainly: "If you choose to speak, the tone of your voice (pauses, pitch and pace) is also used to understand how urgent your situation is. Your voice is not recorded or stored."
- Buttons: **Continue**, and **I'd rather talk to someone**, which shows NHAA helpline 14566 and Emergency 112 with tap-to-call.
- Nothing is analysed before consent (rule 6).

**Step 2, How to share.** Two large choices: **Write** and **Speak**. Speak adds: "Uses your microphone. Your voice is not recorded or stored." Choosing one creates the interaction (`POST /api/demo/interactions` with `LIVE_TEXT` or `LIVE_AUDIO`) and opens `/start/write` or `/start/speak`. If the live line is taken: "The line is busy. You can write instead, or try again in a few minutes."

**Step 3, Conversation.**
- The assistant's first line is the scripted opening (new key `operatorQuestions.opening`, for example "You can share only what you feel comfortable sharing. What would you like to tell us?").
- After each of the person's turns, the assistant shows the next question that the relay returns (§8.3). Each question is recorded in the module as an `OPERATOR` turn **by the server** before it is shown, so the answer is read with its question (FR-NLP-11, M.9).
- Under the input: **Skip this question** (asks for the next one; the skipped question stays marked as asked) and **Finish**.
- No quick-reply or Yes/No buttons. The person answers in their own words (`PRODUCT_VISION.md`: no structured answers).
- When there is no next question (everything relevant has been asked, or six assistant questions have been asked), the assistant shows the scripted closing line (`portal.closing`, for example "Thank you. You can add anything else, or press Finish when you are ready.").
- **Emergency:** when a receipt carries `showEmergencyPanel`, the scripted emergency options open at once above the conversation and stay open. The next question is then the safety one, because `suggest.ts` puts it first.
- Assistant lines are labelled as the assistant, never as a person, and never as AI.

*Write (`/start/write`):* a chat window. Enter sends, Shift+Enter makes a new line. 2,000 characters per message and 40 messages per case (unchanged).

*Speak (`/start/speak`):* turn by turn. The question is shown on screen; it is not spoken, because Nivara generates no audio. The person taps the microphone, speaks, then taps **Done**. While speaking, the existing live recorder (`components/audio/live-recorder.tsx`) sends 5-second windows as today, with a timer and the pulsing "listening" ring. After **Done**, the page shows "We heard: …" (the person's own transcribed words) and then the next question. The person may correct a mishearing in the note on the Review step.

**Step 4, Review.**
- Shows the person's own words in order: their messages (Write), or "What we heard" for each answer (Speak). Each assistant question appears above its answer in muted text.
- No AI summary and no interpretation (rules 1 and 2).
- **Something wrong or missing? Add a note:** one text field. It is sent as one more message from the person (`inputMethod: "TEXT"`) before the interaction ends. Earlier turns cannot be edited, because the module analysed them as they arrived; the note is how a correction reaches staff.
- Buttons: **Back to the conversation** and **Submit**. Submit ends the interaction (`POST …/end`).

**Step 5, Registered.** As built in Phase N (`components/demo/registered.tsx`): "Your case is registered", the docket ID as the largest thing on the page, **Copy**, **Track this case**, and **Back to home**.

### 6.4 Track a case `/track/<docket>`

- Input: a docket ID in the form `NHAA-2026-MH-004512` (`DOCKET_PATTERN` in `core/cases/docket.ts`).
- Shows a five-step progress line, mapped from the case status:

| Case status (`CASE_STATUSES`) | Shown to the person as |
|---|---|
| `NEW` | Registered |
| `UNDER_REVIEW` | Being reviewed by helpline staff |
| `ACTION_TAKEN` | Support arranged |
| `FOLLOW_UP_SCHEDULED` | Follow-up planned |
| `CLOSED` | Closed |

- Shows **Support arranged**: one plain line for each recommendation whose status is `APPROVED` or `AUTO_TRIGGERED` (for example "Counselling has been arranged", "Legal aid has been arranged"). Proposed, rejected and superseded ones are not shown.
- Shows the date registered and the date last updated.
- **A new message on a closed case** (doubt D1, answered 19 Nov 2026): the case is **not** reopened automatically and the tracking page still shows Closed. The case appears in the staff's **default queue** (not only under the Closed filter) with a "New message on a closed case" note, so a staff member decides whether to reopen it. The safety check, alerts and the emergency panel run exactly as for any other message.
- Never shows: score, band, urgency, indicators, transcript, staff names, notes, district, or anything diagnostic (rule 1).
- Works only for cases created by the demo key. Any other docket, or a wrong one, gets the same neutral "No demo case found with this number".
- All wording lives in `web/messages/*.json` (project convention for person-facing text). `npm run i18n:check` needs the keys in all five languages; the four non-English versions are drafts that need native review.

### 6.5 Login `/login`

- Behaviour stays as built: e-mail and password, then the 6-digit authenticator code for roles that need it, then `/staff`, which sends the role to its own portal.
- New: restyled (section 9), reachable from the navbar, has a "Back to home" link, and a signed-in visitor who opens `/login` is sent straight to `/staff`.
- Credentials are never shown on any public page. The seeded demo accounts are `<role>@demo.nhaa.test` (for example `counsellor@demo.nhaa.test`); passwords and authenticator links are in `web/.seed-output/`, which is git-ignored.
- **Phase P addition:** the login page carries the language switcher (§6.7), and its labels come from `messages/*.json`.

### 6.6 Staff portals: who lands where and what they see

Already built in `web/src/lib/staff-nav.ts`. No permission changes.

| Role | Lands on | Sees for a filed demo case | Authenticator code |
|---|---|---|---|
| Operator | `/operator` Operator console | The live chat or call while it is happening, with suggested questions | No |
| Counsellor | `/counsellor` Case queue | All cases with the **most urgent first**; opens a case to see the score, band, warning signs with the exact words, and proposed support; approves or rejects in Approvals | No |
| NHAA supervisor | `/counsellor` Case queue | Everything the counsellor sees, plus the operator console | Yes |
| District officer | `/district` District dashboard | Cases of their own district; decides police and protection proposals | No |
| Police liaison | `/police` Action requests | Only the referral sent to police after approval. No narrative, no score (rule 8) | No |
| Welfare officer | `/welfare` Referrals | Only the referral sent to welfare after approval (rule 8) | No |
| State admin, Ministry admin | `/analytics` | Anonymised numbers; demo cases can be filtered in or out | Yes |
| System admin | `/admin` | Users, API keys, scoring settings | Yes |
| Auditor | `/admin/audit` | The audit log | Yes |

The "Demo input layer" entry is removed from the staff sidebar, since the demo now lives on the public site.


### 6.7 Languages (P-D7)

- Languages: English (default), Hindi, Marathi, Tamil and Bengali (`VictimLang`).
- The switcher sits in the public header, on the login page and in the staff top bar. The choice is saved in a cookie (`NEXT_LOCALE`, one year) with **no language prefix in the URL**. `<html lang>` follows it.
- Set-up with the installed `next-intl`: a request config (`src/i18n/request.ts`) that reads the cookie, and `NextIntlClientProvider` in `app/layout.tsx`. `core/i18n/messages.ts` stays as it is for the module's server-side text.
- **Every** person-facing and staff-facing string moves into `messages/*.json` under namespaces (`public.*`, `portal.*`, `login.*`, `staff.*`; the existing `emergency.*`, `operatorQuestions.*` and `track.*` stay). `npm run i18n:check` must pass for all five files. The non-English text is a draft and is listed in `TRANSLATION_REVIEW.md` until a native speaker has checked it.
- **The conversation's language** is the site language when the interaction is created (step 1). **Switching language during the conversation switches the conversation too** (revised 19 Nov 2026, task P.11): the page tells the relay (`POST /api/demo/interactions/{id}/language`), the module stores the interaction's new language (`PUT /integration/…/language`, API_CONTRACTS §6.8), the assistant's questions already shown are replaced by the same scripted questions in the new language, and later questions, the emergency options and the speech-to-text language hint follow it. The person's own words stay as they wrote or said them. The page says so in one short line.
- **Staff portals:** all labels, buttons, band names and empty states switch. Case content (the person's own words, evidence quotes) is always shown as written, with the existing translation beside it where it already exists (AC-LANG-04). Enum values in data are never translated.
- **Fonts:** Hindi, Marathi, Tamil and Bengali use the Noto Sans fonts already loaded. Fraunces has no Indian-script letters, so headlines in those languages fall back to Noto Sans at the same size. Check that they still look right.

---

## 7. Safeguards for a public demo

As built in Phase N (`core/demo/guard.ts`, `public.ts`, `limits.ts`), with these Phase P changes. Starting values; keep them as named constants.

| Safeguard | Rule |
|---|---|
| Kill switch | Unchanged: `DEMO_ENABLED=true` and a valid `DEMO_API_KEY` are required, otherwise every portal page and `/api/demo/*` route answers 404. |
| Per-visitor limits (by IP) | New cases 5 per 10 minutes; messages and next-question requests together 30 per minute; tracking lookups 20 per minute. The recordings limit is removed with recordings. |
| Daily cap | Unchanged: 150 demo cases per day across all visitors. |
| Per-case caps | 40 messages per case; 2,000 characters per message; at most **6 assistant questions** per case; Speak: at most **3 minutes of speech** per case (the sum of the windows sent; `windowIndex` and `startMs` continue across turns), and the whole conversation ends itself after 15 minutes. Upload limits are removed with recordings. |
| Own cases only, same-site only | Unchanged (the `nivara_demo` cookie and the `Origin` check). |
| Nothing leaks | Public responses carry only what the page needs: `{ ok, showEmergencyPanel }`, the emergency options, the **text** of the next assistant question (never its key or the reason it was chosen), for Speak the person's own words for that window, and at the end the docket ID. No module body, case id, request id, timing, dimension, indicator or score. |
| Assistant lines | Only the server records `OPERATOR` turns, and only scripted questions returned by the module. The public message body has no `sender`. |
| Live microphone line | One live call at a time (unchanged). A newcomer sees "line busy" (unchanged). **Changed:** any activity on the call (an audio window, a message, a next-question request) keeps it alive; it counts as over after **60 s** with no activity (`LIVE_IDLE_MS = 60_000`). If an interaction's `updatedAt` does not move on each of these, touch it. A signed-in supervisor can still take the line over. |
| Synthetic data | Unchanged: the notice on every portal step and the footer line. Audio is never stored. PII redaction still runs before any AI call. |
| Bundle check | Public pages must not import staff components or score labels. `npm run security:bundle` must still pass. |

---

## 8. Server and API changes (Phase P)

### 8.1 Remove recorded audio from the demo layer (P-D3)

Delete:
- `app/(public)/demo/recording/` and `components/demo/recorded-audio-demo.tsx`.
- `app/api/demo/interactions/[id]/recording/`.
- `RECORDED_AUDIO` from `DEMO_MODES` and `DEMO_CHANNEL`; `DemoRecordingJson`, `RecordingFields`, `MAX_UPLOAD_BYTES` and `RecordingEvent` in `contracts/demo.ts`; the recordings rate limit; `DEMO_RECORDING_BUDGET_MS`.
- `core/demo/wav.ts`, `app/api/demo/library/`, `core/demo/library.ts` and the build tracing of the demo library (commit `a9e8b03`), **if nothing else uses them** once the pages are gone. Keep anything the evaluation set uses.
- The recording parts of the e2e and unit tests, together with the feature they test.

Keep: the module's own audio endpoint (`POST /integration/…/audio`) with `inputMethod: "RECORDED_AUDIO"` and `MIXED` speaker separation. These are module features that NHAA's own systems can use; only the demo layer stops offering recordings.

### 8.2 New integration endpoint: next question for the calling system's chatbot

`GET /api/v1/integration/interactions/{id}/next-question`, new scope **`questions:read`**, only for interactions that this client created (same ownership check as `core/integration/owned.ts`).

- Returns `{ question: { key, text } | null }`. `key` is an `operatorQuestions.*` key; `text` is its scripted wording in the interaction's language. A real NHAA chatbot could use this as it is.
- Rules, kept in the pure function in `core/operator/suggest.ts` (no database, no clock), extended with:
  - `asked: string[]`: the keys whose scripted text, in the interaction's language, equals an `OPERATOR` turn already stored in this interaction. Asked questions are never suggested again. Update the file's header comment: since M.9 the module can tell what was asked.
  - No turns yet: return `operatorQuestions.opening`.
  - Otherwise: the first suggestion in the existing order (safety first, suicide questions on any sign, then what the evidence points at, then `sayMore`) that has not been asked.
  - After `MAX_CHATBOT_QUESTIONS = 6` scripted questions, or when nothing is left: `null`.
- The endpoint loads the latest dimensions and fired overrides exactly as the staff route `api/v1/staff/interactions/[id]/suggested-questions` does.
- It never returns the staff-facing `reason`, dimensions or anything else. A unit test asserts the exact set of keys.
- Additive change: `X-Contract-Version` becomes `1.3`. The demo key gets `questions:read` (update `scripts/create-api-client.ts --demo`, then re-issue or update the demo client).
- New message key `operatorQuestions.opening` in all five files.

### 8.3 Demo relay changes (`/api/demo/*`)

| Method | Path | Phase P behaviour |
|---|---|---|
| `POST` | `/api/demo/interactions` | `mode` is `LIVE_TEXT` or `LIVE_AUDIO` only. After creating the interaction, the relay reads the opening question (§8.2), records it as an `OPERATOR` turn and returns `201 { interactionId, question: { text } }`. |
| `POST` | `/api/demo/interactions/{id}/messages` | Body `{ text }` only (no `sender`). Response `DemoReceipt = { ok, showEmergencyPanel, emergency, question: { text } \| null }`: after the person's message, the relay reads the next question, records it as an `OPERATOR` turn if there is one, and returns its text. |
| `POST` | `/api/demo/interactions/{id}/audio` | One live window, as today. The response adds `heard`: the person's own words for that window from the module's `transcript` (the caller's words only, may be empty). |
| `POST` | `/api/demo/interactions/{id}/next-question` | New. Used after **Done** in Speak and for **Skip this question**: reads the next question, records it as an `OPERATOR` turn, returns `{ question: { text } \| null }`. |
| `POST` | `/api/demo/interactions/{id}/end` | Unchanged: `200 { docketNumber }`. The Review note is sent through `…/messages` first. |
| `GET` | `/api/demo/track?docket=` | Unchanged. |
| `GET` | `/api/demo/library` | Removed (§8.1). |

To verify while building (stop and ask if either fails): the integration API accepts `OPERATOR` text turns and a `TEXT` message on a `VOICE_CALL` interaction; and the module's `transcript` holds only the caller's words for `CALLER_ONLY` audio.

### 8.4 Pages, components and redirects

- New public routes `app/(public)/start/page.tsx`, `start/write/page.tsx` and `start/speak/page.tsx`. Steps 3 to 5 live in one client page per input, because the conversation is held in memory.
- Reuse and move into `components/portal/`: `consent-fields.tsx`, `emergency-panel.tsx`, `registered.tsx`, `use-demo-case.ts`, and the chat and microphone parts of `live-text-demo.tsx` and `live-call-demo.tsx`. Remove the question taps and the library replay from the text page. Delete what is left unused in `components/demo/`.
- Permanent redirects from `/demo`, `/demo/text`, `/demo/call` and `/demo/recording` to `/start` (`next.config`).
- `web/src/proxy.ts` needs no new entries (it lists staff paths only).

---

## 9. UI redesign

### 9.1 Why the current UI feels plain

Navy on beige with 2 to 4 px corners, one font at one weight range, every screen built from the same bordered white card, and no visual identity beyond a "14566" square. Nothing is wrong, and nothing is memorable.

### 9.2 Direction: "calm instrument"

Nivara is a tool that helps staff decide who to help first. It should look like a well-made instrument: confident type, generous space on the public side, dense and exact on the staff side, and **risk colour as the only loud colour on any staff screen**.

- **Public pages:** a dark hero in deep petrol-black with a warm marigold accent, a serif headline, and the demo card as the one bright object. Below the hero the page turns light and quiet.
- **Staff portals:** light and readable for long sessions, with a dark sidebar. Colour is reserved for risk bands and alerts.

### 9.3 Colour tokens

Rename `navy` to `brand` and `navy-deep` to `brand-deep` across the code in one commit, then set:

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F7F6F2` | Page background |
| `--surface` | `#FFFFFF` | Cards, tables |
| `--surface-2` | `#F1EFE9` | Table headers, quiet panels |
| `--ink` | `#14181F` | Text |
| `--ink-2` | `#4A5361` | Secondary text |
| `--ink-3` | `#646C79` | Hints, captions (darkened from #7A8290 on 19 Nov 2026 to meet WCAG AA 4.5:1 on every background, AC-ACC-01) |
| `--line` | `#E3E0D8` | Borders |
| `--brand` | `#0B5563` | Primary buttons and links (petrol) |
| `--brand-deep` | `#073B46` | Hover, pressed |
| `--brand-soft` | `#E3F0F1` | Selected rows, soft highlights |
| `--night` | `#0C1A1F` | Hero background, staff sidebar |
| `--accent` | `#F2B544` | Marigold. **Public pages only**: the hero's main button and highlights |
| `--danger` | `#B42318` | Errors, destructive actions |
| Focus ring | `#B45309`, 3 px | Unchanged; visible on light and dark |

Risk bands (staff screens only, always colour **and** text, FR-RISK-05):

| Band | Look |
|---|---|
| Critical | Solid `#B42318`, white text |
| High | `#FCE9DD` background, `#7A2E0B` text, `#C4511A` border |
| Moderate | `#FBF1CF` background, `#5C4300` text, `#B7860B` border |
| Low | `#E9ECEF` background, `#3D4753` text, `#B8C0CA` border (neutral, because Low needs no attention) |

Marigold never appears on staff screens, so it can never be mistaken for the Moderate band. The brand colour is petrol, outside the green-amber-red risk range, for the same reason.

### 9.4 Type

All free through `next/font/google`, self-hosted at build time, no new dependency.

| Role | Font | Used for |
|---|---|---|
| Display | **Fraunces** | The wordmark, the hero headline, page titles |
| Interface | **IBM Plex Sans** | Everything else in Latin script |
| Numbers and codes | **IBM Plex Mono** | Docket IDs, the score, times, API paths |
| Indian scripts | Noto Sans Devanagari, Tamil, Bengali (already loaded) | Fallback for hi, mr, ta, bn text |

Sizes: hero headline 56 px desktop and 36 px mobile; page title 28; section title 20; body 16 on public pages and 15 on staff pages; tables 14; captions 13. Numbers in tables use tabular figures.

### 9.5 Shape, depth and motion

- Corners: 8 px on buttons and fields, 12 px on cards, 16 px on the hero's demo card, full pills for tags and band labels.
- Depth: borders by default. One soft shadow, used only for raised things (the hero card, menus, dialogs).
- Spacing: a 4 px base; sections on public pages get generous vertical space, staff tables stay tight.
- Motion: 120 to 180 ms transitions on hover and state changes, one gentle entrance on the hero, a pulsing ring on the microphone while listening. All of it switched off under `prefers-reduced-motion`.
- Icons: `lucide-react` (already installed), one stroke weight, never emoji.

### 9.6 Screens

- **Home:** as in 6.2. Dark hero, then light sections separated by space and a thin rule, not by boxes.
- **Portal journey:** one centred column, the five-step indicator (§6.3), large comfortable controls. The Registered screen makes the docket ID the largest thing on the page. (Phase P: replaces the Phase N "Demo pages" line; nothing else in section 9 changes.)
- **Track:** the progress line is the centrepiece; support lines sit under it with a tick icon.
- **Login:** split layout. Left: dark panel with the wordmark and one line about the product. Right: the form.
- **Staff shell:** dark sidebar with the wordmark, the role name and navigation with icons; a top bar with the page title, the duty toggle and the user menu.
- **Case queue:** a real table. Columns: band, docket (mono), waiting time, main reason, channel icon, assigned to, Demo tag. Critical rows are impossible to miss; Low rows are quiet.
- **Case detail:** header with docket and band; the score as a large mono number on a 0 to 100 bar marked with the band thresholds; warning signs listed with their exact quoted words highlighted in the transcript; proposed support as rows with Approve and Reject.
- **Operator console:** live transcript on the left, suggested questions and the emergency state on the right.
- **Police and welfare queues:** simple referral cards with only what the referral contains.
- **Analytics, admin, audit:** same tables, fields and spacing; charts use the brand colour and the band colours only.
- Every list has a written empty state ("No cases are waiting") and a loading skeleton.

### 9.7 What to avoid (so it does not look machine-made)

- Purple or indigo gradients, glowing blobs, glass blur cards.
- Emoji used as icons; a "✨ AI-powered" pill above the headline.
- Three identical icon cards saying Fast, Secure, Smart.
- Invented numbers, testimonials or logos.
- Everything centred; every block in the same bordered card; a coloured left border on every card.
- Default shadcn look left untouched; more than two font families on a page.
- Inconsistent spacing, or text that overflows on a phone.

### 9.8 Accessibility

`NFR-ACC-01` still applies: WCAG 2.1 AA on staff screens and demo pages. Check contrast for every token pair above (especially text on `--night`, marigold buttons, and the four band labels), keyboard access to every control, and visible focus. Extend `tests/e2e/accessibility.spec.ts` to the home, demo, track and login pages.

---

## 10. Tasks, in order

Each task ends with `npm run typecheck && npm run lint && npm test` passing (and `pytest` when `analysis-service/` changes), as `CLAUDE.md` requires.

### Phase N (done 16 Nov 2026)

- [x] N.1 Docs to the Phase N spec. N.2 Remove generated text. N.3 Case status endpoint. N.4 Public demo API. N.5 Design foundation. N.6 Public shell and home page. N.7 Public demo pages. N.8 Track page. N.9 Login. N.10 Staff portals restyle. N.11 Tests and checks.
- [ ] N.12 Deployment prep: **folded into P.10.**

### Phase P (the portal journey)

- [x] **P.1 Docs to the Phase P spec.** `PRODUCT_VISION.md` (§3 diagram, §6 two public inputs and the portal journey as part of the demo layer, §10 decisions P-D1 to P-D9, the superseded-documents row now says they were deleted on 17 Nov 2026); `CLAUDE.md` (repository layout: `(public)/` home, `start`, `track`; `components/portal/`; `src/i18n/`); `REQUIREMENTS.md` (demo requirements, next question, site-wide languages); `API_CONTRACTS.md` (§6.5 rewritten, new next-question section, §4 matrix with `questions:read`, contract 1.3); `ARCHITECTURE.md` (demo layer); `TOOLS_AND_COSTS.md` if anything there mentions recordings on the public site; `IMPLEMENTATION_PLAN.md` (Phase P with these tasks and a status row; N.12 folded into P.10). *Done when* no document says the public site has three inputs, offers recordings, or is English only.
- [x] **P.2 Remove recorded audio from the demo layer.** §8.1. *Done when* no recording page, route, contract, limit or library route remains in the demo layer, the module's audio endpoint is untouched, and all checks pass.
- [x] **P.3 Next-question endpoint.** §8.2. Unit tests for: the opening question, asked questions skipped, safety first and `safePlace` after "not safe now", suicide questions on any sign, the six-question cap, the exact key set, ownership and scope. OpenAPI entry; contract version 1.3; demo key scope.
- [x] **P.4 Demo relay.** §7 and §8.3: `sender` removed, server-recorded `OPERATOR` turns, the new receipt shape, `heard` for audio, the new `…/next-question` route, the activity-based busy line (60 s) and the speech-time cap. Unit tests for each; verify the two points at the end of §8.3.
- [x] **P.5 Site-wide languages: foundation and public text.** §6.7: request config, cookie, provider, switcher, `<html lang>`; every public, portal and login string moved into `messages/*.json` in all five languages (non-English marked as drafts in `TRANSLATION_REVIEW.md`); the conversation language taken from the site language. *Done when* switching to Hindi changes every public page, the login page and the assistant's questions, and `npm run i18n:check` passes.
- [x] **P.6 Public header and home page.** §6.1 and §6.2: numbers, Quick exit, switcher, the Start hero, the new sections and footer.
- [x] **P.7 Portal journey.** §6.3 and §8.4: `/start`, `/start/write`, `/start/speak`, the five-step indicator, Review with the note, Registered, the redirects, components moved to `components/portal/`.
- [x] **P.8 Staff portals in five languages.** §6.7: the switcher in the staff top bar; every staff label into `staff.*`. Can be split per portal (shell and case queue first, then case detail, operator console, approvals, referrals, district, analytics, admin, audit). No permission or data changes.
- [x] **P.9 Tests and checks.** Rewrite `tests/e2e/demo.spec.ts` and `demo-live.spec.ts` for the portal: write a case signed out (questions appear, skip works, the note is sent, docket shown), track it, sign in as counsellor and find it; speak with the fake microphone; switch to Hindi and check the header, the portal and the questions; Quick exit leaves the site; the old `/demo` URLs redirect. Extend `accessibility.spec.ts` to `/start`, `/start/write` and `/start/speak`. Run `npm run security:bundle` and `npm run i18n:check`.
- [ ] **P.10 Deployment prep.** Section 12.

P.2 to P.4 change the server; P.5 to P.7 give the full public journey; P.8 is the largest task and can wait until the public side is done.

---

## 11. The presentation, step by step

1. Open the site. The home page explains Nivara in one screen; point at the helpline number, 112 and Quick exit in the header.
2. Optional: switch the language to Hindi and back, to show the whole site follows.
3. Press **Start**. Show Before we begin: plain consent, voice analysis explained, "I'd rather talk to someone".
4. Choose **Write**. Answer the assistant in your own words; show that the next question follows what you wrote, and that **Skip** works. Point out that the page never shows a score.
5. Review: show your own words, add a short note, **Submit**. The docket ID appears.
6. Open **Track a case** and show "Registered".
7. Click **Staff login**, sign in as the **counsellor**. The case is in its place in the queue, most urgent first, marked Demo. Open it: score, band, the exact words behind each warning sign, proposed support. Approve a proposal.
8. Sign in as **police liaison** or **welfare officer** (another browser profile): only the referral appears.
9. Sign in as **district officer**: the case appears for its district.
10. Back on **Track a case**: "Support arranged" and what was approved.
11. Speak: file a second case with **Speak**. Have the **operator** console open in a second window to show the call appearing while it happens. Then close with the architecture: "The portal is one way in. The same engine takes NHAA's helpline, IVRS and chatbot."

Keep **Write** as the fallback if the room is noisy or the analysis laptop is not reachable: text cases still register and are scored by the safety rules alone (fallback mode).

---

## 12. First deployment checklist

- [ ] Vercel environment: `DEMO_ENABLED=true`, `DEMO_API_KEY` (a demo client with `status:read` **and `questions:read`**), `REALTIME_DRIVER=pusher` with the Pusher keys, and the existing variables from `CLAUDE.md`.
- [ ] Run `npm run db:indexes` and `npm run seed` against the deployment database. Keep `web/.seed-output/` private.
- [ ] Set up the authenticator app for the supervisor (and any admin role you will show) from the seed output before the presentation.
- [ ] The analysis service runs on a team laptop behind a Cloudflare tunnel. Start it, copy the tunnel URL into `ANALYSIS_URL` and redeploy or update the variable. If the laptop is off, text cases still register in fallback mode; Speak will not work.
- [ ] Rehearse **Speak** on the deployed site in the room you will present in (microphone permission, noise, the one-line rule).
- [ ] Check the language you will present in has been read by a native speaker, or present in English.
- [ ] Try the full presentation in section 11 on the deployed site, on a laptop and on a phone.
- [ ] Confirm the limits in section 7 on the deployed site (hit the rate limit once on purpose).

---

## 13. Open points for Anushka

Work is not blocked: each has a default that the plan uses until you say otherwise.

| # | Question | Default used |
|---|---|---|
| 1 | **Counsellor queue.** Today the counsellor sees **every** case, most urgent first, because a counsellor is the first human to review each case. Keep that, or show only cases where counselling is proposed? | Keep every case, most urgent first. |
| 2 | **Emergency help panel.** The portal shows the scripted emergency options when the module flags immediate danger (the one signal rule 1 allows). Keep it? | Keep it. |
| 3 | **Clearing old demo cases.** A public demo will fill the staff queues. Delete demo cases automatically after 7 days? | Not included. Say yes and it becomes a small extra task. |

## 14. Calls Claude made that you can change

Phase P:
- URLs `/start`, `/start/write`, `/start/speak`; the old `/demo` URLs redirect.
- The opening and closing wording, and the cap of six assistant questions per case.
- Speak is turn by turn (speak, **Done**, next question); questions are shown, not spoken.
- Speak shows "We heard: …" so the person can catch a mishearing; corrections go in the Review note.
- The public message body loses `sender`; only the server records the assistant's questions.
- Busy-line idle limit 60 s on any activity; three minutes of speech and fifteen minutes in all per case.
- Quick exit goes to `https://www.google.com` with `location.replace`.
- The language lives in a cookie, with no language prefix in URLs; the staff portals translate their labels but always show case content as written.
- The library replay and the "ask as the chatbot" taps are gone from the text page.

Still standing from Phase N: district choice with default Pune; the docket ID revealed only at the end; supervisor takeover of the live line; tracking works for demo cases only; the Low band in neutral grey; Fraunces, IBM Plex Sans and IBM Plex Mono with petrol and marigold.
