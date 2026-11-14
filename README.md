# NHAA Stress and Trauma Assessment Module

> Project name: TBD (decision D2 in `docs/IMPLEMENTATION_PLAN.md`).

An AI-based, real-time stress and trauma assessment module for victims and complainants contacting the National Helpline Against Atrocities (NHAA 14566) and its portal. Built for Smart India Hackathon 2026, problem statement **SIH26093** (Ministry of Social Justice and Empowerment).

It listens to a victim's text and voice at first contact, detects warning signs, calculates a **Stress Vulnerability Index (SVI, 0–100)**, assigns a risk band (Low / Moderate / High / Critical), recommends support, and puts the highest-risk people in front of a human responder first. Victims never see scores, and humans approve every action.

All data in this repository is **synthetic**. No real victim data is used anywhere.

## Repository layout

| Folder | Contents |
|---|---|
| `web/` | Next.js app: victim UI, staff dashboards, `/api/v1` routes, scoring and safety lexicon |
| `analysis-service/` | Python FastAPI service: speech-to-text, voice features, text analysis |
| `evaluation/` | Synthetic scenarios and the evaluation runner |
| `docs/` | Requirements, architecture, database, API contracts, tools and costs, implementation plan |

Start with [`CLAUDE.md`](CLAUDE.md) for the project rules, then [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for the build order and current status.

## Getting started

Setup steps are added as each part is built (Phase 0 of the implementation plan). Everything runs on free tiers; see [`docs/TOOLS_AND_COSTS.md`](docs/TOOLS_AND_COSTS.md).

Never commit `.env*` files or secrets. Copy the `.env.example` files instead.
