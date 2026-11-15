# Frontend Implementation Checklist

## Replace simulator-first landing page, build the homepage and unified input layer

**Project:** AI-Based Real-Time Stress and Trauma Assessment Module
(SIH26093)\
**For:** Claude Code\
**Companion:** `FRONTEND_UX_PRODUCT_BRIEF.md`

This is an execution checklist. Work through it in order, inspect the
repository first, and update the checklist with evidence. Do not mark
work complete without tests or a verified manual check.

------------------------------------------------------------------------

## 0. First task --- repository audit, no code changes yet

-   [x] Read `CLAUDE.md`.
-   [x] Read the current `REQUIREMENTS.md`.
-   [x] Read `ARCHITECTURE.md`.
-   [x] Read `API_CONTRACTS.md`.
-   [x] Read `DATABASE.md` and `models.ts`.
-   [x] Read `PRIVACY_REVIEW.md`.
-   [x] Read `EVALUATION_REPORT.md`.
-   [x] Read `IMPLEMENTATION_PLAN.md`.
-   [x] Inspect current App Router routes and layouts.
-   [x] Inspect the current public homepage.
-   [x] Inspect all victim-facing pages and shared components.
-   [x] Inspect the existing conversation state machine and prompt
    catalogue.
-   [x] Inspect consent state and API calls.
-   [x] Inspect text message submission and response states.
-   [x] Inspect voice recording/live voice implementation and exact API
    payloads.
-   [x] Inspect the PWA service worker and verify it does not cache
    victim pages or API responses.
-   [x] Inspect existing quick-exit implementation and its limitations.
-   [x] Inspect staff routes and ensure they are separate from public
    victim routes.
-   [x] Inspect current tests and identify which cover victim journeys.
-   [x] Record what is already implemented, partially implemented,
    missing or inconsistent.

**Deliverable before coding:** create `docs/FRONTEND_AUDIT.md` *(done 15 Nov 2026)* with: -
route inventory; - component inventory; - existing flow/state machine; -
API endpoints actually used; - gaps between docs and code; - reusable
components; - proposed minimal changes; - test baseline.

Do not assume a feature exists just because it appears in a plan.

------------------------------------------------------------------------

## 1. Product direction changes

### Replace

-   [ ] Replace simulator-first homepage at `/` with a public
    victim-facing entry point.
-   [ ] Make the primary action "Start" or equivalent.
-   [ ] Provide a simple language selector.
-   [ ] Provide three clear intake choices: Write, Speak, Guided
    questions.
-   [ ] Add a clear immediate-safety entry.
-   [ ] Explain the service in plain language.
-   [ ] Explain consent and privacy accurately.
-   [ ] Keep staff sign-in as a restrained secondary link.
-   [ ] Keep staff dashboards behind existing authentication and RBAC.
-   [ ] Make the victim flow the primary public experience.

### Keep

-   [ ] Existing Next.js App Router architecture.
-   [ ] Existing victim session and API contracts where possible.
-   [ ] Existing consent implementation and granular consent choices.
-   [ ] Existing `SAFETY_ONLY`, `TEXT_ONLY`, `VOICE_ONLY`, `FULL` modes.
-   [ ] Existing safety check and safety lexicon behaviour.
-   [ ] Existing scripted, pre-translated prompts.
-   [ ] Existing conversation state machine.
-   [ ] Existing text analysis pipeline and deterministic scoring.
-   [ ] Existing voice/STT pipeline and acoustic feature processing.
-   [ ] Existing case/interaction data model.
-   [ ] Existing PII separation, encryption, redaction and retention.
-   [ ] Existing emergency panel behaviour.
-   [ ] Existing staff dashboards, recommendations, referrals, audit and
    RBAC.
-   [ ] Existing idempotency handling for data-creating victim POSTs.
-   [ ] Existing synthetic scenario library and evaluation scripts.
-   [ ] Existing PWA shell, while preserving the no-sensitive-cache
    rule.

### Remove from the public experience

-   [ ] Simulator homepage content.
-   [ ] Presenter mode controls.
-   [ ] Demo reset controls.
-   [ ] Public synthetic case library.
-   [ ] Inbound simulator tabs as the homepage navigation.
-   [ ] Public analysis report with SVI, risk band or indicators.
-   [ ] Public demo status light / AI model status.
-   [ ] Public staff desk previews.
-   [ ] Any public path that reads real case data without staff
    authentication.

### Do not delete

-   [ ] `evaluation/scenarios/`.
-   [ ] `evaluation/simulator/` synthetic cases and audio fixtures.
-   [ ] Evaluation scripts and reports.
-   [ ] Simulator-only API routes or data until their dependencies are
    audited.
-   [ ] Existing demo-only data tags and filters.
-   [ ] Existing staff components that can be reused.

Reclassify simulator assets as internal demo/evaluation tools. If a demo
route is retained, use an explicit route such as `/demo` or an internal
staff-only route, and ensure it is not the public homepage. Preserve
synthetic-only labelling and server-side protections.

------------------------------------------------------------------------

## 2. Route and navigation tasks

-   [ ] Decide the smallest route map after inspecting current routes.
-   [ ] Make `/` the public victim-facing homepage.
-   [ ] Keep or refactor the existing `/portal` flow rather than
    duplicating it.
-   [ ] Ensure the start action opens the correct language/consent flow.
-   [ ] Keep staff sign-in and dashboards separate.
-   [ ] Remove public navigation links to simulator-only content.
-   [ ] Add Privacy, Accessibility and How it works links only when
    their pages/content are real.
-   [ ] Add a safe not-found page.
-   [ ] Ensure no sensitive narrative content is encoded in route params
    or query strings.
-   [ ] Ensure page titles do not contain incident details.
-   [ ] Ensure browser back behaviour does not unexpectedly erase or
    re-submit data.

------------------------------------------------------------------------

## 3. Homepage implementation tasks

### Header

-   [ ] Add simple wordmark/service identity.
-   [ ] Add language selector.
-   [ ] Add How it works link.
-   [ ] Add Privacy link.
-   [ ] Add Staff sign-in as a secondary link.
-   [ ] Do not add official logos/emblems unless supplied and approved.
-   [ ] Do not add simulator or AI service status.

### Hero

-   [ ] Add concise headline explaining that the person can share in the
    way that feels easiest.
-   [ ] Add one-sentence supporting copy.
-   [ ] Add one primary Start action.
-   [ ] Add a small reassurance that the person need not explain
    everything at once.
-   [ ] Avoid claims of guaranteed confidentiality, guaranteed
    protection or guaranteed response times.

### Input choice

-   [ ] Add Write card.
-   [ ] Add Speak card.
-   [ ] Add Guided questions card.
-   [ ] Each card has a clear label, one-line explanation and accessible
    icon.
-   [ ] Each card opens a real implemented flow.
-   [ ] Keep equal visual prominence.
-   [ ] Do not make users choose technical channel names.

### Safety

-   [ ] Add immediate-safety entry.
-   [ ] Reuse approved emergency panel and copy.
-   [ ] Verify emergency contact details/availability with the project
    team.
-   [ ] Do not imply that the app dispatches emergency help unless it
    really does.

### Footer

-   [ ] Add privacy and accessibility links.
-   [ ] Add verified contact/official channel information only.
-   [ ] Explain that this module complements the existing NHAA process.
-   [ ] Keep the footer concise and readable on mobile.

------------------------------------------------------------------------

## 4. Consent and safety flow

-   [ ] Ensure consent appears before any text/voice analysis.
-   [ ] Keep separate choices for text analysis, voice analysis,
    counsellor sharing and follow-up contact.
-   [ ] Ask separately for audio retention only if retention is actually
    supported.
-   [ ] Do not preselect optional consent.
-   [ ] Add audio playback for the consent notice.
-   [ ] Add a clear "continue without analysis" path.
-   [ ] Ensure refusal still allows safety check and complaint path.
-   [ ] Ensure `SAFETY_ONLY` is reflected in backend state, not just UI
    state.
-   [ ] Ensure consent version, language and timestamp are stored by the
    backend.
-   [ ] Ensure withdrawal stops further analysis.
-   [ ] Ensure withdrawal triggers the backend audio deletion behaviour.
-   [ ] Ensure minor-without-guardian route goes to safety-only and
    human counsellor.
-   [ ] Do not show diagnosis, SVI or risk band on victim screens.
-   [ ] Keep safety check accessible in all consent modes.
-   [ ] Keep safety questions scripted and translated.
-   [ ] Never make the safety check depend on the AI service being
    online.

------------------------------------------------------------------------

## 5. Unified input layer tasks

### Architecture

-   [ ] Create or refactor a shared input-layer boundary.
-   [ ] Map it to the existing conversation state machine.
-   [ ] Avoid independent duplicate state machines for text, voice and
    guided questions.
-   [ ] Keep each input method's provenance.
-   [ ] Ensure the same interaction can contain multiple input methods.
-   [ ] Preserve the case → interactions relationship.
-   [ ] Inspect whether `inputMethod` already exists in code before
    adding anything.
-   [ ] Keep `channel` as the origin channel; do not repurpose it.
-   [ ] If adding `inputMethod`, update Mongoose, Zod, API contracts,
    serializers, tests and docs together.
-   [ ] Derive browser portal channel server-side as `PORTAL`; do not
    let the client claim privileged channel identity.

### Text input

-   [ ] Build a large, readable multiline composer.
-   [ ] Add clear language indicator.
-   [ ] Add edit-before-submit.
-   [ ] Add guided alternative link.
-   [ ] Preserve original text.
-   [ ] Do not auto-submit.
-   [ ] Do not send content for analysis without the relevant consent.
-   [ ] Handle analysis-service failure without blocking
    safety/complaint flow.
-   [ ] Avoid technical error messages.
-   [ ] Do not claim draft persistence unless it is implemented
    securely.

### Voice note input

-   [ ] Explain microphone permission before requesting it.
-   [ ] Require voice consent before recording/analysis.
-   [ ] Require explicit user action to start recording.
-   [ ] Add recording timer and clear recording indicator.
-   [ ] Add stop/delete/re-record.
-   [ ] Add playback before submit.
-   [ ] Add upload and processing states.
-   [ ] Add transcript review/correction where STT is available.
-   [ ] Preserve distinction between audio and transcript.
-   [ ] Provide text fallback if permission is denied or recording
    fails.
-   [ ] Confirm the actual audio chunk size contract before changing it:
    current docs describe both 5-second windows and API chunks up to 6
    seconds.
-   [ ] Do not store raw audio without explicit retention consent and a
    real storage path.
-   [ ] Test consent withdrawal during recording and during processing.

### Live voice input

-   [ ] Keep live voice distinct from voice-note recording.
-   [ ] Label browser interaction accurately as a simulated helpline
    interaction, not a real telephony call.
-   [ ] Add explicit start/end controls.
-   [ ] Show microphone state.
-   [ ] Show transcript as available.
-   [ ] Show network/processing state.
-   [ ] Provide text fallback.
-   [ ] Test rolling-window updates.
-   [ ] Test first-window latency and slow-network behaviour.
-   [ ] Do not show internal SVI or risk band to the victim.

### Guided questions

-   [ ] Reuse scripted prompt definitions.
-   [ ] Render one prompt at a time.
-   [ ] Support existing prompt input types: free text, yes/no, scale,
    choice, none.
-   [ ] Support back/skip/pause where the flow permits.
-   [ ] Distinguish skipped from "No".
-   [ ] Use adaptive flow where already implemented.
-   [ ] Do not force every user through every screener.
-   [ ] Do not rewrite validated screening item wording.
-   [ ] Do not ask for narrative details already supplied unless
    required.

### Optional context

-   [ ] Offence category aligned with the NHAA grievance form.
-   [ ] Age group.
-   [ ] Gender, optional and not used by the scorer.
-   [ ] Alone/support person.
-   [ ] Accused nearby.
-   [ ] Ongoing threats.
-   [ ] All optional.
-   [ ] No caste/community field.
-   [ ] Avoid collecting duplicate PII.
-   [ ] Explain sensitive questions in plain language.

### Unified review

-   [ ] Add one review step before final submission/close.
-   [ ] Show original narrative or transcript.
-   [ ] Show guided answers.
-   [ ] Show optional context.
-   [ ] Show consent choices.
-   [ ] Allow edit/correct/remove optional content.
-   [ ] Clearly label transcript and translation.
-   [ ] Do not show AI staff summary as the victim's own words.
-   [ ] Do not show SVI, bands, indicators, confidence or model outputs.

### Confirmation

-   [ ] Show backend-returned docket/reference number.
-   [ ] Show only actions actually accepted by backend.
-   [ ] Explain next steps accurately.
-   [ ] Do not claim an official complaint was filed unless the
    integrated system confirms it.
-   [ ] Do not invent response-time promises.
-   [ ] Provide emergency options only using approved copy.

------------------------------------------------------------------------

## 6. Design system and UI polish

### Theme

-   [ ] Use "Quiet Paper" for victim-facing experience.
-   [ ] Keep the existing warm off-white `#F4F1EA` as the starting page
    background.
-   [ ] Use deep navy `#1B2A41` for text.
-   [ ] Use calm teal `#245B57` for primary actions (verify contrast).
-   [ ] Use warm grey borders `#D8D2C7`.
-   [ ] Reserve brick red `#A63A2B` for urgent safety actions only.
-   [ ] Keep staff "Case File" theme distinct and more
    information-dense.
-   [ ] Define tokens in one place (CSS variables/theme file).
-   [ ] Verify contrast for all text, disabled, hover and focus states.

### Typography

-   [ ] Use readable sans-serif.
-   [ ] Check Devanagari, Tamil and Bengali font fallback.
-   [ ] Keep mobile body text at least 16px.
-   [ ] Use comfortable line height.
-   [ ] Avoid condensed all-caps labels and thin weights.
-   [ ] Ensure long translated labels wrap without clipping.

### Components

-   [ ] Header.
-   [ ] Language picker.
-   [ ] Primary/secondary buttons.
-   [ ] Input-method card.
-   [ ] Consent option control.
-   [ ] Audio player.
-   [ ] Safety question card.
-   [ ] Text composer.
-   [ ] Voice recorder.
-   [ ] Transcript review.
-   [ ] Guided question card.
-   [ ] Optional context form group.
-   [ ] Review summary section.
-   [ ] Confirmation panel.
-   [ ] Inline validation/error state.
-   [ ] Loading/processing state.
-   [ ] Empty/offline state.
-   [ ] Quick exit.
-   [ ] Accessible modal/drawer only where needed.

### Responsive

-   [ ] Design mobile first.
-   [ ] Stack input choices vertically on mobile.
-   [ ] Keep primary CTA visible and reachable.
-   [ ] Ensure keyboard does not cover submit controls.
-   [ ] Avoid sticky footer overlap.
-   [ ] Check 320px width and common Android viewport sizes.
-   [ ] Check tablet and desktop layouts.
-   [ ] Check zoom/reflow.
-   [ ] Ensure no horizontal scrolling.

### Motion and imagery

-   [ ] No autoplay audio/video.
-   [ ] No background animation.
-   [ ] No distress stock photos.
-   [ ] No robot/brain/AI avatar.
-   [ ] Respect `prefers-reduced-motion`.
-   [ ] Use icons only when they improve recognition.
-   [ ] Avoid icon-only controls without accessible labels.

------------------------------------------------------------------------

## 7. Privacy, security and ethical guardrails

-   [ ] Victim API responses do not expose SVI/band/indicators.
-   [ ] Victim pages do not render staff-only fields.
-   [ ] Sensitive content never appears in URL/query strings.
-   [ ] Sensitive content never appears in browser title or
    notifications.
-   [ ] No sensitive content in analytics events or console logs.
-   [ ] Service worker does not cache pages or API responses.
-   [ ] Raw audio not stored without explicit consent.
-   [ ] Consent withdrawal calls the backend.
-   [ ] PII remains in the separate identity vault path.
-   [ ] All role-based restrictions remain server-enforced.
-   [ ] Police/welfare remain referral-only.
-   [ ] No caste/community field or identity-based scoring.
-   [ ] AI never generates victim-facing free text.
-   [ ] No diagnosis language.
-   [ ] No absolute confidentiality promise.
-   [ ] Quick exit copy does not claim to erase all browser/network
    traces.
-   [ ] Emergency copy is reviewed and verified.
-   [ ] All synthetic fixtures remain synthetic and non-graphic.

------------------------------------------------------------------------

## 8. Testing plan

### Unit / component tests

-   [ ] Language selector and language persistence.
-   [ ] Consent option selection and validation.
-   [ ] Consent mode mapping.
-   [ ] Safety-only path.
-   [ ] Minor without guardian path.
-   [ ] Input-method selection.
-   [ ] Text composer validation.
-   [ ] Voice permission denied.
-   [ ] Voice recording cancellation.
-   [ ] Transcript correction.
-   [ ] Guided question skip vs "No".
-   [ ] Optional context skip.
-   [ ] Review/edit behaviour.
-   [ ] Quick exit.
-   [ ] Confirmation rendering.
-   [ ] No risk fields rendered in victim UI.

### API / contract tests

-   [ ] Existing Zod schemas still validate.
-   [ ] Every data-creating victim POST sends idempotency key.
-   [ ] Duplicate submissions return/reuse original response.
-   [ ] Consent required before analysis.
-   [ ] Consent withdrawal stops analysis.
-   [ ] Safety check remains active in safety-only mode.
-   [ ] Audio upload rejects when voice consent is absent.
-   [ ] Victim response strict schemas do not leak staff fields.
-   [ ] If `inputMethod` is added, contract tests cover every accepted
    value.

### Playwright end-to-end tests

-   [ ] Homepage loads without sign-in and shows no case data.
-   [ ] Start → language → consent → safety check → text → review →
    confirmation.
-   [ ] Start → voice consent → voice recording → transcript review →
    confirmation.
-   [ ] Start → guided questions → optional context → review →
    confirmation.
-   [ ] Decline analysis → safety-only → complaint/safety path still
    works.
-   [ ] Withdraw consent → analysis stops.
-   [ ] Microphone denied → text/guided fallback works.
-   [ ] AI service unavailable → user can continue safely.
-   [ ] Slow network → duplicate submit does not create duplicate
    records.
-   [ ] Quick exit responds immediately.
-   [ ] Staff route remains protected.
-   [ ] Public route cannot access simulator reports or real case data.
-   [ ] Mobile viewport has no horizontal overflow.
-   [ ] Keyboard-only journey works.

### Manual testing

-   [ ] Keyboard navigation.
-   [ ] Screen reader session.
-   [ ] Low-end Android device.
-   [ ] Slow/throttled network.
-   [ ] Language layout review with native speakers.
-   [ ] Consent notice audio review.
-   [ ] Microphone behaviour on Chrome Android and desktop.
-   [ ] PWA install test.
-   [ ] Quick-exit limitation wording review.

------------------------------------------------------------------------

## 9. Existing evaluation findings --- do not hide these

The current `EVALUATION_REPORT.md` records the following limitations.
Frontend work must not claim the system is clinically validated or
production-ready.

-   [ ] Band accuracy was 79% (49/62), below the ≥80% target.
-   [ ] Labels for 62 scenarios were created by one author and remain
    drafts until a second reviewer agrees.
-   [ ] Moderate cases were often scored Low; this is a known
    scoring/evaluation issue and should not be "fixed" with UI wording.
-   [ ] Text latency p95 was 3.43 seconds against a 3-second target in
    the recorded run.
-   [ ] Voice-call accuracy was 40% with only five scenarios.
-   [ ] English synthetic STT was measured; other language STT
    measurements were not yet available.
-   [ ] Regional-language sets were small and need native-speaker
    review.
-   [ ] Volunteer usability testing had not been done.
-   [ ] Screen-reader testing and low-end Android/throttled-network
    checks were still outstanding.
-   [ ] OWASP ZAP baseline and deployment HTTPS checks were still
    outstanding.

Do not put these technical evaluation numbers on the victim homepage.
Keep them in internal evaluation/demo documentation.

------------------------------------------------------------------------

## 10. Documentation updates required after implementation

Update only after code changes are real.

-   [ ] `REQUIREMENTS.md`: homepage and input methods; distinguish voice
    note vs live voice; revise simulator homepage assumption; clarify
    input method vs channel if adopted.
-   [ ] `ARCHITECTURE.md`: new public entry flow and input-layer
    boundary; retain simulator as internal demo/evaluation surface.
-   [ ] `API_CONTRACTS.md`: only actual additive changes; document input
    method/provenance if implemented.
-   [ ] `DATABASE.md`: only actual schema changes; do not duplicate
    existing fields.
-   [ ] `models.ts`: keep in sync with Mongoose/Zod/API types.
-   [ ] `PRIVACY_REVIEW.md`: review new pages, service worker, voice and
    consent behaviour.
-   [ ] `IMPLEMENTATION_PLAN.md`: replace simulator-first homepage tasks
    with victim homepage/input-layer tasks; keep synthetic demo tasks
    separate.
-   [ ] `EVALUATION_REPORT.md`: add usability, accessibility, device and
    language results when measured.
-   [ ] `SIMULATOR_PLAN.md`: mark the public homepage assumption
    obsolete; retain the plan only as internal demo guidance if still
    useful.
-   [ ] `CLAUDE.md`: update project rules only if the team explicitly
    changes them; never weaken privacy or safety rules for convenience.

------------------------------------------------------------------------

## 11. Suggested implementation phases

### Phase 1 --- audit and foundation

-   [ ] Complete `FRONTEND_AUDIT.md`.
-   [ ] Confirm current route and state machine.
-   [ ] Agree on route map and design tokens.
-   [ ] Identify reusable components.
-   [ ] Establish baseline tests.

**Exit condition:** team can point to the exact files/routes/components
that will be changed, with no backend rewrite proposed.

### Phase 2 --- homepage and visual foundation

-   [ ] Implement Quiet Paper tokens.
-   [ ] Build responsive header/footer.
-   [ ] Replace `/` with victim-facing homepage.
-   [ ] Add three input-method entry cards.
-   [ ] Add immediate-safety entry.
-   [ ] Remove simulator controls from public navigation.
-   [ ] Keep staff sign-in separate.

**Exit condition:** homepage works on mobile/desktop, has no simulator
data, and every visible action goes somewhere real.

### Phase 3 --- consent and safety flow

-   [ ] Refine consent presentation.
-   [ ] Add consent audio playback.
-   [ ] Verify granular consent mapping.
-   [ ] Refine immediate safety check.
-   [ ] Verify safety-only and minor routes.
-   [ ] Verify emergency panel behaviour.

**Exit condition:** consent and safety tests pass; no analysis runs
without consent.

### Phase 4 --- unified input layer

-   [ ] Refactor input method selection.
-   [ ] Integrate text composer.
-   [ ] Integrate voice note recorder.
-   [ ] Integrate live voice only if already supported.
-   [ ] Integrate guided question flow.
-   [ ] Preserve source provenance.
-   [ ] Add transcript review.

**Exit condition:** each input method reaches the existing backend
correctly and does not bypass consent.

### Phase 5 --- context, review and confirmation

-   [ ] Refine optional context.
-   [ ] Add unified review.
-   [ ] Add edit/correct/remove optional fields.
-   [ ] Add accurate confirmation.
-   [ ] Verify docket/reference number handling.
-   [ ] Verify existing docket attachment if supported.

**Exit condition:** user can review what they supplied and receives a
truthful confirmation.

### Phase 6 --- hardening

-   [ ] Accessibility testing.
-   [ ] Language review.
-   [ ] Low-end Android and slow network.
-   [ ] PWA privacy check.
-   [ ] Voice failure paths.
-   [ ] Session expiry and quick exit.
-   [ ] Full Playwright regression.
-   [ ] Update documentation.

**Exit condition:** all critical safety/privacy tests pass and open
limitations are documented.

------------------------------------------------------------------------

## 12. Final acceptance checklist

The frontend redesign is accepted only when all applicable items are
true:

-   [ ] `/` is a victim-facing homepage, not the simulator.
-   [ ] Simulator/demo assets are retained internally and cannot expose
    real cases publicly.
-   [ ] User can choose Write, Speak or Guided questions.
-   [ ] User does not choose technical channel names.
-   [ ] Channel and input method are not conflated.
-   [ ] Consent is granular, understandable and enforced server-side.
-   [ ] Declining analysis does not block safety/complaint flow.
-   [ ] Safety check works independently of AI availability.
-   [ ] Voice requires consent and explicit recording action.
-   [ ] Voice note and live voice are not presented as the same thing.
-   [ ] Transcript/narrative can be reviewed where supported.
-   [ ] Optional context can be skipped.
-   [ ] User is not forced to retell the incident.
-   [ ] Victim never sees SVI, band, indicators or diagnosis.
-   [ ] No sensitive content is cached, placed in URLs or leaked through
    logs.
-   [ ] Quick exit is honest about its limits.
-   [ ] Confirmation reflects actual backend acceptance.
-   [ ] Mobile, keyboard and screen-reader behaviour are tested.
-   [ ] Existing scoring, privacy, RBAC, audit and API tests still pass.
-   [ ] Evaluation limitations remain documented honestly.

------------------------------------------------------------------------

## 13. Claude Code final response format

When implementation is complete, report:

1.  **Files changed** --- list paths and what changed.
2.  **Routes changed/added** --- public, victim and staff.
3.  **Components reused** --- and components newly created.
4.  **Backend/API changes** --- explicitly say "none" if none.
5.  **Data-model changes** --- explicitly say "none" if none.
6.  **Privacy review** --- how consent, audio, quick exit, caching and
    sensitive content were handled.
7.  **Tests run** --- commands and pass/fail results.
8.  **Manual checks still needed** --- especially screen reader,
    native-language review, low-end Android and real microphone testing.
9.  **Known gaps** --- do not hide incomplete functionality.
10. **Next recommended task** --- one concrete next step.

Do not claim completion for features that are only mocked, visually
represented or not connected to the backend.

**End of implementation checklist.**
