"""Analysis service (ARCHITECTURE §7, API_CONTRACTS §8). Stateless; the web app is its only client.

Every /v1/analyze/* and /v1/summarize request must carry a valid HMAC signature
(task 4.1). The service never writes to the database and never logs message text.
"""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from app import __version__
from app.audio import emotion as ser
from app.audio import multipart, stt
from app.audio.analyze import analyze_audio, warm_up
from app.audio.decode import BadAudio
from app.config import Settings, load_settings
from app.http import close_all, shared_client
from app.security import verify
from app.text.analyze import analyze_text, summarize
from app.text.cache import DiskCache
from app.text.llm import FallbackLLM, GeminiProvider, GroqProvider, LLMError


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Optional (PRELOAD_VOICE=on): load the voice models at start-up, not on the first call."""
    settings = load_settings()
    if settings.preload_voice:
        await asyncio.to_thread(ser.preload)
        # One silent warm-up window: first calls compile code (librosa/numba, VAD, emotion
        # model) and would otherwise make the first real caller's window miss its 5 s budget.
        await asyncio.to_thread(warm_up)
        if settings.hf_token:
            try:
                await asyncio.to_thread(stt._load_indic, settings.hf_token, settings.indic_revision)
            except Exception as e:
                print(f"[startup] IndicConformer not loaded: {type(e).__name__}")
    yield
    await close_all()


app = FastAPI(title="NHAA analysis service", version=__version__, lifespan=lifespan)

MAX_TEXT = 4000
#: API_CONTRACTS §3.7: a voice chunk is ≤ 6 s and ≤ 200 KB (a little slack for container overhead).
MAX_AUDIO_BYTES = 256 * 1024
MAX_AUDIO_SECONDS = 6.5


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()


async def get_llm(settings: Annotated[Settings, Depends(get_settings)]) -> FallbackLLM:
    client = shared_client()  # reused across requests (TLS/connection reuse)
    primary = (
        GroqProvider(settings.groq_api_key, settings.groq_model, client)
        if settings.groq_api_key
        else None
    )
    overflow = (
        GeminiProvider(settings.gemini_api_key, settings.gemini_model, client)
        if settings.gemini_api_key
        else None
    )
    return FallbackLLM(primary, overflow)


def get_cache(settings: Annotated[Settings, Depends(get_settings)]) -> DiskCache:
    return DiskCache(settings.cache_dir, settings.use_cache)


def problem(status: int, code: str, title: str) -> JSONResponse:
    return JSONResponse(
        {"type": f"about:blank#{code.lower()}", "title": title, "status": status, "code": code},
        status_code=status,
        media_type="application/problem+json",
    )


async def signed_body(request: Request, settings: Settings) -> bytes | JSONResponse:
    body = await request.body()
    if not verify(
        settings.hmac_secret,
        request.headers.get("x-timestamp"),
        request.headers.get("x-signature"),
        body,
        time.time(),
    ):
        return problem(401, "UNAUTHENTICATED", "Invalid or missing signature")
    return body


async def signed_json(request: Request, settings: Settings) -> dict[str, Any] | JSONResponse:
    body = await request.body()
    if not verify(
        settings.hmac_secret,
        request.headers.get("x-timestamp"),
        request.headers.get("x-signature"),
        body,
        time.time(),
    ):
        return problem(401, "UNAUTHENTICATED", "Invalid or missing signature")
    try:
        data = json.loads(body)
    except ValueError:
        return problem(400, "VALIDATION_FAILED", "Body must be JSON")
    if not isinstance(data, dict):
        return problem(400, "VALIDATION_FAILED", "Body must be a JSON object")
    return data


@app.get("/v1/health")
def health(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, object]:
    """API_CONTRACTS §8.4."""
    nlp = "configured" if (settings.groq_api_key or settings.gemini_api_key) else "not_configured"
    whisper = "configured" if settings.groq_api_key else "not_configured"
    indic = (
        "loaded" if stt.indic_loaded() else ("available" if settings.hf_token else "not_configured")
    )
    return {
        "status": "ok",
        "models": {
            "stt": {"whisper": whisper, "indic": indic},
            "ser": "loaded" if ser.ser_loaded() else "lazy",
            "nlp": nlp,
        },
    }


@app.post("/v1/analyze/text")
async def analyze_text_route(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    llm: Annotated[FallbackLLM, Depends(get_llm)],
    cache: Annotated[DiskCache, Depends(get_cache)],
):
    data = await signed_json(request, settings)
    if isinstance(data, JSONResponse):
        return data
    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        return problem(400, "VALIDATION_FAILED", "text is required")
    if len(text) > MAX_TEXT:
        return problem(413, "PAYLOAD_TOO_LARGE", "text too long")
    try:
        return await analyze_text(llm, cache, data)
    except LLMError as e:
        # The web app continues in fallback mode (NFR-REL-01). No user text in the log.
        print(f"[analyze/text] model unavailable: {e}")
        return problem(503, "MODEL_UNAVAILABLE", "Model unavailable")


@app.post("/v1/summarize")
async def summarize_route(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    llm: Annotated[FallbackLLM, Depends(get_llm)],
    cache: Annotated[DiskCache, Depends(get_cache)],
):
    data = await signed_json(request, settings)
    if isinstance(data, JSONResponse):
        return data
    if not isinstance(data.get("messages"), list) or not data["messages"]:
        return problem(400, "VALIDATION_FAILED", "messages are required")
    try:
        return await summarize(llm, cache, data)
    except LLMError as e:
        print(f"[summarize] model unavailable: {e}")
        return problem(503, "MODEL_UNAVAILABLE", "Model unavailable")


@app.post("/v1/analyze/audio")
async def analyze_audio_route(
    request: Request, settings: Annotated[Settings, Depends(get_settings)]
):
    """API_CONTRACTS §8.2. Audio stays in memory; nothing about it is logged."""
    if int(request.headers.get("content-length") or 0) > MAX_AUDIO_BYTES + 8192:
        return problem(413, "PAYLOAD_TOO_LARGE", "audio chunk too large")
    body = await signed_body(request, settings)
    if isinstance(body, JSONResponse):
        return body
    try:
        parts = multipart.parse(request.headers.get("content-type", ""), body)
    except ValueError:
        return problem(400, "VALIDATION_FAILED", "multipart/form-data expected")
    audio = parts.get("audio")
    if not audio or not audio[1]:
        return problem(400, "VALIDATION_FAILED", "audio is required")
    if len(audio[1]) > MAX_AUDIO_BYTES:
        return problem(413, "PAYLOAD_TOO_LARGE", "audio chunk too large")
    try:
        meta = json.loads(parts["meta"][1]) if "meta" in parts else {}
    except ValueError:
        return problem(400, "VALIDATION_FAILED", "meta must be JSON")
    if not isinstance(meta, dict):
        return problem(400, "VALIDATION_FAILED", "meta must be a JSON object")
    lang = meta.get("languageHint")
    if lang is not None and lang not in {"hi", "en", "mr", "ta", "bn"}:
        return problem(422, "UNSUPPORTED_LANGUAGE", "Unsupported language")
    try:
        return await analyze_audio(
            settings, audio[1], audio[0] or "chunk.webm", meta, MAX_AUDIO_SECONDS
        )
    except BadAudio:
        return problem(400, "BAD_AUDIO", "Audio could not be decoded")
    except Exception as e:  # the web app switches to fallback mode (NFR-REL-01)
        print(f"[analyze/audio] failed: {type(e).__name__}")
        return problem(503, "MODEL_UNAVAILABLE", "Voice analysis unavailable")
