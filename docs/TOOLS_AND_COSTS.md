# Tools and Costs (verified 14 Nov 2026)

Every external tool in the stack, whether it is free, and the limits that matter for this project.
Free tiers change often: re-check before the demo.

## Verdict

**The whole project runs at ₹0.** No paid service is used. Regional-language speech-to-text uses the self-hosted AI4Bharat IndicConformer model, with Bhashini as backup.

### Changes this check forced
1. **Hugging Face Spaces is no longer free for Python apps.** Docker and Gradio Spaces now need a paid plan, so it cannot host the analysis service.
2. **Render's free tier cannot host the AI service or the worker.** It has 512 MB RAM and 0.1 CPU, sleeps after 15 minutes, and background workers are not on the free tier.
3. **Groq's token limit is the real bottleneck**, not requests: 8,000 tokens a minute and 200,000 a day per model. Keep the analysis prompt short, cache results during evaluation, and use Gemini as overflow.
4. **Sarvam dropped.** It is credit-only (paid after a ₹100 sign-up credit), so it breaks the "everything free" rule. Regional speech-to-text uses self-hosted IndicConformer instead (decision D4).

## AI services

| Tool | Use | Free? | Limits / cost | Notes |
|---|---|---|---|---|
| **Groq: `openai/gpt-oss-120b`** (and `gpt-oss-20b`) | Warning signs + text emotion (strict JSON) | ✅ Free, no card | 30 req/min, 1,000 req/day, 8K tokens/min, 200K tokens/day, per model | Groq does not train on API data. Limits are per model, so `gpt-oss-20b` gives a second quota for development. The demo's generated-text mode (task M.13) uses the same quota: one call per generated conversation. |
| **Groq: `whisper-large-v3-turbo`** | Speech-to-text (Hindi, English) | ✅ Free | 20 req/min, 2,000 req/day, 2 h audio/hour, 8 h audio/day | 5-second chunks = 12 req/min per live call → one call at a time on the free tier. |
| **Google Gemini (Flash-Lite; currently `gemini-3.5-flash-lite`, thinking level low)** | Backup LLM. `gemini-2.5-flash` is closed to new API keys; `3.8-flash` was overloaded and slow when tested | ✅ Free | Limits shown per project in AI Studio | Free-tier content **is used to improve Google products** → synthetic test data only. |
| **Bhashini (Govt. of India)** | Backup for regional ASR/translation | ✅ Free (registration) | Not verified on the official site | Use only if self-hosted IndicConformer fails or is too slow on the team laptop. |

## Open-source models and libraries (run on our own machine, free)

| Tool | Use | Licence | Notes |
|---|---|---|---|
| **AI4Bharat IndicConformer-600M** | Speech-to-text for Marathi, Tamil, Bengali | Open weights, gated on Hugging Face (accept the model terms with `HF_TOKEN`) | Self-hosted on the team laptop. Confirm speed and RAM in the Phase 7 spike (D4). |
| **Silero VAD** | Pause detection | MIT | Small; CPU |
| **Praat via `praat-parselmouth`** | Pitch, jitter, shimmer | GPLv3 | Free. Fine for a server we run ourselves; GPL terms apply if the software is ever distributed. |
| **librosa** | Loudness, energy | ISC | |
| **CAM++ speaker embedding** (`funasr/campplus`, via FunASR) | Speaker separation in two-voice calls (task M.10, FR-VOI-10) | Open weights from the FunASR model zoo (free use; check the model card before production) | ~7M params, ~150 ms per stretch of speech on the laptop CPU; ~30 MB download; no new pip package. Trained mostly on Chinese speech, so separation quality on Indian languages must be measured. |
| **emotion2vec+ base** (via FunASR) | Emotion in voice | Code MIT; weights under the FunASR Model License (free use with attribution) | ~90M params, CPU OK. Pulls in PyTorch (~1–2 GB RAM). |
| **XLM-EMO** | Optional text-emotion backup | Code MIT; model released for research use | Optional; only joy/anger/fear/sadness. |
| **YAMNet** | Optional crying/sobbing detection | Apache-licensed TensorFlow tooling | Optional. |
| Next.js, React, Mongoose, Auth.js, Zod, FastAPI, Groq SDK | App and API | MIT / Apache-2.0 | |

## Hosting and infrastructure

| Service | Use | Free? | Limits that matter |
|---|---|---|---|
| **MongoDB Atlas (Free/M0)** | Database | ✅ | 512 MB storage; 100 ops/s; 10 GB in/out per 7 days; 3-node replica set (transactions work); idle free clusters may be deactivated; one free cluster per project |
| **Pusher Channels Sandbox** | Live updates | ✅ | 200K messages/day; 100 concurrent connections |
| **Vercel Hobby** | Next.js hosting | ✅ | **Personal, non-commercial use only** (fine for coursework); no overage billing, the project pauses at limits |
| **Upstash Redis** | Optional rate limiting | ✅ No card | 256 MB; 500K commands/month. Optional: rate limits can live in MongoDB instead. |
| **Cloudflare Quick Tunnel** | Expose the laptop's AI service to the deployed app | ✅ No account | Random URL per run; testing only, no uptime guarantee; 200 concurrent requests; no SSE (not needed here) |
| ~~Hugging Face Spaces~~ | ~~AI service hosting~~ | ❌ | Docker/Gradio Spaces now need a paid plan |
| ~~Render free~~ | ~~AI service / worker~~ | ❌ for our needs | 512 MB / 0.1 CPU, sleeps after 15 min, ~1 min wake-up; background workers not free |

## Recommended free setup

| Part | Where it runs |
|---|---|
| Next.js app (victim UI, dashboards, API, scoring, safety lexicon) | **Vercel Hobby** |
| Database | **MongoDB Atlas Free** |
| Live updates | **Pusher Sandbox** |
| AI analysis service (Python: Silero, Praat, librosa, emotion2vec+) | **Team laptop** (needs ~2–3 GB free RAM), exposed with a **Cloudflare Quick Tunnel** for the demo |
| LLM + Hindi/English speech-to-text | **Groq** (free) |
| Regional-language speech-to-text | **IndicConformer** (self-hosted on the team laptop); **Bhashini** as backup |
| Background jobs (alert escalation, follow-ups) | **No separate worker.** Due jobs are claimed and run inside normal API requests: staff dashboards already poll `/alerts` every 10 s, which is often enough for a 2-minute escalation timer. |

## Rules that follow from the free tiers

- **Synthetic data only** with every external API (already a project rule). Gemini's free tier in particular uses submitted content.
- Keep the analysis prompt compact (target ≤ 1,500 tokens per call) to stay inside Groq's 8K tokens/minute.
- Cache AI responses by input hash during evaluation runs, so re-running the evaluation set does not burn quota.
- One live voice call at a time on the free Whisper quota.
- Warm everything up before the demo: open the Vercel app, start the laptop service and tunnel, and send one test message.
