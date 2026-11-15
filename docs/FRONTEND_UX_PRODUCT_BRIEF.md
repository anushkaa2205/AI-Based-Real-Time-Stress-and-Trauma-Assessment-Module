> **Superseded (16 Nov 2026).** This document describes a victim-facing website with a question flow. The product is now a plug-in assessment module with two inputs (text and voice) and no victim website or questionnaire: see `docs/PRODUCT_VISION.md`. Phase F stopped after F.2, and the F.2 homepage was removed in Phase M. Kept for history only; do not build from it.

# Frontend UX & Product Brief

## Victim-facing homepage, intake journey and unified input layer

**Project:** AI-Based Real-Time Stress and Trauma Assessment Module
(SIH26093)\
**Audience:** Claude Code / frontend implementation\
**Status:** Implementation brief based on the current project
documentation, with proposed UX decisions clearly marked.\
**Primary objective:** Replace the simulator-first public homepage with
a calm, accessible victim-facing entry point and make text, voice and
guided intake feel like one coherent experience.

------------------------------------------------------------------------

## 0. Instructions to Claude Code --- read before changing anything

1.  Read `CLAUDE.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`,
    `API_CONTRACTS.md`, `DATABASE.md`, `models.ts`, `PRIVACY_REVIEW.md`,
    `EVALUATION_REPORT.md` and `IMPLEMENTATION_PLAN.md` before editing.
2.  Inspect the actual repository and current UI. Do not assume the
    documentation perfectly matches the code.
3.  **Do not rewrite the assessment engine, scoring engine, consent
    logic, privacy controls, staff dashboards or API contracts just to
    make the UI easier.** Reuse existing contracts and components
    wherever possible.
4.  Do not invent endpoints. If the UI needs data that the current API
    does not provide, document the gap and propose the smallest additive
    contract change.
5.  Do not change SVI weights, thresholds, safety overrides, model
    prompts or screening wording as part of a visual redesign.
6.  The victim must never see SVI, risk bands, indicator names, AI
    diagnoses or internal analysis. The victim-facing API must continue
    to return only safe, approved fields such as the emergency panel.
7.  The AI must not converse freely with the victim. Use the existing
    scripted, pre-translated prompts and approved copy. AI is for
    analysis, not for generating victim-facing advice.
8.  Never use real victim data in screenshots, fixtures, stories or
    demos. Use synthetic data only.
9.  Preserve keyboard accessibility, reduced-motion support, language
    support and server-side role-based access controls.
10. Implement in small phases. After each phase run type-check, lint,
    unit tests and relevant Playwright tests. Do not mark a task done
    merely because a page renders.

### Source-of-truth hierarchy

-   Existing functional and ethical requirements in `REQUIREMENTS.md`
    remain authoritative.
-   Existing API shapes and Zod contracts in `API_CONTRACTS.md` remain
    authoritative.
-   Existing privacy guarantees in `PRIVACY_REVIEW.md` must not regress.
-   Existing scoring and evaluation findings in `EVALUATION_REPORT.md`
    are constraints, not permission to change the model during frontend
    work.
-   This document proposes presentation and interaction decisions where
    the source documents leave UI details open. Those proposals must not
    silently override a requirement.

------------------------------------------------------------------------

## 1. Product direction

### 1.1 What this website is

This is the public-facing intake experience for a first-contact stress
and trauma assessment module used alongside NHAA (14566) and its
existing complaint/grievance process. It is not a replacement for NHAA
and must not imply that submitting this intake is itself a completed
police complaint, FIR, legal filing or emergency dispatch.

The primary user may be frightened, distressed, using a shared phone,
unfamiliar with forms, have limited connectivity, or be unable to type a
long narrative. The interface must help them communicate with as little
effort and repetition as possible.

### 1.2 Product principles

1.  **Safety before completeness.** Ask whether the person is safe
    before asking for a long account.
2.  **Choice without confusion.** Offer a small number of clear ways to
    communicate; do not make the user understand technical channel
    names.
3.  **One account, not repeated retelling.** Reuse the information
    already supplied throughout the session and for authorised
    responders.
4.  **Consent is real.** Explain analysis and sharing separately;
    declining analysis must not block the complaint path or safety
    check.
5.  **Human support remains central.** Make it easy to ask for a human.
    Automated analysis is decision support, not a diagnosis or final
    decision.
6.  **No judgement.** Avoid language that blames, pressures,
    interrogates or assumes gender, relationship, caste identity or the
    details of an incident.
7.  **Progressive disclosure.** Show only the question or decision
    needed now. Keep optional context optional.
8.  **Privacy in the interface.** Avoid exposing sensitive details in
    notifications, page titles, browser previews or cached content.
9.  **Predictable, not theatrical.** No chatbot theatrics, typing
    bubbles implying a human, emotional animations, AI avatars or
    dramatic risk visualisations.
10. **Accessible by default.** Plain language, large tap targets,
    readable typography, keyboard and screen-reader support, language
    selection and audio playback for consent/prompts.

### 1.3 What success looks like

A first-time visitor should be able to: - understand what the service
does and does not do; - choose a language; - understand the
privacy/consent choices before analysis; - get to an immediate safety
check quickly; - choose to type, record a voice note, use a guided flow,
or request human help; - pause, skip optional questions, resume where
safely supported, or leave quickly; - review and correct what they
submitted; - receive a clear confirmation and next-step explanation
without seeing internal risk scores.

------------------------------------------------------------------------

## 2. Replace the simulator-first homepage

### 2.1 New route intent

  -----------------------------------------------------------------------
  Route                               New purpose
  ----------------------------------- -----------------------------------
  `/`                                 Public victim-facing homepage and
                                      safe entry point

  `/start`                            Language / intake entry, if a
                                      separate route is useful

  `/portal`                           Existing victim intake flow; retain
                                      or refactor rather than duplicate

  `/portal/consent`                   Consent step, if current routing
                                      uses a separate page

  `/portal/safety`                    Immediate safety check

  `/portal/intake`                    Unified text / voice / guided input
                                      workspace

  `/portal/review`                    Review, edit and confirm supplied
                                      information

  `/portal/confirmation`              Submission confirmation and next
                                      steps

  Existing staff routes               Keep staff login and role-specific
                                      dashboards separate

  `/demo` or internal demo route      Optional staff-only synthetic
                                      demonstration; not the public
                                      landing page
  -----------------------------------------------------------------------

**Important:** This is a proposed route map, not an instruction to
create every route literally. First inspect the current App Router
structure. Reuse existing routes and state machine where practical. Do
not create duplicate pages for the same state.

### 2.2 Homepage layout --- desktop

The homepage should feel calm, trustworthy and human. It should not look
like a startup landing page, a government statistics dashboard or a
chatbot marketing page.

#### A. Header

-   Left: project/service wordmark or simple text identity. Do not
    invent an official NHAA or government emblem.
-   Right: language selector; "How this works"; "Privacy"; a restrained
    "Staff sign in" link.
-   Keep the header short and sticky only if it does not consume too
    much mobile space.
-   Do not expose a staff login form on the public homepage.
-   Do not show AI service health, model status, demo reset, synthetic
    case counters or internal technical details.

#### B. Hero

Suggested copy (final wording should be reviewed by the team and
translated professionally):

**Eyebrow:** A safe place to begin

**Headline:** You can tell us what happened, in the way that feels
easiest.

**Supporting text:** Share a few details by writing, speaking or
answering simple questions. You can skip questions you do not want to
answer. If you need immediate help, you can find safety options first.

Primary action: **Start**

Secondary action: **I need help right now**

Small reassurance line: "You do not need to explain everything at once."

Avoid promises such as "100% confidential", "instant protection", "your
information can never be seen" or "AI understands your feelings".
Explain the actual privacy controls and limitations instead.

#### C. Three ways to continue

Use three clear cards or rows. Keep their visual weight equal; do not
imply that one is the "correct" method.

1.  **Write**
    -   "Type in your own words."
    -   Icon: simple pencil/message.
    -   Opens text entry.
2.  **Speak**
    -   "Record a voice note if speaking is easier."
    -   Icon: microphone.
    -   Opens a permission explainer and voice recorder; do not start
        recording automatically.
3.  **Guided questions**
    -   "Answer a few short questions, one at a time."
    -   Icon: simple list/chat bubbles.
    -   Opens the scripted conversational flow.

A separate "Talk to a person / request a callback" route may be shown
only if the callback or human-assistance workflow is genuinely
implemented. Do not show a dead-end action.

#### D. Immediate safety section

A visually distinct but calm section: - "Are you in immediate danger?" -
Button: "I need urgent help" - Show emergency options only in the
approved emergency panel and in the selected language. - The existing
requirements specify 112, Tele-MANAS 14416 and NHAA 14566 as options for
Critical cases. Confirm the current approved wording, availability and
operating details with the project team before publishing. - Do not
imply that pressing the button automatically contacts emergency services
unless the backend really does so.

#### E. How it works

Three simple steps, without AI hype:

1.  **Choose how to share** --- write, speak or answer guided questions.
2.  **Choose what you consent to** --- text analysis, voice analysis and
    sharing/follow-up are separate choices.
3.  **A human can review and help** --- the module supports responders;
    people remain responsible for decisions.

Do not expose SVI calculation, model names, acoustic feature extraction
or risk bands on the victim homepage.

#### F. Privacy and control strip

Plain-language links or expandable sections: - What information is
used? - What happens if I say no to analysis? - Who may see my
information? - Can I change my mind? - How do I leave this page quickly?

These must link to accurate policy copy, not generic filler.

#### G. Footer

-   Privacy notice
-   Accessibility
-   Language support
-   Contact / official support route, only if supplied and verified by
    the project
-   Staff sign-in
-   A restrained statement that this module works alongside the existing
    NHAA process and is not a substitute for emergency services or the
    official grievance channel.

### 2.3 Homepage layout --- mobile

Mobile is the primary design target.

-   Header: compact wordmark + language selector + accessible menu.
-   Hero headline should wrap naturally within a narrow width.
-   Stack the three input choices vertically, full-width, with a large
    tap target.
-   Keep the immediate-safety action visible without making every screen
    look like an emergency warning.
-   Do not put two-column content, dense policy paragraphs or a large
    illustration above the primary action.
-   Avoid autoplay audio, video backgrounds, parallax and heavy
    animation.
-   Keep the primary action reachable without excessive scrolling.
-   Do not let a sticky footer cover form controls or the keyboard.

### 2.4 Homepage must not contain

-   Simulator as the main product experience.
-   Presenter mode, case playback, demo reset or synthetic case lists.
-   Staff risk queues, SVI, bands, analytics, indicator bars or case
    summaries.
-   Public login form.
-   A fake AI assistant avatar or an open-ended LLM chat box.
-   Stock photos of distressed people, crime scenes, police lights,
    brains, robots or abstract "AI brain" imagery.
-   Unverified claims about confidentiality, response times, legal
    status or guaranteed intervention.
-   Large statistics cards that are not meaningful to a person seeking
    help.

------------------------------------------------------------------------

## 3. The complete victim-facing site flow

### 3.1 Main journey map

``` mermaid
flowchart TD
    A[Public homepage /] --> B[Choose language]
    B --> C[Start intake]
    C --> D[Explain service and consent]
    D --> E{Consent to analysis?}
    E -->|Text and/or voice consent| F[Record granular choices]
    E -->|Declines analysis| G[SAFETY_ONLY mode]
    F --> H[Immediate safety check]
    G --> H
    H --> I{Immediate danger or urgent concern?}
    I -->|Yes| J[Show approved emergency options / human help]
    I -->|No or continue| K[Choose input method]
    J --> K
    K --> L[Write]
    K --> M[Record voice note]
    K --> N[Guided questions]
    L --> O[Unified input review]
    M --> O
    N --> O
    O --> P[Optional case context and screeners]
    P --> Q[Review, edit, skip optional items]
    Q --> R[Submit / continue existing docket]
    R --> S[Confirmation and next steps]
    S --> T[Session ends / safe resume if supported]
```

This is the proposed user-facing sequence. The current implementation
may combine some states into one route or use the existing conversation
state machine. Preserve the backend state machine and map the UI to it.

### 3.2 Step 1 --- language selection

-   Show supported languages using their native names and readable
    labels.
-   Current documented language codes: `en`, `hi`, `hi-Latn`, `mr`,
    `ta`, `bn`.
-   `hi-Latn` should be labelled in a way users understand (for example,
    "Hinglish / Roman Hindi"), not as a technical language code.
-   Persist the selected UI language for the interaction.
-   Language switching must not silently erase a draft or change
    consent.
-   All visible copy, validation, empty states, error messages, audio
    prompt labels and confirmation states need translations.
-   If a translation is missing, do not silently show a misleading or
    machine-generated translation. Display a clear fallback and record
    the gap for the team.

### 3.3 Step 2 --- service explanation and consent

Consent must happen before text or voice analysis.

Use a dedicated screen or a clearly separated step. Avoid a giant legal
wall of text.

Show: - what the module does; - what it analyses (text and/or voice); -
why it analyses it; - who may see the information; - how long the
relevant data is retained; - what happens if the user declines; - how to
withdraw consent; - that refusing analysis does not affect the complaint
path.

Provide audio playback for the consent notice, as required by the
existing requirements.

#### Granular controls

Use separate, neutral controls for: - text analysis; - voice analysis; -
sharing with counsellors; - follow-up contact; - audio retention (only
if the system supports storing audio and the user is explicitly asked).

Do not bundle these into one "I agree to everything" checkbox. Do not
preselect optional consent. Explain that the person can accept some and
decline others.

#### Consent states

  -----------------------------------------------------------------------
  User choice                         Expected behaviour
  ----------------------------------- -----------------------------------
  Text analysis accepted, voice       Text-only analysis; voice
  declined                            recording/live voice analysis
                                      unavailable

  Voice analysis accepted, text       Voice analysis only where voice
  declined                            consent and input mode allow it

  Both analysis choices declined      Continue in `SAFETY_ONLY`; still
                                      offer safety check and complaint
                                      path

  Consent withdrawn                   Stop further analysis immediately;
                                      delete stored raw audio as
                                      required; continue only in the
                                      permitted safety/complaint mode

  Minor without required              Safety-only and direct human
  guardian/support-person consent     counsellor route; do not run
                                      automated analysis beyond the
                                      safety check
  -----------------------------------------------------------------------

Use the existing consent API and `AssessmentMode` values. Do not create
a second, conflicting consent state in frontend-only storage.

### 3.4 Step 3 --- immediate safety check

This is distinct from the optional narrative and case context.

The current requirements specify a short safety check including: - "Are
you safe right now?" - "Is the person who harmed you nearby?" - "Are you
having thoughts of ending your life?"

Use the existing approved, scripted, translated prompts. Do not
improvise or soften the meaning of a safety question.

UX rules: - One question at a time. - Clear answer choices and "Prefer
not to answer" / "Skip" only where allowed by the existing contract and
safety design. - Never use a red flashing screen or alarm animation. -
If the answer indicates immediate danger, show the approved emergency
panel and available human-help options. - Do not display a risk band or
say "you are Critical". - Do not block access to help while waiting for
an AI call. - The safety lexicon path remains available in every consent
mode according to the current architecture; declining AI analysis does
not disable the safety check.

### 3.5 Step 4 --- input method choice

Offer the user three understandable options:

-   Write a message
-   Record a voice note
-   Answer guided questions

The user should not have to choose "PORTAL", "CHATBOT", "VOICE_CALL",
"IVRS" or "API". Those are system/integration channels, not
human-friendly input labels.

#### Channel vs input method

Keep these concepts separate:

-   **Channel** = where the interaction came from: `PORTAL`, `CHATBOT`,
    `VOICE_CALL`, `IVRS`, `MOBILE_APP`, `OPERATOR_ASSISTED`, `API`.
-   **Input method** = how information was supplied within that channel:
    proposed values `TEXT`, `VOICE_RECORDING`, `LIVE_VOICE`, `GUIDED`,
    `IVR_KEYPRESS`, `OPERATOR_TRANSCRIPTION`.

The existing API defines `channel` but does not define the proposed
`inputMethod` in its shared type excerpt. Inspect `models.ts`, contracts
and actual usage before adding it. If useful, add it as a small additive
field and update Zod, persistence, API documentation and tests together.
Do not repurpose `channel` to store the input method.

For a public browser portal, the channel should be assigned by the
application (`PORTAL`) rather than asked of the victim. For external
integrations, the integration should provide the channel. Never trust a
user-editable browser field to establish a privileged channel.

### 3.6 Step 5A --- text input

Design a calm, uncluttered writing surface.

Elements: - Prompt: "You can write in your own words. Share only what
you feel comfortable sharing." - Large multiline text area. -
Placeholder should be an example of format, not a suggested incident
story. - Character guidance only if there is a real API limit. - Save
draft only if secure server-side draft support exists; do not imply
local persistence if it does not. - "Continue" and "I want to answer
guided questions instead". - Language indicator and a way to change
language without losing text. - Optional "I need help writing"
explanation with simple prompts (when, what happened, whether anyone is
in danger), but do not force a rigid template.

Rules: - Do not auto-submit. - Do not send each keystroke to the
analysis service unless the consent and API design explicitly support
it. - If analysis happens per message, show a neutral "Sending..."
state, not an animated AI typing experience. - Preserve the original
user text. Any translation or summary is a separate derived artifact. -
Provide an edit path before final submission. - If the AI service is
unavailable, the complaint/safety path must still function; show a calm
service-limitation message, not a technical stack trace.

### 3.7 Step 5B --- voice note recording

Treat voice note recording as a separate mode from live voice
interaction.

Before microphone permission: - Explain why the microphone is needed. -
Explain whether audio is analysed and whether raw audio is retained. -
Ask for the relevant voice-analysis consent first. - Explain that the
user can stop and review before submitting.

Recorder UI: - Large microphone button with explicit "Start
recording". - Recording timer and clear recording state. - Pause/stop
controls where supported. - A visible "Delete recording and try again"
action. - Playback before submit. - A clear upload/processing state. - A
text transcript review step after STT, where available. - A way to
correct transcription errors without changing the original audio file. -
Never auto-start recording, keep recording in the background or upload
before consent.

Constraints: - The existing architecture describes browser MediaRecorder
and 5-second chunks for voice analysis. - The API contract excerpt
describes audio uploads of chunks up to six seconds. - Reconcile the
actual implementation and contract before changing chunk size. Do not
assume these two descriptions are interchangeable. - Do not store raw
audio unless the explicit audio-retention consent and storage path
exist. - If audio is not retained, clearly explain that the recording is
processed and discarded according to the approved policy. - If
microphone permission is denied, show text and guided alternatives
without shaming the user.

### 3.8 Step 5C --- live voice interaction

Live browser voice is a distinct experience from recording a voice note.

Use it only if the existing live voice flow is implemented and tested: -
clear "Start voice interaction" action; - microphone permission
explanation; - visible mic state and elapsed time; - visible transcript
as it arrives; - pause/end controls; - clear network and processing
states; - no autoplay of the user's recording; - transcript
correction/review before final close where supported; - text fallback at
all times.

Do not present the browser simulation as a real connection to the NHAA
helpline. The requirements explicitly describe browser voice as a
simulated helpline interaction, and telephony integration is not
available in the current project constraints. Label the experience
accurately.

### 3.9 Step 5D --- guided questions

Guided questions should feel like a simple, human-authored sequence, not
a form with 25 fields.

-   One prompt per screen or conversational card.
-   Use scripted, pre-translated prompts from the existing flow.
-   Display progress in a non-pressuring way (e.g. "A few questions"
    rather than "Question 4 of 18" if the sequence is adaptive).
-   Provide back, skip where permitted, pause and quick exit.
-   Use yes/no, choice, scale or free text controls according to the
    prompt contract.
-   Do not ask a question that has already been answered clearly in the
    narrative unless required for safety or validated screening.
-   Do not force every person through every screener.
-   Existing FR-SCR-02 calls for conversational, skippable PHQ-2, GAD-2,
    PC-PTSD-5 and C-SSRS-style items. Use the approved instrument text
    and implementation; do not invent substitute questions or alter
    validated wording.
-   Store unanswered/skipped separately from "No".
-   Never use a progress bar that implies the person must finish every
    optional question to receive help.

### 3.10 Step 6 --- optional case context

The requirements specify these fields as optional: - offence category
(aligned with the existing NHAA grievance form); - age group; -
gender; - whether the person is alone or has support; - whether the
accused is nearby; - whether there are ongoing threats.

UX: - Ask only after immediate safety. - Group related questions into
short sections. - Use plain labels and "Prefer not to say" where
appropriate. - Explain why a question is asked if it may feel
sensitive. - Do not make gender or any identity field a risk feature.
The privacy review states gender is collected only as optional
context/fairness data and is not read by the scorer. - Do not add
caste/community identity as an assessment feature. The project privacy
review explicitly prohibits caste/community fields and identity-based
scoring. - Do not ask for exact address or identifying information
unless the existing complaint workflow genuinely needs it. Keep PII in
the separate identity path/vault as designed. - Do not ask the user to
repeat details already in the narrative.

### 3.11 Step 7 --- unified review layer

This is a key addition to the user experience.

Before final submission, show one review screen that unifies: - written
narrative or transcript; - answers to guided questions; - optional
context; - consent choices; - any language/translation details the user
needs to verify.

Actions: - Edit narrative. - Correct transcript. - Change an answer. -
Remove optional context. - Go back. - Submit/continue.

Important: - Do not show SVI, band, indicators, confidence or model
outputs. - Do not expose staff-only summaries as if they were the
victim's words. - Clearly distinguish original text from
transcription/translation. - If the system generates a neutral staff
summary, it must remain staff-side and must not replace the person's own
account. - Review is not a second consent prompt unless the consent
changed.

### 3.12 Step 8 --- submission and confirmation

Confirmation should: - say that the information was received by this
module; - show the docket/reference number returned by the backend; -
explain the next step accurately; - state whether a callback was
requested only if that request was accepted by the backend; - provide
approved emergency contact options if relevant; - explain how to return
to an existing docket if that feature is supported; - avoid promising a
response time unless the SLA is real and approved.

Do not claim "complaint filed" unless the integration actually confirms
that the official complaint system accepted it. Prefer accurate wording
such as "Your information has been received" and clarify the
relationship to the existing grievance process.

### 3.13 Pause, resume, quick exit and session end

Requirements include skip, pause and quick exit.

-   Pause must not silently leave an open microphone.
-   If secure resume exists, show how to return without exposing
    sensitive content on a shared device.
-   If resume does not exist, do not display a fake "saved"
    confirmation.
-   Quick exit should navigate immediately to a neutral destination and
    clear the visible screen state as far as the app can control.
-   Do not promise to erase browser history, network logs, screenshots,
    operating-system activity or server records. The UI cannot guarantee
    that.
-   Do not put sensitive narrative text in URL query strings, route
    names, document titles, push notifications or analytics events.
-   Session timeout should lead to a neutral screen, not redisplay the
    narrative on a shared device.
-   The service worker must continue not to cache pages or API
    responses. The privacy review specifically records this as a
    guarantee.

------------------------------------------------------------------------

## 4. Unified input layer --- product and engineering specification

### 4.1 Concept

Build one **Input Layer** that provides a consistent experience
regardless of whether the person writes, speaks or answers questions. It
should normalise the user experience, not collapse all modalities into
one technical upload.

The input layer should: - receive input from the chosen method; -
validate consent and permissions before capture/analysis; - preserve
source provenance (typed text vs transcript vs guided answer); - pass
data through existing victim APIs; - show the user a safe review
state; - handle failures without losing the person's work where secure
persistence is supported; - never reveal internal analysis results.

### 4.2 Proposed component structure

Names are suggestions; adapt to the existing codebase.

``` text
VictimExperience
├── PublicHeader
├── LanguagePicker
├── SafetyEntry
├── ConsentFlow
│   ├── ConsentExplanation
│   ├── ConsentAudioPlayer
│   └── GranularConsentControls
├── SafetyCheckFlow
├── InputMethodPicker
├── InputWorkspace
│   ├── TextComposer
│   ├── VoiceNoteRecorder
│   ├── LiveVoiceSession
│   └── GuidedQuestionFlow
├── ContextQuestions
├── InputReview
├── SubmissionStatus
├── ConfirmationPage
├── QuickExitControl
└── PrivacyHelp
```

Do not create duplicate state machines in each component. The current
architecture already has a conversation state machine (greeting →
consent → safety check → optional context → open narrative → adaptive
screeners → summary/close). Map components to the existing flow.

### 4.3 Input method data model --- proposed, not yet approved

Keep the existing `channel` field. Consider a separate `inputMethod`
field only after inspecting `models.ts` and API usage.

  -----------------------------------------------------------------------
  Field                   Example                 Meaning
  ----------------------- ----------------------- -----------------------
  `channel`               `PORTAL`                Where the interaction
                                                  originated

  `inputMethod`           `VOICE_RECORDING`       How this particular
                                                  input was supplied

  `language` /            `hi`                    UI / selected language
  `uiLanguage`                                    

  `sourceMessageId`       ObjectId                Links derived
                                                  transcript/analysis to
                                                  the original message

  `transcriptionStatus`   `PENDING`, `READY`,     State of STT processing
                          `FAILED`, if needed     

  `consentMode`           Existing `SAFETY_ONLY`, Existing
                          `TEXT_ONLY`,            consent/analysis mode
                          `VOICE_ONLY`, `FULL`    
  -----------------------------------------------------------------------

Avoid adding every field above blindly. Reuse fields already present.
Any schema addition must be reflected in Mongoose, Zod, API contracts,
serializers, tests and documentation.

### 4.4 Provenance rules

-   Typed text remains typed text.
-   A voice transcript must be marked as a transcript, not silently
    stored as if the user typed it.
-   Guided answers remain structured responses with their item codes.
-   A translation must be separate from the original language content.
-   A staff-edited transcript or indicator must retain its review
    history.
-   The same interaction can contain more than one input method.
-   A single case can contain multiple interactions, consistent with the
    current case/interaction model.

### 4.5 Input state handling

Every input component must define: - `idle`; - `permission_required`
(voice only); - `recording` / `capturing`; - `uploading`; -
`processing`; - `review_ready`; - `failed`; - `cancelled`; -
`submitted`.

Use the existing API's real statuses where they exist. Do not invent a
frontend state that falsely implies the server accepted or stored data.

### 4.6 Error and edge cases

Handle and test: - microphone denied; - microphone unavailable; -
browser does not support recording; - recording too short / too long; -
upload interrupted; - duplicate submit; - slow connection; - analysis
service unavailable; - STT returns empty or poor transcript; -
unsupported language; - user changes language mid-flow; - user withdraws
consent while recording/processing; - session expires; - user presses
quick exit; - user reloads during an interaction; - user uses browser
back; - user submits twice after a timeout; - user chooses text after
voice failure; - user skips every optional context question.

Use the existing idempotency-key contract for victim POSTs that create
data. Do not implement duplicate prevention only in the browser.

------------------------------------------------------------------------

## 5. Visual design system

### 5.1 Recommended theme: "Quiet Paper"

The existing victim pages already use a warm off-white background
(`#F4F1EA`). The simulator plan separately proposes a "case file" theme
for staff/demo screens. Do not simply copy the simulator's brick-red
stamped aesthetic onto the victim experience.

**Recommendation:** use a softer, more human "Quiet Paper" theme for the
victim-facing site, with a related but more information-dense "Case
File" treatment retained for staff pages.

The victim UI should feel: - calm; - grounded; - respectful; - modern
but not fashionable; - easy to read; - not clinical; - not
bureaucratic; - not childish.

### 5.2 Colour tokens

Suggested starting tokens; verify contrast before implementation.

  -----------------------------------------------------------------------
  Token                   Suggested value         Usage
  ----------------------- ----------------------- -----------------------
  `--page`                `#F4F1EA`               Warm off-white
                                                  background, aligned
                                                  with current victim UI

  `--surface`             `#FFFEFB`               Cards, form surfaces

  `--ink`                 `#1B2A41`               Main text, headings,
                                                  primary navigation

  `--muted`               `#5F6670`               Secondary text

  `--line`                `#D8D2C7`               Borders and dividers

  `--primary`             `#245B57`               Primary action / calm
                                                  teal-green

  `--primary-hover`       `#194A46`               Hover and pressed state

  `--soft-accent`         `#E5EEE9`               Selected cards /
                                                  low-emphasis
                                                  backgrounds

  `--warning`             `#8A5A20`               Non-emergency caution

  `--danger`              `#A63A2B`               Immediate
                                                  danger/emergency
                                                  actions only

  `--focus`               `#225D9C`               Visible keyboard focus

  `--disabled`            `#777777`               Disabled text/icons;
                                                  verify contrast
  -----------------------------------------------------------------------

The brick red `#A63A2B` exists in the simulator theme as a
stamp/critical accent. Use red sparingly in the victim experience, only
for genuinely urgent safety actions. Do not make the entire app red.

### 5.3 Typography

Recommended: - Use a highly legible sans-serif for body copy and
controls. - Use a strong but not condensed sans-serif for headings. -
Ensure proper Devanagari and regional script fallback for Hindi,
Marathi, Tamil and Bengali. - Use the existing `next/font` and project
font setup if it already supports these scripts. - Avoid all-caps
labels, ultra-thin weights, condensed display fonts and decorative serif
body text. - Minimum body size target: 16px on mobile. - Comfortable
line height: approximately 1.5 for body text. - Use tabular numerals
only where useful (reference numbers, timers).

### 5.4 Layout and spacing

-   Mobile-first; one primary column for intake.
-   Maximum reading width for narrative text: approximately 680--760px.
-   Forms should not stretch edge-to-edge on wide screens.
-   Use generous spacing between unrelated questions.
-   Keep related controls close together.
-   Prefer clear card boundaries and whitespace over shadows everywhere.
-   Use subtle borders; avoid glassmorphism, gradients, neon, excessive
    blur and decorative noise.
-   Use a consistent spacing scale (4 / 8 / 12 / 16 / 24 / 32 / 48).
-   Touch targets should be at least 44 × 44 CSS pixels; larger for
    primary actions.

### 5.5 Buttons and controls

-   Primary: filled calm teal, clear verb label.
-   Secondary: outlined or low-emphasis surface.
-   Destructive/urgent: reserved for delete recording, quick exit or
    approved emergency action; distinguish these purposes.
-   Never use colour alone to distinguish status.
-   All controls need hover, focus, active, disabled, loading and error
    states.
-   Avoid icon-only buttons unless they have accessible names and
    visible tooltips where appropriate.

### 5.6 Motion and illustration

-   Prefer no animation for core intake steps.
-   Small transitions are acceptable only if they do not delay access or
    imply emotional interpretation.
-   Respect `prefers-reduced-motion`.
-   No animated waveform unless audio is actually recording/playing.
-   No stock photos of victims or distress.
-   Use simple line icons or abstract supportive geometry only where
    useful.
-   Do not use AI-generated people as a trust shortcut.

------------------------------------------------------------------------

## 6. Page-level UI specification

### Page A --- Homepage

-   Header with language, privacy/help and staff link.
-   Hero with one primary CTA.
-   Three input-method cards.
-   Immediate-safety section.
-   Three-step explanation.
-   Privacy reassurance with real details.
-   Minimal footer.
-   Mobile stack and no data-heavy dashboard elements.

### Page B --- Consent

-   Plain-language intro.
-   Audio playback.
-   Separate toggles/checkboxes for each consent purpose.
-   Clear "Continue with selected choices" action.
-   Clear "Continue without analysis" option.
-   Links to retention and withdrawal explanation.
-   No preselected optional consent.
-   Accessible descriptions and keyboard controls.

### Page C --- Safety check

-   One prompt at a time.
-   Large answer controls.
-   Skip only where permitted.
-   Immediate help panel when appropriate.
-   No risk labels or internal scores.

### Page D --- Input method picker

-   Three equal options: Write, Speak, Guided questions.
-   Explain what happens next in one short sentence per option.
-   Include "Ask for human help" only if implemented.

### Page E --- Text composer

-   Large text area.
-   Clear save/continue status.
-   Language label.
-   Optional prompt helper.
-   Edit and continue actions.
-   Error state with retained draft only if safe persistence is real.

### Page F --- Voice recorder

-   Permission explanation.
-   Large record/stop control.
-   Timer.
-   Delete/re-record.
-   Playback.
-   Upload state.
-   Transcript review.
-   Text fallback.

### Page G --- Guided questions

-   Single question per view/card.
-   Clear answer controls.
-   Back/skip/pause.
-   Progress without pressure.
-   Adaptive sequence from existing conversation engine.

### Page H --- Context

-   Optional fields.
-   Plain explanations.
-   No unnecessary identity collection.
-   No caste/community field.
-   No repeated narrative.

### Page I --- Review

-   Separate sections for narrative/transcript, structured answers,
    context and consent.
-   Edit actions.
-   Clear distinction between original and translated/transcribed
    content.
-   Submit action.

### Page J --- Confirmation

-   Received status.
-   Docket/reference number.
-   Accurate next steps.
-   Emergency/help options if applicable.
-   Safe exit.

### Page K --- Staff sign-in

-   Keep separate from victim entry.
-   Do not let staff pages or their data leak into public routes.
-   Preserve existing Auth.js, MFA and RBAC behaviour.

------------------------------------------------------------------------

## 7. Accessibility, language and responsive requirements

-   Meet WCAG 2.1 AA as the target.
-   Keyboard navigation for all flows.
-   Visible focus ring.
-   Correct semantic headings and landmarks.
-   Proper labels and error descriptions for every input.
-   Screen-reader announcements for recording, upload, processing,
    errors and confirmation.
-   Do not announce every transcript token in a way that overwhelms
    screen-reader users; use sensible live-region updates.
-   Do not rely on colour, sound or animation alone.
-   Support zoom/reflow and small screens.
-   Check Hindi, Marathi, Tamil and Bengali line wrapping, font fallback
    and mixed-script text.
-   Ensure voice controls have text alternatives.
-   Audio prompts must have a text equivalent.
-   Avoid time limits where possible; warn before session expiry if
    supported.
-   Reduced-motion support.
-   Test with keyboard, screen reader and low-end Android, not only
    axe-core.

------------------------------------------------------------------------

## 8. Privacy and safety rules for frontend

These are hard constraints, not design preferences.

1.  Never render SVI, band, dimension scores, indicators, confidence or
    staff-only analysis in victim UI.
2.  Never place sensitive narrative content in URLs, browser titles,
    analytics, logs or notification previews.
3.  Do not store victim pages or API responses in the service worker
    cache. Existing privacy review says the service worker intentionally
    does not cache pages or API responses.
4.  Do not start microphone capture before voice consent and explicit
    user action.
5.  Do not retain raw audio unless explicit audio-retention consent and
    the real storage/deletion implementation exist.
6.  On withdrawal, stop analysis and follow the backend deletion
    behaviour. Do not simulate deletion in frontend state only.
7.  Preserve PII separation and server-side filtering.
8.  Do not expose police/welfare/cross-role data through client-side
    hiding. Access control belongs on the server.
9.  Keep the safety check available in `SAFETY_ONLY` mode.
10. Never let AI-generated text directly address the victim.
11. No caste/community field or identity-based risk feature.
12. Do not promise absolute confidentiality or that quick exit erases
    all traces.
13. Do not show a diagnosis or use terms like "you have
    depression/PTSD".
14. If analysis fails, do not block the complaint/safety path.
15. All emergency copy and contact information must be approved and
    verified before production use.

------------------------------------------------------------------------

## 9. Existing backend and product behaviour to preserve

-   Next.js App Router application.
-   Python FastAPI analysis service behind the internal analysis
    contract.
-   MongoDB/Mongoose data model.
-   Zod API contracts.
-   Existing victim session and consent endpoints.
-   Existing conversation state machine and scripted prompts.
-   Existing safety lexicon path independent of AI availability.
-   Deterministic TypeScript scoring engine; AI produces indicators, not
    final scores.
-   Case and interaction distinction: one case can have multiple
    interactions.
-   Existing idempotency-key handling.
-   Existing role-based staff pages and server-side filtering.
-   Existing emergency panel behaviour.
-   Existing multilingual message catalogue and PWA privacy behaviour.
-   Existing voice processing and retention rules.

Do not redesign these in the name of frontend consistency.

------------------------------------------------------------------------

## 10. Proposed visual references in words

The desired interface should resemble a thoughtful public-service
digital service, not a crisis hotline poster and not a SaaS analytics
product.

-   Warm paper background.
-   Deep navy text.
-   Restrained teal primary actions.
-   White/off-white surfaces.
-   Thin warm-grey borders.
-   Generous whitespace.
-   Clear, readable sans-serif.
-   Simple line icons.
-   Soft rounded corners (subtle, not pill-shaped everywhere).
-   One main action per screen.
-   No gradients, glassmorphism, neon, giant decorative illustrations or
    animated backgrounds.
-   The staff portal may retain a more structured "case file" visual
    language, but the victim experience should remain warmer and less
    institutional.

------------------------------------------------------------------------

## 11. Definition of done for the frontend

The work is not complete until: - a new visitor can enter from `/` and
reach intake; - all three input methods are understandable and usable; -
consent is granular and enforced by the backend; - safety check works in
every consent mode; - voice permissions and failures are handled
safely; - transcript and narrative can be reviewed/corrected where
supported; - optional context can be skipped; - no question forces
repeated retelling; - confirmation reflects the real backend result; -
no victim screen exposes scores, bands or indicators; - no sensitive
content is cached or placed in URLs/logs; - the mobile experience works
at small widths; - keyboard and screen-reader checks are performed; -
existing API, privacy, RBAC and assessment tests still pass; - all
supported languages are checked for layout and copy; - no simulator
controls appear in the public homepage.

------------------------------------------------------------------------

## 12. Open decisions --- do not guess

Claude Code should produce a short `docs/FRONTEND_OPEN_QUESTIONS.md` if
these cannot be answered from the repository:

1.  Is secure save/resume already implemented? If yes, what are the
    exact API states and expiry rules?
2.  Is human callback/request-a-person functionality implemented end to
    end?
3.  Does the portal support both a voice note and a live browser voice
    session today?
4.  What is the exact current audio chunk contract? Architecture and API
    documentation describe different chunk sizes.
5.  Does the current review/confirmation endpoint exist, or is the flow
    closed by the existing conversation endpoint?
6.  Can a victim attach to an existing docket, and what verification is
    required?
7.  Which emergency wording/contact availability has been approved for
    production?
8.  Are all consent notice audio assets recorded, or is browser speech
    still being used?
9.  Which current victim routes/components can be reused without
    duplicating the state machine?
10. Is `inputMethod` already represented in `models.ts` or stored
    indirectly? Do not add it twice.

**End of product brief.**
