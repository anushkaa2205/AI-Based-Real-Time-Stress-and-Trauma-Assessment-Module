# Nivara

**A real-time stress and trauma assessment module for the National Helpline Against Atrocities (NHAA 14566), integrated into the Nivara portal.**

Live: **https://nivara-black.vercel.app**

Nivara listens to what a person writes or says when they first reach out, finds warning signs, and calculates a **Stress Vulnerability Index (SVI, 0–100)** with a risk band (Low, Moderate, High, Critical). It recommends support and puts the people at highest risk in front of a human responder first. The person never sees a score, and a human approves every action.

Built against Smart India Hackathon 2026 problem statement **SIH26093** (Ministry of Social Justice and Empowerment) as our INT257 Next.js course project. All data in this repository is **synthetic**; no real victim data is used anywhere.

## What it does

- **Two inputs, text and voice.** The person writes or speaks live. No questionnaires and no key presses; the assistant asks only scripted, pre-translated questions chosen by rules.
- **Analysis.** Text: language detection, translation and evidence-backed indicator extraction. Voice: speech-to-text, pauses, pitch, energy, speech rate and voice emotion.
- **Rules compute the score.** The AI finds indicators; deterministic code computes the SVI, the band, the safety overrides and the recommendations. A rule-based safety lexicon checks every message even if the AI service is down.
- **Staff portals.** Counsellor, supervisor, district, police liaison, welfare and admin portals, each seeing only what its role needs, with a live case queue ordered by risk and real-time alerts.
- **Case tracking.** Every case gets a docket ID; the person tracks status and the support arranged without an account.
- **Five languages.** English (default), Hindi, Marathi, Tamil and Bengali. Choosing a language switches the whole site, staff portals included.
- **Plug-in by design.** The public portal reaches the module only through the integration API (`/api/v1/integration/*`), the same way NHAA's chatbot, helpline or IVRS would. The module runs on its own with the portal switched off.

## Tech stack

| Part | Technology |
|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, Base UI, next-intl, Zod |
| Database | MongoDB Atlas + Mongoose (assessment data and personal data in separate databases, sensitive fields encrypted) |
| Auth | Auth.js v5 for staff (password + TOTP); API keys for integrations |
| Real time | Pusher Channels (SSE locally) |
| Analysis service | Python 3.12, FastAPI; Groq (LLM and Whisper), AI4Bharat IndicConformer, Silero VAD, Praat (parselmouth), librosa, emotion2vec+ |
| Tests | Vitest, Playwright, pytest |
| Hosting | Vercel (web), MongoDB Atlas (database) |

## Repository layout

| Folder | Contents |
|---|---|
| `web/` | Next.js app: public portal, staff portals, `/api/v1` integration and staff routes, scoring, safety lexicon |
| `analysis-service/` | Python FastAPI service: speech-to-text, voice features, text analysis |
| `evaluation/` | Synthetic scenarios, the evaluation runner and its reports |
| `docs/` | Product vision, requirements, architecture, database, API contracts, flow and UI plan, evaluation report |

## Getting started

You need Node.js 20+, Python 3.12 and free accounts for MongoDB Atlas, Groq and Pusher (see [`docs/TOOLS_AND_COSTS.md`](docs/TOOLS_AND_COSTS.md)).

**Web app** (from `web/`):

```bash
npm install
cp .env.example .env.local   # fill in the values; never commit .env.local
npm run db:indexes
npm run dev                  # http://localhost:3000
```

`npm run seed` creates the staff accounts and sample data. It **resets the shared staff passwords**, so only run it on your own database.

**Analysis service** (from `analysis-service/`, Windows):

```bash
py -3.12 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Set `ANALYSIS_URL=http://localhost:8000` in `web/.env.local`. Without the analysis service, text still works in fallback mode (safety lexicon and rules only); voice analysis needs it.

## Useful commands

Run from `web/`.

| Task | Command |
|---|---|
| Type-check | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm test` |
| End-to-end tests | `npm run e2e` |
| Check translations | `npm run i18n:check` |
| Evaluation report | `npm run eval` |
| Create the portal API key | `npm run api:client -- --portal` |

## Documentation

- [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md): what Nivara is and why it is a plug-in module
- [`docs/NIVARA_FLOW_AND_UI_PLAN.md`](docs/NIVARA_FLOW_AND_UI_PLAN.md): the portal journey, staff portals, languages and design
- [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md): requirements, the SVI formula and safety overrides
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DATABASE.md`](docs/DATABASE.md), [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md)
- [`docs/EVALUATION_REPORT.md`](docs/EVALUATION_REPORT.md): accuracy and latency results
- [`CLAUDE.md`](CLAUDE.md): project rules and team workflow

