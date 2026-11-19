# Evaluation Report
## AI-Based Real-Time Stress and Trauma Assessment Module (SIH26093)

Tasks 9.1–9.3 and 9.4–9.7 evidence. Measured on 15 November 2026 on the team laptop (Windows, Ryzen 7 5700U, 16 GB), web app as a **local production build**, MongoDB Atlas M0 (Mumbai), analysis service local. All data synthetic.

> **Status of the labels.** The 62 scenarios are labelled by one author. Every label stays a **draft until a second team member agrees** (AC-EVAL-01, task E.3). The regional-language (Marathi, Tamil, Bengali) text, lexicon rules and scenarios are also drafts pending native-speaker review. Read every number below with that in mind.

Raw outputs: `evaluation/reports/` (`with-ai.md/json`, `rules-only-baseline.md/json`, `latency.json`, `outcomes.json`). Re-run with `npm run eval`, `npm run eval -- --mode=ai`, `npm run measure:latency`, `npm run eval:outcomes` (from `web/`) and `scripts/stt_wer.py` (from `analysis-service/`).

---

## 1. Headline results

| Criterion | Target | With AI | Rules only (fallback) | Status |
|---|---|---|---|---|
| Band accuracy (AC-RISK-01) | ≥ 80% | **79%** (49/62) | 77% (48/62) | ✗ just below — see §4 |
| Critical scenarios placed below High (AC-RISK-01) | 0 | **0** | 0 | ✓ |
| Suicidal-ideation recall (AC-NLP-01) | 100% | **100%** (8/8), precision 89% | 100% | ✓ |
| Immediate-danger recall (AC-NLP-02) | 100% | **100%** | 100% | ✓ |
| Lexicon alone flags all suicide and danger scenarios (AC-NLP-06) | 100% | — | **100%** | ✓ |
| Intimidation recall / precision (AC-NLP-03) | ≥ 85% / ≥ 70% | 100% / 89% | — | ✓ |
| Social isolation recall / precision (AC-NLP-03) | ≥ 85% / ≥ 70% | 100% / 100% | — | ✓ |
| Negation and tricky scenarios correct (AC-NLP-04) | ≥ 90% | **91%** (10/11; miss: S004) | — | ✓ |
| Romanised Hindi F1 vs English (AC-NLP-07) | ≥ 80% | 0.783 vs 0.789 (**99%**) | — | ✓ |
| Expected recommendations produced (AC-REC-01) | ≥ 85% | **96%** (88/92) | 90% | ✓ |
| All six support types recommended (AC-REC-01) | all | all six (+ information) | — | ✓ |
| Text: SVI within 3 s, p95 of 50 runs (AC-SVI-02) | ≤ 3.0 s | p50 **1.79 s**, p95 **3.43 s**, max 4.11 s | — | ✗ 0.43 s over — see §5 |
| Voice: SVI within 5 s per window (AC-SVI-02) | ≤ 5 s | **2.3–4.5 s** at normal latency; first window of a call 5.2–5.6 s on a slow-network day | — | ◐ |

## 1a. Re-run without structured answers (Phase M, 16 November 2026)

The module no longer has a questionnaire (`PRODUCT_VISION.md` §5, task M.4). The 49 scenarios that used safety-check or screener answers were rewritten as conversations: the chatbot's or operator's question (an `OPERATOR` turn, in the old screener wording and the scenario's language), then the person's reply using the exact answer they had picked ("Yes", "No", or a scale label such as "More than half the days"). Expected bands, indicators and recommendations were **not changed**. Only the person's turns are scored. Rules only (`npm run eval`), scoring config v3; the AI run (`--mode=ai`) has not been repeated yet.

| Criterion | Target | Before: config v2, with screener answers (15 Nov) | M.4 only: answers read alone | M.9 safety answers | **M.9 safety + wellbeing answers (final)** |
|---|---|---|---|---|---|
| Band accuracy (AC-RISK-01) | ≥ 80% | 77% (48/62) | 73% (45/62) | 77% (48/62) | **77% (48/62)** ✗ (unchanged) |
| Critical scenarios placed below High | 0 | 0 | 2 (S019, S053) | 0 | **0** |
| Suicidal-ideation recall (AC-NLP-01) | 100% | 100% (8/8) | 88% (7/8) | 100% | **100% (8/8)** |
| Immediate-danger recall (AC-NLP-02) | 100% | 100% (10/10) | 90% (9/10) | 100% | **100% (10/10)** |
| Expected recommendations produced (AC-REC-01) | ≥ 85% | 90% (83/92) | 76% (70/92) | 82% (75/92) | **91% (84/92)** |
| Fear/anxiety recall (detected ≥ 0.5) | — | 7/8 | — | 1/8 | **7/8** |
| Severe-trauma recall | — | 5/5 | — | 3/5 | **5/5** |
| Depression recall | — | 1/1 | — | 0/1 | **1/1** |
| Intimidation recall | — | 15/16 | — | 16/16 | **16/16** |
| False alarms (all dimensions) | — | 6 | — | — | **6** (same) |

**What happened, honestly:**
- **Reading answers alone failed the safety targets.** With the answers turned into plain "Yes"/"No" turns, three scenarios whose risk lay only in short answers dropped to Low: S019 (yes to suicidal thoughts and intent), S053 (not safe; accused nearby) and S032 (not safe). This is gap V7.
- **M.9, safety questions:** a short reply that starts with yes/no is read with the safety question asked just before it (four questions, six languages, `core/safety-lexicon/answers.ts`), with the old safety check's meaning: "no" to "safe right now" → OV-9; "yes" to "accused nearby" → OV-2; "yes" to suicidal thoughts → OV-6; "yes" to intent or plan → OV-1. Suicide and danger recall returned to 100%.
- **M.9, wellbeing questions (decided 16 Nov 2026):** the module has no questionnaire, but when NHAA's chatbot or operator asks a PHQ-2, GAD-2 or PC-PTSD-5 question in the conversation, the person's short answer is scored per item (REQUIREMENTS Appendix A): frequency / 3 for low mood and anxiety, 0.6 for a trauma "yes". Without this, fear/anxiety fell to 1/8 and counselling was missing in 10 scenarios, because the rules have no other way to read everyday distress. With it, every dimension is back to the old baseline and recommendations reach 91%, with no new false alarms.
- **Per-item, not validated totals.** The old screeners summed the items (e.g. PC-PTSD-5 positive at 3 of 5); the conversation rules score each answer on its own and the strongest counts. This is a little more sensitive (a single "yes" to one trauma item counts) and is an approximation, not the instruments' validated scoring.
- **Band accuracy is unchanged at 77%** (target 80%): the shortfall is the Moderate under-scoring described in §4, which these changes do not touch.
- **One gain:** S023 (Tamil, pressure to withdraw) now gets the police-intervention recommendation it lacked.
- **Limits:** answers are read only when the question comes as its own `OPERATOR` turn directly before the reply. On voice calls a spoken question and answer are not paired until speaker separation exists (task M.10); until then such assessments must be marked limited confidence. The AI run (`npm run eval -- --mode=ai`, which now also receives the previous question) has not been repeated. Labels are still single-author drafts.

The section 1 table above is the 15 November baseline and is kept for comparison.

## 2. Data set (E.3)

62 synthetic scenarios: **17 Low, 15 Moderate, 15 High, 15 Critical**; English 19, Hindi 15, Romanised Hindi 13, Marathi 5, Tamil 5, Bengali 5; 11 negation or indirect cases; channels chatbot, portal, voice call and IVRS; context-only and screener-only cases included (since 16 Nov 2026 the screener-only cases are conversations with short answers, tag `short-answer`; §1a). Respectful and non-graphic (C-DAT-01/03). Labels state what a counsellor would expect, not what the engine produces.

## 3. Results in detail (with AI)

### Confusion matrix (rows = expected band)
| expected \ got | LOW | MODERATE | HIGH | CRITICAL |
|---|---|---|---|---|
| LOW | 16 | 0 | 1 | 0 |
| MODERATE | **12** | 3 | 0 | 0 |
| HIGH | 0 | 0 | 15 | 0 |
| CRITICAL | 0 | 0 | 0 | 15 |

High and Critical are fully correct, and nothing is ever placed *above* High by mistake except one Low (S004, see below). **Twelve of the thirteen errors are Moderate scenarios scored Low.**

### Dimensions (detected = score ≥ 0.5)
| Dimension | Recall | Precision |
|---|---|---|
| Suicidal ideation | 100% | 89% |
| Intimidation | 100% | 89% |
| Severe trauma | 100% | 100% |
| Social isolation | 100% | 100% |
| Fear / anxiety | 100% | 57% |
| Low mood (depression) | 100% | 33% |
| Extreme vulnerability | 100% | 17% |
| Acute stress | — (not labelled) | 0% |

Every labelled sign is found; the softer dimensions are over-detected. That is the safe direction for a triage tool, but it adds noise for responders.

### Known false alarm: S004
"The counsellor asked if I would hurt myself. I would never hurt myself. I just want my land papers back." The denial ("I would never hurt myself") **is** recognised as negated by the lexicon, and that sentence on its own raises nothing. The false alarm comes from the *reported question* in the first sentence ("asked if I would hurt myself"), which both the lexicon and the AI read as a mention of self-harm, so the case is raised to High (OV-6). Kept as a documented false alarm: suppressing reported questions would also hide real disclosures such as "she asked me why I keep cutting myself", and a missed disclosure is worse than a false alarm (NFR-ETH-05). A narrower rule (a reported question *followed by an explicit denial*) is a candidate once labels are reviewed.

## 4. Why Moderate is under-scored, and what would fix it (decision needed)

The engine **detects** the right signs in the Moderate scenarios (e.g. fear 0.8, isolation 0.8), but the SVI stays at 6–21, below the Moderate threshold of 30. One strong sign in one dimension contributes at most its dimension weight (0.08–0.20) × score, and confidence and coverage reduce it further, so a single clear concern cannot reach 30 under Appendix A as written.

Lowering only the threshold does not solve it (simulated with the admin "simulate" tool, rules only, nothing written):

| Moderate threshold | 30 (current) | 20 | 15 | 12 | 10 |
|---|---|---|---|---|---|
| Band accuracy | 77% | 77% | 77% | 79% | 77% (Low cases start turning Moderate) |

**Options for the team** (Appendix A is the spec, so this is not changed in code):
1. A minimum-band rule: any dimension ≥ 0.6 from a direct statement or screener → at least Moderate (like the safety overrides, but softer).
2. Score the SVI on the strongest dimensions rather than all eight (e.g. a max-plus-weighted-rest formula).
3. Re-weight: a single dimension's contribution scaled up when confidence is high.

Each can be tried on the evaluation set with **Admin → Scoring versions → New version → Simulate** before activating. Labels must be reviewed first (backlog item 8/16).

## 5. Latency (AC-SVI-02, NFR-PERF-01/02)

- **Text** (50 synthetic messages, full pipeline incl. AI, production build, Atlas 37 ms away): p50 1.79 s, **p95 3.43 s** (target 3.0 s), max 4.11 s, 0 failures. The AI call is capped at a 2.3 s turn budget; the database transaction adds ~0.6 s. On Vercel in Mumbai (same region as Atlas) the database part should shrink; **re-measure after deployment (task 9.9)**. If still over, lowering the AI budget to ~2.0 s trades some AI coverage (more turns scored by rules first and re-scored seconds later) for speed.
- **Voice** (5-second windows, production build): 2.3–4.5 s per window across three full runs at normal network latency (Atlas 37 ms). On a slower day (Atlas 100 ms) windows took 3.5–5.4 s and **the first window of each call went over 5 s** (its pipeline does the first assessment, recommendations and alert work: ~3 s); one 16 s outlier. Found and fixed on that day: the transcript's deferred AI re-score collided with the next window's transaction; re-scores are now debounced until the caller pauses. Remaining work: fewer database round trips on a call's first window.
- **Lexicon** (NFR-PERF-04, < 50 ms per message with six rule sets): met (unit test).
- **Fixed during measurement:** the analysis service opened a new HTTP connection per request (~1 s each on Windows); now one shared client, which also speeds up text analysis.

## 6. Voice (AC-VOI-01…07)

| Check | Result |
|---|---|
| AC-VOI-01 five inserted pauses within ±0.3 s | ✓ (synthetic speech, `test_audio.py`) |
| AC-VOI-02 pitch within ±10%; flat → low variation, agitated → high variation | ✓ (generated tones) |
| AC-VOI-03 speech rate within ±15% of manual count | ✓ |
| AC-VOI-04 emotion label + confidence every window | ✓ (model or rule fallback) |
| AC-VOI-05 voice alone never Critical | ✓ structurally: worst-case voice in all eight dimensions stays below Critical (unit test); voice never carries override flags |
| AC-VOI-06 no raw audio stored without consent | ✓ (e2e checks storage) |
| AC-VOI-07 STT word error rate per language | English synthetic speech **0%** (52 words, Groq Whisper). **Other languages not measured**: needs recordings (task E.4) |

## 7. Fairness (task 9.2, AC-ETH-02, AC-LANG-03)

Band accuracy by group, with AI. No identity feature is used for scoring (CLAUDE.md rule 10); gender is recorded on scenarios only for this check.

| Group | n | Accuracy | Gap vs reference | Note |
|---|---|---|---|---|
| English (reference) | 19 | 68% | — | |
| Hindi | 15 | 73% | +5 | |
| Romanised Hindi | 13 | 92% | +24 | |
| Marathi | 5 | 80% | +12 | |
| Tamil | 5 | 80% | +12 | |
| Bengali | 5 | 100% | +32 | |
| Women | 34 | 79% | reference | |
| Men | 23 | 78% | −1 | |
| Other / undisclosed | 2 / 3 | 50% / 100% | −29 / +21 | n too small |
| Chatbot | 41 | 80% | reference | |
| Portal | 14 | 86% | +6 | |
| IVRS | 2 | 100% | | n too small |
| Voice call | 5 | 40% | **−40** | |

**AC-LANG-03:** no required language is more than 15 points below English. ✓

**Gaps over 15 points and mitigation:**
- *Voice call (−40, n = 5)* and *gender "other" (−29, n = 2)*: every error in these groups is the Moderate-scored-Low problem in §4 (S030, S047, S058 are Moderate voice-call scenarios). The groups happen to contain more Moderate cases; the channel and gender are not used by the scorer. **Mitigation:** fix §4, then grow each group to ≥ 10 scenarios so gaps are meaningful (E.3/E.4).
- Regional groups have only 5 scenarios each; their percentages are indicative only.

## 8. Expected-outcome measurements (task 9.3)

| Outcome | Measurement |
|---|---|
| EO-1 time from first message to Critical flag | Same turn: the band, alert and emergency panel are set before the response returns (text p95 3.43 s; screener answers faster). AC-ALR-01: alert on the counsellor's screen in < 5 s (e2e). |
| **EO-2 risk-ordered queue vs first-come** | On the 62 scenarios (one arrival per minute, one counsellor, 8 min per case, rules-only bands): **Critical cases wait 39 min on average instead of 231 min (−83%)**; High 160 vs 224 min; the overall average is unchanged (213.5 min) — risk order moves urgent cases forward without making the queue slower. |
| EO-3 victim-centric redressal | Consent controls, quick exit < 1 s, skip any question, five languages, keypad IVRS, emergency options (all e2e-tested). Usability test with volunteers: **not done** (task 9.8, needs people). |
| EO-4 resource allocation | District dashboard and capacity analytics (referrals requested vs done by district and type, small cells hidden). |
| EO-5 responsiveness | Median alert-to-acknowledgement **14 s** and first staff action **9 s** over 83 Critical alerts — **synthetic test traffic** where tests acknowledge immediately; real numbers come from the pilot. |

## 9. Other reviews (tasks 9.4–9.7)

- **Accessibility (9.4):** axe-core WCAG 2.1 A/AA — **0 violations** on home, start (all five languages), consent, chat and IVRS pages, desktop and phone sizes; keyboard-only pass; one issue found and fixed (quick-exit accessible name). Lighthouse score, a screen-reader session and a low-end Android phone on a throttled connection still need a person.
- **Security (9.5):** every API route is checked by a test for its guard (75 routes); police and welfare can only reach referral endpoints; no server secret appears in the browser bundle (`npm run security:bundle`); security headers present (strict CSP, HSTS, frame-ancestors none, no-referrer); redaction checked on 10 scenarios in five languages — **a gap was found and fixed**: names a person gives about themself ("my name is …") were not redacted before the AI call. OWASP ZAP baseline **not run** (needs Docker or Java on the machine).
- **Privacy (9.6):** see `docs/PRIVACY_REVIEW.md`.
- **PWA (9.7):** manifest, icons and an app-shell service worker that never stores pages or API responses (e2e-checked); offline notice with the helpline numbers. Install test on Android Chrome needs a phone.

## 10. Acceptance-criteria checklist

✓ met and tested · ◐ partly met · ✗ not met · ⧗ needs people, devices or deployment

| AC | Status | Evidence |
|---|---|---|
| AC-CH-01 portal and chatbot, desktop and mobile | ✓ | `victim.spec.ts` (desktop + mobile projects) |
| AC-CH-02 operator console live transcript, SVI per voice window | ✓ | `voice.spec.ts` |
| AC-CH-03 IVRS with keypad only | ✓ | `ivrs.spec.ts` |
| AC-CH-04 docket and channel on every interaction | ✓ | Phase 3 tests; schema `required` |
| AC-CH-05 quick exit < 1 s; skip any question | ✓ | `victim.spec.ts` |
| AC-CH-06 PWA installable | ◐ ⧗ | manifest + service worker tested (`pwa.spec.ts`); Android install needs a phone |
| AC-CON-01…05 consent | ✓ | `victim.spec.ts`, unit tests |
| AC-CON-06 consent notice as text **and audio** in every language | ◐ | text in 5 languages; audio is the browser's speech, no recordings yet |
| AC-VOI-01…06 | ✓ | §6 |
| AC-VOI-07 STT error rate per language | ◐ | English only (§6) |
| AC-NLP-01, 02, 03, 04, 06, 07 | ✓ | §1, §3 |
| AC-NLP-05 every indicator's evidence is word-for-word in the transcript | ✓ | guardrails drop any quote not found (0 dropped in this run); unit tests |
| AC-EMO-01 emotion classes and fused output per window | ✓ | unit + e2e |
| AC-SCR-01…03 | ✓ | Phase 2–3 tests |
| AC-IND-01, 02 | ✓ | Phase 2/5 tests |
| AC-SVI-01, 03, 04 | ✓ | unit tests |
| AC-SVI-02 latency | ◐ | voice ✓ at normal latency (first window over 5 s on a slow day); text p95 3.43 s vs 3.0 s (§5) |
| AC-RISK-01 band accuracy ≥ 80%, no Critical below High | ◐ | 79% (§4); no Critical below High ✓ |
| AC-RISK-02, 03, 04 | ✓ | unit + `staff.spec.ts` |
| AC-REC-01…05 | ✓ | §1, `stakeholders.spec.ts`, `victim.spec.ts` |
| AC-LANG-01 all strings in 5 languages | ✓ | `npm run i18n:check` (draft translations) |
| AC-LANG-02 language detection ≥ 90% | ✗ | not measured yet: the eval runner does not record the detected language — add it to the AI run |
| AC-LANG-03 per-language accuracy within 15 points of English | ✓ | §7 (small regional samples) |
| AC-LANG-04 evidence highlighted in original and translation | ◐ | original only |
| AC-CASE-01, 02 | ✓ | `staff.spec.ts` |
| AC-ALR-01, 02 | ✓ | `staff.spec.ts` (AC-ALR-01 timing failed once on a slow network day; passed otherwise) |
| AC-DSH-01, 02, 03 | ✓ | `stakeholders.spec.ts`, `analytics.spec.ts` |
| AC-API-01, 02 | ✓ | `integration.spec.ts`, `npm run api:example` |
| AC-AUD-01 | ✓ | `staff.spec.ts`, admin tests |
| AC-SEC-01 HTTPS and ZAP scan | ⧗ | headers ✓; HTTPS and ZAP come with deployment (9.9) |
| AC-SEC-02 no PII to AI (10 scenarios) | ✓ | `redact.test.ts` |
| AC-PRI-01 identity separate from assessment data | ✓ | separate `nhaa_pii` database; `docs/PRIVACY_REVIEW.md` |
| AC-ETH-01 no diagnostic label on victim screens | ✓ | `docs/PRIVACY_REVIEW.md`, e2e response checks |
| AC-ETH-02 fairness report | ✓ | §7 |
| AC-ACC-01 accessibility ≥ 90 | ◐ | axe 0 violations; Lighthouse score not run |
| AC-REL-01 AI down → fallback, limited confidence, queued | ✓ | Phase 4 tests |
| AC-MNT-01 scoring coverage ≥ 80% | ✓ | 94% statements (scoring 92%, lexicon 98.5%, recommendations 100%) |

**Not done in Phase 9 by decision:** deployment (9.9), README (9.10) and the presentation script (9.11) are deferred until the project is finished. **Needs people:** usability test (9.8), phone tests, second reviewer for labels, native-speaker review.
