# Nivara: public flow and UI redesign plan (Phase N)

**Written:** 16 November 2026, for the first deployment.
**Based on:** Anushka's decisions of 16 Nov 2026 and a read of the repository at commit `2b72215`.
**Where it wins:** on the website flow, the demo and the look, this file wins over `PRODUCT_VISION.md`, `CLAUDE.md`, `API_CONTRACTS.md` and `IMPLEMENTATION_PLAN.md` until task N.1 brings those documents into line. Everything it does not mention stays as it is.

**How to use it:** give Claude Code one task at a time from section 10 ("task N.3"). Do N.1 first, because `CLAUDE.md` tells Claude Code to stop when code and docs disagree. Commits carry no Claude co-author line.

---

## 1. The change in short

Today `localhost:3000` redirects to the staff login, the demo is hidden behind a supervisor sign-in, and the screens look plain. After this phase:

1. `/` is a public home page with a hero, and the demo starts from that hero.
2. The navbar has a **Staff login** button.
3. Anyone can file a demo case by typing, speaking or playing a recording. The demo page shows **no result**. When the person finishes, it says the case is registered and gives the **docket ID**.
4. The person can **track the case** with the docket ID.
5. Staff sign in on the **one login page**. Each role's credentials open that role's own portal, where the filed case and its assessment appear.
6. The whole site gets a new look and the name **Nivara**.

---

## 2. Decisions (Anushka, 16 Nov 2026)

| # | Decision |
|---|---|
| N-D1 | `/` shows a public home page with a hero. It no longer redirects to `/login`. |
| N-D2 | The navbar carries a **Staff login** button. |
| N-D3 | The demo is **public**: no sign-in needed. |
| N-D4 | The demo shows **nothing** about the assessment. It only confirms that the case is registered and shows the docket ID. |
| N-D5 | A public **track your case** page takes a docket ID and shows the case **status plus the support that has been arranged**, in plain words. Never the score, band or warning signs. |
| N-D6 | **AI-generated conversation is removed.** Three demo inputs remain, all public: live text, live microphone, recorded audio. |
| N-D7 | One login page for all staff. The role decides which portal opens. |
| N-D8 | The assessment is shown only in the staff portals, each role seeing what its role allows. |
| N-D9 | The UI is redesigned. It must look like a real product, be appealing, and not look machine-made. Direction left to Claude (section 9). |
| N-D10 | The product name is **Nivara**. It replaces the placeholder "NHAA Assist". |

---

## 3. Earlier decisions this overrides

Each row is a real clash with something written in the repository. All are overridden on purpose.

| Earlier decision | Where it is written | New rule |
|---|---|---|
| "There is no victim website"; `/` redirects to `/login` (Q3, D8, task M.2) | `PRODUCT_VISION.md` §4, §10; `CLAUDE.md`; `IMPLEMENTATION_PLAN.md` D8; `web/src/app/page.tsx` | `/` is a public home page. It belongs to the **demo input layer**, not to the module. The module still has no victim website of its own, and it still works with the demo switched off. |
| Only a signed-in NHAA supervisor may use the demo (`demo.use`) | `API_CONTRACTS.md` §6.5 and §4; `core/demo/route.ts`; the four `(staff)/demo` pages | The demo pages and `/api/demo/*` are public, protected by the limits in section 7. |
| The demo has a results view (score, band, indicators, timeline, request IDs, expected labels) | `PRODUCT_VISION.md` §7 and §12; `components/demo/results-panel.tsx`, `use-module-results.ts` | Removed from the demo. The staff case screens are the only place results appear. |
| Four demo modes, including generated text (task M.13) | `PRODUCT_VISION.md` §6; `REQUIREMENTS.md` line 51; `API_CONTRACTS.md` §6.5, §8.3a | Three modes. Generated text is deleted from the web app and the analysis service. |
| No tracking page exists; the person never gets anything back | `PRODUCT_VISION.md` §3 | The demo layer gains a tracking page (N-D5), fed by a new read-only integration endpoint. |
| Project name TBD, placeholder "NHAA Assist" (D2) | `CLAUDE.md`; `IMPLEMENTATION_PLAN.md` D2; layouts and login page | Nivara. |
| One theme: "ink-navy on warm paper, small corner radii, Noto Sans" | `web/src/app/globals.css` | Replaced by the design in section 9. |
| A new live microphone call ends any older one | `api/demo/interactions/route.ts` | With a public demo a stranger could cut off a presenter. Replaced by the "line busy" rule in section 7. |

## 4. What does not change

- The module, the scoring, the safety rules and the integration API's existing endpoints.
- All twelve rules in `CLAUDE.md`. In particular: rule 1 (no score, band or indicator on any public screen), rule 2 (the AI never talks to the person), rule 6 (consent before analysis), rule 8 (police and welfare see referrals only), rule 11 (synthetic data only).
- Staff roles, permissions and what each role's API returns.
- The demo calls the module only through the integration API with its own demo key, and every case it creates is marked **Demo** on staff screens.
- Staff sign-in rules, including the authenticator code for supervisor and admin roles.
- Everything stays free. No new paid service and no new npm dependency.

---

## 5. Site map and flow

| Route | Who | What it is |
|---|---|---|
| `/` | Public | Home page: hero with the demo starter, how it works, who sees what, track a case |
| `/demo/text` | Public | Demo input 1: type as the person (stands in for NHAA's chatbot) |
| `/demo/call` | Public | Demo input 2: speak into the microphone (stands in for a helpline call). Today's path is `/demo/live-call` |
| `/demo/recording` | Public | Demo input 3: play a library recording or upload a WAV. Today's path is `/demo/recorded` |
| `/track` and `/track/<docket>` | Public | Track a case by docket ID |
| `/login` | Staff | The one sign-in page |
| `/staff` | Staff | Sends each role to its own portal (already built) |
| `/operator`, `/counsellor`, `/approvals`, `/district`, `/police`, `/welfare`, `/analytics`, `/admin`, `/admin/audit` | Staff, by role | The portals (already built, restyled in N.10) |
| `/demo/generated`, `/demo` (mode chooser inside the staff area) | – | Deleted. The home page hero is the mode chooser now |

```text
PUBLIC                                                   STAFF
------                                                   -----
  /  (home, hero)
  |-- Type a message ----> /demo/text ------+
  |-- Speak -------------> /demo/call ------+--> consent -> input -> "Finish"
  |-- Play a recording --> /demo/recording -+                         |
  |                                                                   v
  |                                              "Your case is registered"
  |                                               Docket NHAA-2026-MH-004512
  |                                               [Copy] [Track this case]
  |                                                                   |
  |-- Track a case ------> /track/<docket>  <-------------------------+
  |                         status + support arranged
  |
  +-- Staff login -------> /login --> /staff --> the role's own portal
                                                  (the case is already there, marked Demo)
```

Behind the scenes nothing changes: demo page → `/api/demo/*` → integration API with the demo key → module → staff dashboards.

---

## 6. Screen by screen

### 6.1 Navbar (all public pages)

- Left: the Nivara wordmark, linking to `/`.
- Middle: **How it works** (anchor on the home page), **Track a case** (`/track`).
- Right: **Staff login** button, linking to `/login`. If a staff member is already signed in it reads **Open my portal** and links to `/staff`.
- On small screens the middle links fold into a menu; the Staff login button stays visible.

### 6.2 Home page `/`

1. **Hero.** Left side: a short label ("Assessment module for the NHAA helpline 14566"), a headline, and two sentences on what Nivara does. Right side: the **demo starter card** with three choices: *Type a message*, *Speak*, *Play a recording*. Choosing one opens that demo page. The demo is the hero's main action, as asked.
2. **How it works.** Three steps in words: NHAA's own channel sends what the person said or wrote; Nivara finds warning signs and works out urgency with rules plus AI; trained staff see the most urgent people first and approve any action.
3. **Who sees what.** One line per staff role (operator, counsellor, supervisor, district officer, police liaison, welfare officer). This doubles as the presenter's talking points.
4. **Track a case.** A docket ID field that opens `/track/<docket>`.
5. **For integrators.** One short block linking to the existing API documentation at `/api/docs`.
6. **Footer.** "Demonstration. Do not enter real names, numbers or addresses." and "If you need help, call 14566." Problem statement credit SIH26093.

Rules for this page: no score, band, indicator or sample staff screenshot anywhere on it (rule 1). No invented statistics, testimonials or partner logos (`PRODUCT_VISION.md` §9, honest claims).

When `DEMO_ENABLED` is not `true`, the home page still renders, the demo starter and the track field are hidden, and the page shows only the description and the Staff login button. The module is unaffected (FR-API-05).

### 6.3 Demo pages (three inputs)

Common to all three:

- **Step 1, consent.** The existing consent choices (`components/demo/consent-fields.tsx`) and a language choice, plus a **district** choice (see 8.4). Nothing is analysed before consent (rule 6).
- **Step 2, input.** The person gives their input. The page shows only that each piece was **received**. It shows no score, band, indicator, transcript, timeline, request ID or expected label.
- **Emergency help panel.** If the module answers with `showEmergencyPanel`, the page shows the scripted emergency options. This is the one risk signal rule 1 allows and it is already built. (See open point 3.)
- **Step 3, finish.** A **Finish and register** button ends the interaction. The page then shows: "Your case is registered", the docket ID in large type, a **Copy** button, **Track this case**, and **File another**.
- A slim "Demonstration, synthetic data only" notice stays on every demo page (rule 11).

Per input:

| Input | Page | What the person does | What is kept from today |
|---|---|---|---|
| Live text | `/demo/text` | Types messages as the person. Can tap one of NHAA's scripted questions to ask it "as the chatbot", then answer it. Can load a sample conversation from the library and replay it. | `live-text-demo.tsx` without the results panel. The questions are still the scripted `operatorQuestions`; no AI writes any reply (rule 2). |
| Live microphone | `/demo/call` | Presses the microphone button and speaks. Sees a timer and a "listening" state. | `live-call-demo.tsx` and `components/audio/live-recorder.tsx`. 5-second windows, caller's voice only, audio never stored. |
| Recorded audio | `/demo/recording` | Picks a library recording or uploads a WAV (up to 4 MB). Sees a progress bar ("sending 7 of 24"). | `recorded-audio-demo.tsx`, the WAV cutting step and the library. Transcripts are no longer sent to the browser. |

The scenario library's `expected` labels are test metadata. They must no longer be sent to the browser at all.

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
- Never shows: score, band, urgency, indicators, transcript, staff names, notes, district, or anything diagnostic (rule 1).
- Works only for cases created by the demo key. Any other docket, or a wrong one, gets the same neutral "No demo case found with this number".
- All wording lives in `web/messages/*.json` (project convention for person-facing text). `npm run i18n:check` needs the keys in all five languages; the four non-English versions are drafts that need native review.

### 6.5 Login `/login`

- Behaviour stays as built: e-mail and password, then the 6-digit authenticator code for roles that need it, then `/staff`, which sends the role to its own portal.
- New: restyled (section 9), reachable from the navbar, has a "Back to home" link, and a signed-in visitor who opens `/login` is sent straight to `/staff`.
- Credentials are never shown on any public page. The seeded demo accounts are `<role>@demo.nhaa.test` (for example `counsellor@demo.nhaa.test`); passwords and authenticator links are in `web/.seed-output/`, which is git-ignored.

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

---

## 7. Safeguards for a public demo

A public demo on a free tier needs limits, or one visitor can use up the Groq quota, flood the staff queues or block the presenter.

| Safeguard | Rule (starting values; keep them as named constants) |
|---|---|
| Kill switch | `DEMO_ENABLED=true` and a valid `DEMO_API_KEY` are still required. Otherwise every `/demo` page and `/api/demo/*` route answers 404. |
| Per-visitor limits (by IP, through `lib/ratelimit.ts`) | New cases: 5 per 10 minutes. Text messages: 30 per minute. Recordings: 3 per 10 minutes. Tracking lookups: 20 per minute. |
| Daily cap | 150 demo cases per day across all visitors. Over the cap the demo starter shows "The demo is resting, please try later". |
| Per-case caps | 40 messages per case; 2,000 characters per message (exists); a live call ends itself after 3 minutes; uploads up to 4 MB (exists). |
| Own cases only | A signed, http-only cookie lists the interactions this browser started. Every `/api/demo/interactions/{id}/…` call is refused unless the id is in that cookie. Signed with a key derived from `AUTH_SECRET`; no new secret and no new dependency. |
| Same-site only | POST requests to `/api/demo/*` are refused unless the `Origin` header is this site. |
| Nothing leaks | Public responses carry only what the page needs: `{ ok, showEmergencyPanel }`, the emergency options, progress counts and, at the end, the docket ID. No module body, case id, request id, timing, transcript or expected label. |
| Live microphone line | One live call at a time (free-tier limit, unchanged). A newcomer no longer ends the current call. They see "The line is busy, try typing or come back in a few minutes". A call with no audio for 20 seconds counts as over and frees the line. A signed-in supervisor can take the line over, so a presenter is never blocked. |
| Synthetic data | The notice on every demo page, and the footer line, tell people not to enter real details. Audio is never stored. The existing PII redaction still runs before any AI call. |
| Bundle check | Public pages must not import staff components or score labels. `npm run security:bundle` must still pass. |

---

## 8. Server and API changes

### 8.1 Remove generated text (N-D6)

Delete: `app/(staff)/demo/generated/`, `components/demo/generated-text-demo.tsx`, `app/api/demo/generate/`, `DemoGenerate` and `GENERATE_CATEGORIES` in `contracts/demo.ts`, the `GENERATED_TEXT` mode, its part of `tests/e2e/demo-live.spec.ts`, and in the analysis service `app/text/generate.py`, the `POST /v1/demo/generate` route in `app/main.py`, its tests and its circuit breaker.

### 8.2 New integration endpoint: case status

`GET /api/v1/integration/cases/{docketNumber}/status`, new scope **`status:read`**.

- Returns `{ docketNumber, status, registeredAt, updatedAt, support: SupportType[] }` where `support` lists the types of recommendations that are `APPROVED` or `AUTO_TRIGGERED`.
- Only for cases created by the calling API key (same ownership check as `core/integration/owned.ts`). Anything else is `404`.
- Must never include score, band, urgency, indicators or staff details. A unit test asserts the exact set of keys.
- This is an additive change: `X-Contract-Version` becomes `1.2`.
- The demo key gets `status:read` (update `scripts/create-api-client.ts --demo` and re-issue or update the demo client).

This keeps the rule that the demo reaches the module only through the integration API, and it is something a real NHAA portal could use too.

### 8.3 Public demo routes

- Replace `demoRoute` (staff sign-in plus `demo.use`) with a public wrapper that applies section 7: kill switch, origin check, rate limit, ownership cookie, trimmed response.
- `POST /api/demo/interactions`: accepts `mode` (`LIVE_TEXT`, `LIVE_AUDIO`, `RECORDED_AUDIO`), `language`, `consent`, `districtCode`, optional `scenarioId`. Returns `{ interactionId }` only. The docket ID is returned by `…/end`, so it appears when the person finishes.
- `…/messages`, `…/audio`, `…/recording`, `…/end`, `GET /api/demo/library`: same paths, trimmed responses. The recording stream sends progress events without transcripts. The library answer has no `expected` field.
- New `GET /api/demo/track?docket=…`: calls the endpoint in 8.2 with the demo key.
- `demo.use` stays in the permission list for one purpose only: a supervisor taking over the live microphone line.

### 8.4 District on demo cases

Today the demo starts every case with `districtCode: null`. The district officer, police liaison and welfare officer are seeded in **Pune (`MH-PUN`)** and their screens filter by district, so demo cases will not reach those three portals. (Read from the code, not yet run; N.4 confirms it with a test.)

Fix: the consent step has a district choice listing the seeded districts, default Pune. The demo passes it as `districtCode`. The docket then also carries the real state code (`NHAA-2026-MH-…` instead of `NHAA-2026-XX-…`).

### 8.5 Pages and proxy

- Move the demo pages out of the `(staff)` route group into a public group with its own layout (navbar and footer). `/demo/live-call` becomes `/demo/call`, `/demo/recorded` becomes `/demo/recording`.
- `web/src/app/page.tsx` becomes the home page.
- `web/src/proxy.ts` needs no new entries: it lists staff paths only, and `/demo` was never in it.
- Delete `components/demo/results-panel.tsx`, `use-module-results.ts` and whatever in `components/demo/labels.ts` only they used.
- Replace "NHAA Assist" with "Nivara" in `app/layout.tsx` metadata, the staff layout and the login page.

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
| `--ink-3` | `#7A8290` | Hints, captions |
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
- **Demo pages:** one centred column, a three-step indicator (Consent, Your input, Registered), large comfortable controls. The confirmation screen makes the docket ID the largest thing on the page.
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

Each task ends with `npm run typecheck && npm run lint && npm test` passing, as `CLAUDE.md` requires.

- [ ] **N.1 Docs to the new spec.** `PRODUCT_VISION.md` (§3 diagram, §4 victim-website row, §6 three public modes, §7 results view removed, §10 decisions N-D1 to N-D10, §12 definition of done); `CLAUDE.md` (name Nivara; "no victim website" restated as "the public site is part of the demo layer"; repository layout); `REQUIREMENTS.md` (line 51 mode list, demo requirements, tracking page); `API_CONTRACTS.md` (§6.5 rewritten, new status endpoint, §8.3a removed, §4 matrix, §10 map); `ARCHITECTURE.md`; `TOOLS_AND_COSTS.md` (fonts, public use of the Groq quota); `IMPLEMENTATION_PLAN.md` (D2 decided, D8 note, M.13 marked removed, new Phase N with these tasks and a status row). *Done when* no document says `/` redirects to login, the demo needs a supervisor, or there are four modes.
- [ ] **N.2 Remove generated text.** Section 8.1. *Done when* no `generate` route, page, contract or test remains in `web/` or `analysis-service/`, and pytest passes.
- [ ] **N.3 Case status endpoint.** Section 8.2, with unit tests for the key set, ownership and scope, an OpenAPI entry, and contract version 1.2.
- [ ] **N.4 Public demo API.** Sections 7, 8.3 and 8.4: public wrapper, limits, ownership cookie, origin check, trimmed responses, district choice, live-line rule, track route. Unit tests for each safeguard; a test that a demo case with district Pune reaches the district, police and welfare queues.
- [ ] **N.5 Design foundation.** Section 9.3 to 9.5: tokens in `globals.css`, the `navy` to `brand` rename, fonts in `app/layout.tsx`, shared button, field, card, tag, table and band styles. *Done when* every existing screen picks up the new palette and type without layout breakage.
- [ ] **N.6 Public shell and home page.** Sections 6.1 and 6.2: public layout, navbar, footer, home page, Nivara name everywhere.
- [ ] **N.7 Public demo pages.** Section 6.3 and 8.5: move the three pages, remove the results panel and the staff-area mode chooser, add the confirmation screen, remove "Demo input layer" from the staff sidebar.
- [ ] **N.8 Track page.** Section 6.4, wording in `messages/*.json` for all five languages (non-English marked as drafts in `TRANSLATION_REVIEW.md`).
- [ ] **N.9 Login.** Section 6.5: restyle, back link, signed-in redirect. Check every seeded role lands on its portal.
- [ ] **N.10 Staff portals restyle.** Section 9.6: shell, case queue, case detail, operator console, approvals, referral queues, district, analytics, admin, audit. No permission or data changes.
- [ ] **N.11 Tests and checks.** Rewrite `tests/e2e/demo.spec.ts` and `demo-live.spec.ts` for the public flow (file a case signed out, get a docket, track it, sign in as counsellor and find it); update `staff-nav.test.ts`, `route-guards.test.ts`, `openapi.test.ts`; extend `accessibility.spec.ts`; run `npm run security:bundle` and `npm run i18n:check`.
- [ ] **N.12 Deployment prep.** Section 12. This feeds the deferred deployment tasks 9.9 to 9.11.

N.1 to N.4 and N.6 to N.9 give the full working flow. N.5 changes the look everywhere at once. N.10 is the largest task and can be split per portal.

---

## 11. The presentation, step by step

1. Open the site. The home page explains Nivara in one screen.
2. In the hero, choose an input and file a case: type a few messages, or speak, or play a recording. Point out that the page shows no score: the person only gets a docket ID.
3. Copy the docket ID. Open **Track a case** and show "Registered".
4. Click **Staff login**. Sign in as the **counsellor**. The case is at its place in the queue, most urgent first, marked Demo. Open it: score, band, the exact words behind each warning sign, proposed support.
5. Approve a proposal.
6. Sign in as **police liaison** or **welfare officer** (in another browser profile, to stay signed in as both): only the referral appears, nothing else.
7. Sign in as **district officer**: the case appears for its district.
8. Go back to **Track a case**: it now shows "Support arranged" and what was approved.
9. Optional: sign in as **operator** before step 2 in a second window, to show a live call appearing while it happens.

---

## 12. First deployment checklist

- [ ] Vercel environment: `DEMO_ENABLED=true`, `DEMO_API_KEY` (a demo client with `status:read`), `REALTIME_DRIVER=pusher` with the Pusher keys, and the existing variables from `CLAUDE.md`.
- [ ] Run `npm run db:indexes` and `npm run seed` against the deployment database. Keep `web/.seed-output/` private.
- [ ] Set up the authenticator app for the supervisor (and any admin role you will show) from the seed output before the presentation.
- [ ] The analysis service runs on a team laptop behind a Cloudflare tunnel. Start it, copy the tunnel URL into `ANALYSIS_URL` and redeploy or update the variable. If the laptop is off, text cases still register and are scored by the safety rules alone (fallback mode); voice analysis will not work.
- [ ] Recorded audio: see open point 1. Without a decision the recording page offers upload only.
- [ ] Check the recording stream finishes within your Vercel plan's function time limit with a two-minute file; if not, lower the upload limit.
- [ ] Try the full presentation in section 11 on the deployed site, on a laptop and on a phone.
- [ ] Confirm the limits in section 7 on the deployed site (hit the rate limit once on purpose).

---

## 13. Open points for Anushka

Work is not blocked: each has a default that the plan uses until you say otherwise.

| # | Question | Default used |
|---|---|---|
| 1 | **Library recordings.** None have been recorded yet, and `demo/library/audio/` is git-ignored ("never committed", FR-VOI-09), so the deployed site would have no library recordings. Commit the team's own synthetic recordings for the demo, or keep upload only? | Upload only on the deployed site; library works locally once recorded. |
| 2 | **Counsellor queue.** You described the counsellor seeing people "who need mental assistance" by urgency. Today the counsellor sees **every** case, most urgent first, because a counsellor is the first human to review each case. Keep that, or show only cases where counselling is proposed? | Keep every case, most urgent first. |
| 3 | **Emergency help panel on the demo.** You asked for nothing to be shown. The plan keeps one exception that the project rules already allow: the scripted emergency options when the module flags immediate danger. Keep it or remove it? | Keep it. |
| 4 | **Clearing old demo cases.** A public demo will fill the staff queues. Delete demo cases automatically after 7 days? | Not included. Say yes and it becomes a small extra task. |

## 14. Calls Claude made that you can change

- Demo URLs renamed to `/demo/text`, `/demo/call`, `/demo/recording`.
- The docket ID is revealed when the person presses Finish, not at the start.
- A district choice was added to the consent step, default Pune, so that district, police and welfare portals receive demo cases.
- The live microphone shows "line busy" instead of cutting off the current caller; a supervisor can take the line over.
- The limit numbers in section 7.
- Tracking works for demo cases only.
- The Low band is shown in neutral grey instead of green.
- Fonts: Fraunces, IBM Plex Sans, IBM Plex Mono. Brand colour petrol, accent marigold on public pages only.
- The public interface is in English for the first deployment; person-facing strings are stored in all five language files so they can be switched on later.
