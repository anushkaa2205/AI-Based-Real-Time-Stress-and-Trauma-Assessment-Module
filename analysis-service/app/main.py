"""Analysis service (ARCHITECTURE §7, API_CONTRACTS §8). Stateless; the web app is its only client.

Every /v1/analyze/* and /v1/summarize request must carry a valid HMAC signature
(task 4.1). The service never writes to the database and never logs message text.
"""

from __future__ import annotations

import json
import time
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from app import __version__
from app.config import Settings, load_settings
from app.security import verify
from app.text.analyze import analyze_text, summarize
from app.text.cache import DiskCache
from app.text.llm import FallbackLLM, GeminiProvider, GroqProvider, LLMError

app = FastAPI(title="NHAA analysis service", version=__version__)

MAX_TEXT = 4000


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()


def get_llm(settings: Annotated[Settings, Depends(get_settings)]) -> FallbackLLM:
    primary = (
        GroqProvider(settings.groq_api_key, settings.groq_model) if settings.groq_api_key else None
    )
    overflow = (
        GeminiProvider(settings.gemini_api_key, settings.gemini_model)
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
    """API_CONTRACTS §8.4. Speech and voice models arrive in Phase 7."""
    nlp = "configured" if (settings.groq_api_key or settings.gemini_api_key) else "not_configured"
    return {"status": "ok", "models": {"stt": "not_loaded", "ser": "not_loaded", "nlp": nlp}}


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
