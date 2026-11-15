> **Superseded (16 Nov 2026).** This document describes a victim-facing website with a question flow. The product is now a plug-in assessment module with two inputs (text and voice) and no victim website or questionnaire: see `docs/PRODUCT_VISION.md`. Phase F stopped after F.2, and the F.2 homepage was removed in Phase M. Kept for history only; do not build from it.

# Frontend Audit (Phase F, task F.0)
## AI-Based Real-Time Stress and Trauma Assessment Module (SIH26093)

Checklist step 0 (`docs/checklist.md` §0), written 15 November 2026 against the working tree on `feature/simulator`, after the simulator was removed (task F.1). Companion: `docs/FRONTEND_UX_PRODUCT_BRIEF.md`. No victim UI code was changed for this audit.

---

## 1. Route inventory

### Public and victim
| Route | File | What it does today |
|---|---|---|
| `/` | `app/page.tsx` | **Interim:** re-exports the `/portal` language choice. To be replaced by the homepage (F.2). |
| `/portal` | `app/portal/page.tsx` | Language choice: five buttons, each in its own script, plus "Staff sign in". |
| `/portal/[locale]` | `app/portal/[locale]/page.tsx` → `StartScreen` | Welcome, AI disclosure, Listen button, **Start** (creates the interaction), link to the keypad (IVRS) menu. |
| `/portal/[locale]/consent?i=` | `ConsentScreen` | Consent notice (six paragraphs, Listen button) and five checkboxes, then Continue. |
| `/portal/[locale]/chat?i=` | `ChatScreen` | The whole conversation: safety check, context form, story (typing or "speak instead"), screeners, closing screen with the docket number. |
| `/portal/[locale]/ivrs` | `IvrsScreen` | Keypad-only menu with spoken prompts (task 7.8). |
| `/<locale>/…` | `next.config.ts` redirects | Old links go to `/portal/<locale>/…` (temporary redirects). |
| `/offline.html` | `public/offline.html` | Offline notice with helpline numbers (service worker). |

Shared victim layout (`app/portal/[locale]/layout.tsx`): header with "14566" mark and helpline name, **Quick exit** on every screen, footer with 112 / Tele-MANAS 14416 / NHAA 14566 as `tel:` links.

### Staff (separate, unchanged)
`/login` (password + TOTP), `(staff)` group: `/staff`, `/operator`, `/counsellor`, `/counsellor/case/[id]`, `/approvals`, `/district`, `/police`, `/welfare`, `/analytics`, `/admin`, `/admin/audit`. All behind Auth.js and `core/policies`. No staff page or data is reachable from a public route (route-guard unit test covers 75 API routes).

## 2. Component inventory (victim)

| Component | Lines | Reusable for the new design? |
|---|---|---|
| `start-screen.tsx` | 56 | Yes: creating the interaction (`POST /interactions`). Copy and layout will change. |
| `consent-screen.tsx` | 76 | Yes: real granular consent call. Needs: no `audioRetention` option (see §5), a clear "continue without analysis". |
| `chat-screen.tsx` | 293 | Core of the flow: renders whatever prompt the server sends (`YES_NO`, `SCALE_0_3`, `FREE_TEXT`, `CONTEXT_FORM`, `NONE`), skip, emergency panel, language switch, withdraw consent, done view. Will host the input-method choice at the story step. |
| `voice-recorder.tsx` | 249 | **Live** voice: 5 s windows uploaded as they are recorded, transcript lines shown, mute/stop, fallback to typing. No playback or review. Keep as "live voice"; a voice-note mode needs new client work (§6). |
| `context-form.tsx` | 90 | Yes: the optional context fields, all skippable, no caste/community field. |
| `emergency-panel.tsx` | 82 | Yes: numbers + "Call me back now" (real endpoint, phone goes to the PII vault). |
| `quick-exit.tsx` | 46 | Yes: hides the page, ends the session with `sendBeacon`, `location.replace` to a neutral site. |
| `listen-button.tsx` | 56 | Yes: browser speech for any text (consent audio stand-in). |
| `ivrs-screen.tsx` | 242 | Keep as is (keypad channel). |
| `components/ui/button.tsx`, `.btn*` / `.field` / `.link` classes in `globals.css` | — | Shared button and field styles (navy theme, square corners). |

## 3. Existing flow (server-driven)

`core/conversation/flow.ts` is the only state machine. It is pure and the UI never decides the next step; it asks `GET /next` or uses the prompt returned by each POST.

```
CONSENT → SAFETY_CHECK (4 items, every mode) → CONTEXT (one optional form)
  → NARRATIVE (up to 3 turns: "tell us…", then "anything else?")
  → SCREENERS (only with analysis consent; C-SSRS first if a suicide signal was seen)
  → CLOSE
```
State lives in `interactions.flowState`; a page reload resumes from `GET /next` while the 2-hour session cookie is valid. Skipped answers are stored as `null`, separate from "No" (0).

## 4. Victim endpoints actually used by the UI

`POST /interactions` · `POST /{id}/consent` · `POST /{id}/consent/withdraw` · `GET /{id}/next` · `POST /{id}/messages` · `POST /{id}/screeners` · `PUT /{id}/context` · `POST /{id}/language` · `POST /{id}/audio` · `POST /{id}/callback-request` · `POST /{id}/end`. Not used by the UI: `GET /consent-notices/{version}` (the notice text comes from `messages/*.json`).

## 5. Gaps between docs, brief and code

| # | Gap | Where | Suggested fix |
|---|---|---|---|
| G1 | The browser portal creates every interaction as **`CHATBOT`** (`StartRequest` default). The brief wants the portal to be `PORTAL`. | `start-screen.tsx`, `contracts/victim.ts` | Send `PORTAL` from the portal start (the enum already allows it); IVRS keeps `IVRS`. No contract change. |
| G2 | Consent offers **"Keep my voice recordings"** (`audioRetention`), but audio storage was never built (task 7.9), so the choice does nothing. The brief says ask only if retention is supported. | `consent-screen.tsx`, `core/victim/service.ts` | Hide the option in the UI and always send `false` until 7.9 exists. |
| G3 | Closing text says **"Your complaint is registered"**. The module is not the official grievance system, and the brief says not to claim a filed complaint. | `messages/*.json` (`done.closing`) | Change to "Your information has been received…" in all five languages (needs native review). |
| G4 | Code has fields the API doc does not list: `skipped` and `voiceDone` on `POST /messages`, `analysed` in the audio reply, `CONTEXT_FORM` prompt input, `intro` on prompts. | `contracts/victim.ts` vs `API_CONTRACTS.md` §3 | **Decide which is right** (CLAUDE.md): most likely add them to `API_CONTRACTS.md`. |
| G5 | No "how do you want to share" choice: the story step offers typing plus a "speak instead" recorder. "Guided questions" has no separate meaning today (the whole flow is already one question at a time). | `chat-screen.tsx` | See decision Q1. |
| G6 | No review step. Messages are append-only and each one is scored when sent (so the emergency panel can appear at once). Holding the story back for editing would delay the safety check. | `DATABASE.md` §1, pipeline | See decision Q3. |
| G7 | Voice note with playback is not possible with the current recorder, and there is no endpoint to correct a transcript. | `voice-recorder.tsx`, API §3.7 | See decision Q2. |
| G8 | Theme: the current design (commit `4eb2d91`) is navy on warm paper with square corners for every screen. The brief proposes "Quiet Paper" with a teal primary and soft corners for victim screens only. | `globals.css` | See decision Q4. |
| G9 | Audio chunks: the brief notes "5 s windows" vs "≤ 6 s". **No conflict:** the recorder sends 5 s windows; the server accepts up to 6 s / 200 KB for slack. | — | Keep. |
| G10 | `inputMethod` field (brief §4.3) does not exist, and is not needed: provenance is already stored as `messages.modality` (`TEXT`, `VOICE_TRANSCRIPT`, `IVR_KEYPRESS`) plus `screenerResponses` with item codes. | `models/message.ts` | Do not add a field. |

## 6. Answers to the brief's open questions (§12)

| # | Question | Answer from the code |
|---|---|---|
| 1 | Secure save/resume? | Same browser only: reload resumes via `GET /next` within the 2 h session. No cross-device resume, so the UI must not say "saved". |
| 2 | Human callback end to end? | Yes: `POST /callback-request` stores the phone in the PII vault and raises or updates a Critical alert. It is offered inside the emergency panel. |
| 3 | Voice note and live voice today? | Live voice only (5 s windows sent while speaking). No voice note with playback. |
| 4 | Audio chunk contract? | 5 s windows sent; server limit ≤ 6 s and ≤ 200 KB (G9). |
| 5 | Review / confirmation endpoint? | No review endpoint. Confirmation is `POST /end` → docket number, closing message, track text. |
| 6 | Attach to an existing docket? | The API accepts `docketNumber` on start with format check only, no verification. Not in the UI; keep it out until verification is designed. |
| 7 | Approved emergency wording? | Current copy is in `messages/*.json` (`emergency.*`), drafts. Production approval is a team task. |
| 8 | Consent audio recorded? | No: browser speech (`ListenButton`) is used in all five languages. |
| 9 | Reusable routes and components? | All of §2; the state machine stays in `core/conversation/flow.ts`. |
| 10 | `inputMethod` in models? | No, and not needed (G10). |

## 7. Proposed minimal changes (for F.2 onwards)

1. **`/` homepage** (server component, no session, no data): header (wordmark, language selector, How it works, Privacy, quiet Staff sign-in), hero with one **Start**, the three cards Write / Speak / Guided questions, a calm "I need urgent help" section reusing the `emergency.*` copy and the three numbers, a three-step "how it works", a privacy strip and footer. Start and each card lead to `/portal/<lang>` (create interaction → consent → safety check). The chosen method travels as a non-sensitive hint (for example `?way=write|speak|guided`) that only decides which control the story step opens with.
2. **`/portal`** language page: redirect to `/` once the homepage has the language selector.
3. **Story step:** method choice rendered by `chat-screen.tsx` when the server sends the `FREE_TEXT` narrative prompt. No new state machine and no backend change.
4. **Fix G1–G3** as small, separate commits.
5. **No API or data-model changes** in F.2–F.3. F.4–F.5 may need small additive contract changes, depending on Q2 and Q3.

## 8. Decisions needed before F.2–F.5

- **Q1. What does "Guided questions" mean?** (a) Skip the free story and go straight to the screeners and context. (b) The same flow as today, but the story is replaced by a few short scripted prompts (new i18n keys, team-written). (c) Drop the card and offer only Write and Speak. The brief needs one of these; (a) needs no new wording.
- **Q2. Voice note.** (a) Record locally in 5 s windows, play back in the browser, and upload only on "Send" (no contract change; raw audio only in browser memory). (b) Keep live voice only.
- **Q3. Review step.** (a) Review shows what was sent; corrections are added as a new message ("add or correct something"); the safety check stays immediate. (b) Hold the story in the browser until review, then send. This delays the lexicon and emergency panel, which works against "safety before completeness".
- **Q4. Theme.** Teal "Quiet Paper" for victim screens only (staff keep navy), or keep one navy theme everywhere.

## 9. Test baseline (15 November 2026)

Run on a Linux copy of the working tree (your `node_modules` are for Windows):

| Check | Result |
|---|---|
| `npm run typecheck` | ✓ pass |
| `npm run lint` | ✓ pass |
| `npm test` | ✓ 22 files, **621 tests** pass |
| `npm run build` | not run here: no access to Google Fonts from the test machine |
| `npm run e2e` | not run here: needs Atlas and the dev server. 12 spec files; victim journeys are covered by `victim`, `languages`, `accessibility`, `ivrs`, `voice`, `pwa` |

Simulator tests removed with the simulator: `tests/unit/simulator-cases.test.ts` (19 tests) and `tests/e2e/sim-home.spec.ts`.
