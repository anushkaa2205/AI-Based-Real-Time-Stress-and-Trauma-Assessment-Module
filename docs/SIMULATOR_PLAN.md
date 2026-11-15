# NHAA Simulator: Design Plan

> Status: agreed plan, not yet built. Companion to `REQUIREMENTS.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md` and `IMPLEMENTATION_PLAN.md`. Project rules: `/CLAUDE.md`.

## Purpose

The simulator lets an audience watch the module work without a connection to the real NHAA systems. Our project is a module, not a product a victim opens, so on its own there is nothing to look at. The simulator supplies the missing part: made-up cases arriving through each NHAA channel, and the desks of the people who act on the result.

After eight minutes, someone who has never heard of the project should be able to say three things:

1. A victim only talks or types. They never see the module.
2. The module reads the voice and the words, and tells staff how distressed the person is and why.
3. The most at-risk person is seen first, and the right help is proposed to the right office.

## Core idea

The simulator plays the part of NHAA; the module does real analysis. Nothing shown as a result is pre-written.

- **The simulator** holds a library of synthetic cases (recordings, chat messages, keypad sessions) and sends each one to the module through the existing integration API (`/api/v1/integration/*`), exactly as NHAA's call centre or portal would.
- **The module** analyses the audio and text with the existing pipeline and returns the SVI, risk band, indicators with evidence, and recommendations.
- **The simulator** then shows that result as an analysis report, and shows what each stakeholder would see afterwards.

This also proves the "module" claim: the simulator is just one client of the API, and NHAA's real systems would be another.

Working name: **NHAA Simulator**. Because the module has no screen of its own, the simulator **is the website's home page** (`/`). The victim start, consent and chat pages move to `/portal` and act as the simulated NHAA portal/chatbot channel. Staff pages stay where they are and are shown as the "behind the scenes" desks.

Access (decided with the team):

- **Home page:** public, no sign-in, no case data.
- **Case lists and analysis reports of played simulator cases:** public, no sign-in. Reports are served by a read-only endpoint that returns only cases tagged as simulator cases (404 for anything else), so no real case can be read this way.
- **Playing a case:** a signed-in staff member only, because each play creates real records in the database and uses the free AI quota.
- **Desks:** each desk needs a sign-in **as that role**, made from the Sign in button in the top bar. The presenter signs out and in again to show another desk. No auto-login, shared session or policy bypass.

## App structure

Three areas, in the order a case travels: it comes in, it is analysed, it goes out.

| Area | Tabs | What the presenter does there |
| --- | --- | --- |
| **Inbound** (where cases arrive) | Phone call, IVRS, Chatbot, Mobile app, Portal | Picks a case from the tab's list and presses Play |
| **Analysis report** (what the module understood) | One report per case | Reads out the summary, risk level and reasons |
| **Outbound** (who sees what) | Counsellor, Police, Welfare, District, Ministry | Shows what each office receives, and what it does not |

Fixed parts of every screen:

- **Top bar:** project name, a permanent "Simulation: synthetic data only" label, a module status light (AI service on or off), and Reset demo.
- **Left rail:** Inbound tabs on top, Outbound desks below, separated by a rule. A small counter next to each desk shows how many items are waiting there.
- **Case strip:** once a case has been played, a thin strip under the top bar keeps it in view (docket number, channel, band).

A **presenter mode** hides the left rail and adds Next and Back, stepping through the fixed running order in "Presentation flow". This is the mode used on stage.

## Home page

The home page (`/`) is the simulator's front door. In about 30 seconds it tells the audience the problem, what the module does, and where to look.

Top to bottom:

1. **Top bar:** 14566 mark, "NHAA Simulator", module status light (AI service online or offline), the red Simulation stamp, and Sign in / staff name.
2. **Title and one sentence:** "A stress and trauma assessment module for the National Helpline Against Atrocities. It listens to callers through every NHAA channel and tells staff who is most at risk, why, and what help to send."
3. **Today vs with the module:** two ruled columns. Today: call becomes a docket number, first come first served, nobody records how the person is. With the module: risk level and reasons, most at risk seen first, help proposed to the right office.
4. **The three-part map:** Cases come in (Call, IVRS, Chat, App, Portal) → Module reads (voice and words → risk and reasons) → Help goes out (Counsellor, Police, Welfare, District, Ministry). Each part links to its tabs.
5. **Actions:** Start presentation (presenter mode), Explore cases, Reset demo.
6. **Footer:** "Synthetic cases only. The caller never sees this module."

Not on the home page: statistics walls or number cards, a login form, the victim language picker, images of people, robots, brains or government emblems.

## Case library

Twelve synthetic cases cover every channel and every risk band. Expected bands are targets: each case is run through the module during the build, and the script is adjusted if the real result differs. Never adjust scoring to fit a case.

| # | Channel | Case | Language | What it proves | Expected band |
| --- | --- | --- | --- | --- | --- |
| C1 | Phone call | Asks for the status of a land complaint, calm voice | Hindi | The module does not over-react | Low |
| C2 | Phone call | Pressured daily to withdraw the case, long pauses, cannot sleep | Hindi | Intimidation plus voice strain | High |
| C3 | Phone call | Accused standing outside the house now; indirect words about not being around | Hindi | Immediate danger and indirect suicidal language | Critical |
| C4 | Phone call | The same sentence spoken twice, once calm and once shaking | Hindi | Voice changes the reading when words are identical | Two different readings |
| C5 | IVRS | Night call, keypad answers, short spoken answer after the beep | Hindi | Works with no operator and a basic phone | Moderate |
| C6 | IVRS | Keypad answer "not safe right now" | Marathi | Safety override from a key press | High or above |
| C7 | Chatbot | Social boycott, children kept from school, constant fear | Hinglish | Romanised Hindi, isolation and fear from text | Moderate |
| C8 | Chatbot | Says clearly they have no thoughts of self-harm, asks for protection | Hindi | Understands "no"; flags protection need only | Moderate |
| C9 | Mobile app | Voice note plus a typed follow-up message | Hindi | Voice and text combined in one case | High |
| C10 | Mobile app | Short routine follow-up message | English | Second Low case for the queue contrast | Low |
| C11 | Portal | Written complaint after displacement from the village | Tamil | Regional language, long narrative | High |
| C12 | Portal | Written complaint, family member of a deceased victim | Bengali | Regional language, extreme vulnerability | High |

Rules for every script: fully made up, no real names or places below state level, respectful, and no graphic detail. Each script is reviewed by a second team member before recording.

## Analysis report

One page: the input on the left, what the module made of it on the right. It fills in live while the case plays, then stays as a finished report.

**Left side: the input**

- Phone and IVRS: an audio player with a waveform and a moving playhead. The transcript appears line by line as the audio plays, with an English translation under each line.
- Chatbot and app: messages appear one at a time, as a chat.
- Portal: the written complaint as a document.

**Right side: the reading, top to bottom**

1. **Verdict line.** Risk band in words and colour, the SVI number, and one plain sentence of explanation (from `core/scoring/explain.ts`).
2. **Summary.** Two or three neutral sentences on what the person reported.
3. **Signals found.** The eight indicators as short horizontal bars. Each one that fired opens to show the exact words that triggered it. Hovering a signal highlights those words in the transcript.
4. **Voice reading** (audio cases only). A timeline under the waveform marking long pauses, unstable or flat pitch, and the emotion estimate. A note states that voice supports the reading and never decides it alone.
5. **Risk over time.** A small line showing the SVI through the call, with a marker where the band changed.
6. **Proposed help.** One row per recommendation: type, reason, urgency, responsible office, status "Waiting for counsellor approval".

Footer on every report: "Decision support for staff. The caller does not see this." For C3, a small inset shows the only thing the victim's screen displays: the emergency help panel.

C4 uses a split report: two columns, same transcript, different voice readings side by side.

## Stakeholder desks

Each Outbound tab shows one office's view of the same cases. Desks reuse the existing staff components inside the simulator. A desk opens only when the presenter is signed in as that desk's role (Sign in button in the top bar); every desk's data goes through the same server-side policy checks (`core/policies`) for that role.

| Desk | What it shows | What it never shows | Point to make |
| --- | --- | --- | --- |
| Counsellor | All played cases sorted by risk, with an arrival-order toggle; case page with evidence; approve or reject each proposal; correct an indicator | Nothing hidden, given consent | The last caller can be first in line; a human decides |
| Police | Short action requests: what to do, where, by when | Story, transcript, indicators, SVI | Minimum information needed to act |
| Welfare | Relief, rehabilitation, medical and legal-aid referrals with status | Story, transcript, indicators | Help is routed by need |
| District | Open High and Critical cases, pending referrals, missed deadlines | Names and narratives | Follow-through is tracked |
| Ministry | Counts by band and district, response times, demand against counsellor capacity | Anything about an individual; small counts hidden | Resources go where distress is |

Two details carry the story on stage:

- **The queue toggle.** Switching the counsellor queue between "arrival order" and "risk order" shows C3 moving from last to first.
- **The locked door.** On the Police desk, a "View full case" link that returns "Access refused" (a real 403 from the API).

## Visual theme

Theme: **"case file"**. It should look like a working government office tool (paper, ink, ruled tables, docket numbers), not a startup dashboard.

**Colour**

| Role | Colour | Used for |
| --- | --- | --- |
| Paper | Warm off-white `#F4F1EA` | Page background (already used in the victim pages) |
| Ink | Deep navy `#1B2A41` | Text, top bar, primary buttons (matches the existing 14566 badge) |
| Rule | Warm grey `#CFC8BA` | Table lines, dividers |
| Stamp | Brick red `#A63A2B` | One accent only: the simulation label, the Critical alert |
| Low | Grey-green `#5F7A61` | Risk band |
| Moderate | Ochre `#B8860B` | Risk band |
| High | Burnt orange `#C2571A` | Risk band |
| Critical | Brick red `#A63A2B` | Risk band |

Band colours are muted, always shown with the word, and used nowhere else. Check every text/background pair for WCAG AA contrast and adjust shades if needed.

**Type**

- Headings: Noto Serif.
- Body and tables: Noto Sans (with Noto Sans Devanagari, Tamil and Bengali so every transcript looks like one family).
- Docket numbers, timestamps and the SVI: IBM Plex Mono.
- Load fonts with `next/font` (self-hosted, no runtime calls to external font servers).

**Layout habits**

- Ruled tables and plain rows instead of floating cards. Square or barely rounded corners, thin lines, no shadows.
- Dense but calm: generous line height, left-aligned, strong top-to-bottom reading order.
- The Simulation label is a rubber stamp, slightly rotated, in brick red. Each report has a docket header like a file cover: number, channel, date, language.
- Evidence shown as highlighter marks on the transcript, in the band's colour.
- Motion only where it means something: the playhead, the SVI line growing, a row moving up the queue. Respect `prefers-reduced-motion`.

**Avoid (so it does not look generated)**

- Purple or blue gradients, glow, glass panels, dark neon "AI" styling.
- Emoji as icons, sparkle icons, robot or brain illustrations.
- A grid of identical rounded cards with big numbers.
- Marketing copy. Labels are plain and specific: "Proposed help", "Waiting for counsellor approval", "Access refused".
- Any imitation of a real government emblem or the actual NHAA website.

## Presentation flow

About eight minutes; one idea: three cases come in, the most serious arrives last, and it is seen first.

| Step | Time | Screen | What the audience sees | Say |
| --- | --- | --- | --- | --- |
| 1 | 0:45 | Opening screen | Today: a call becomes a docket number in a first-come queue | "Nobody records how the person is." |
| 2 | 1:00 | Phone call, C1 | Calm call plays; report settles at Low | "It does not raise an alarm for everyone." |
| 3 | 1:00 | Chatbot, C7 | Hinglish messages appear; fear and isolation marked; Moderate | "It works on text and mixed language too." |
| 4 | 1:30 | Phone call, C3 | Distressed call; SVI climbs; the sentence about the accused outside is highlighted; Critical; victim inset shows only help numbers | "She never said the word. It still understood." |
| 5 | 0:45 | Phone call, C4 | Same words, two voices, two readings | "This is the voice analysis, not just the text." |
| 6 | 1:00 | Counsellor desk | Toggle arrival order to risk order: C3 moves from last to first; approve police intervention | "A person approves every action." |
| 7 | 0:45 | Police desk | A three-line task; "View full case" is refused | "Each office sees only what it needs." |
| 8 | 0:30 | Ministry desk | Counts by district and band | "This is how resources get allocated." |
| 9 | 0:45 | Closing screen | Evaluation numbers, the list of things the AI never does, and the API page | "NHAA's systems would plug in the same way the simulator does." |

Optional: switch the AI service off and replay C3. It is still flagged by the safety lexicon and marked "limited confidence".

## Honesty and safety rules

- **Real analysis only.** Every number and indicator on a report comes from the module when the case is played. No stored or hand-written results. If the AI service is down, the report says "limited confidence".
- **Always labelled.** The Simulation stamp is on every simulator screen and cannot be turned off. Demo cases are tagged in the database and excluded from real analytics.
- **Synthetic data only.** Scripts invented, respectful, non-graphic. Recordings by team members or text-to-speech; never real caller audio.
- **Same privacy rules.** Desks go through the same server-side permission checks as the real staff screens. No shortcut.
- **Sign-in where it matters.** The home page, case lists and reports of simulator cases are public (synthetic data only). Playing a case and every desk need staff sign-in; each desk needs its own role.
- **Voice stays in its place.** Voice signals support the reading and cannot make a case Critical alone (FR-VOI-08).
- **Reset removes only demo data.** Reset demo deletes cases tagged as simulator cases and nothing else.

## Build plan

1. **Update the spec.** Add the simulator to `REQUIREMENTS.md`, `ARCHITECTURE.md` and `IMPLEMENTATION_PLAN.md` as a new phase (docs first).
2. **Case library.** Write the twelve scripts and metadata under `evaluation/simulator/`; schema + validator.
3. **Audio.** Text-to-speech for C1 and IVRS prompts (free option only). Team recordings for C2, C3, C4 (two takes) and the C9 voice note; placeholders until they exist.
4. **Shell and playback.** Home page at `/` (see "Home page"), victim pages moved to `/portal`, simulator layout, Inbound tabs, case lists, a player that streams each case to the module through the integration API in real time (5 s audio windows, like a live call).
5. **Report and desks.** Report page, then the five Outbound desks from existing staff components, the queue toggle, and Reset demo.
6. **Theme, presenter mode, rehearsal.** Apply the theme, add the running order, run every case, tune scripts until bands match, record a fallback video.

**Team-only tasks**

- [ ] Record C2, C3, both takes of C4, and the C9 voice note (quiet room, 20–60 s each)
- [ ] Review the twelve scripts for tone and respect
- [ ] Native speaker check of C6, C11, C12
- [ ] Rehearse the eight-minute flow twice with a timer

**Open decisions**

- Name on screen: "NHAA Simulator", or the project's final name.
- Voice-first victim flow in the main app: now or after the simulator (simulator does not depend on it).
- Text-to-speech for calm cases, or record everything.
