"""LLM providers behind one interface (task 4.3, decision D3, NFR-MNT-01).

Groq (openai/gpt-oss-*) is primary; Gemini Flash is used only when Groq says
429 (rate limited) or has no key. Temperature 0. Keys are never logged.
Input text arrives already redacted by the web app (NFR-SEC-05).
"""

from __future__ import annotations

import json
from typing import Protocol

import httpx

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT = httpx.Timeout(8.0, connect=3.0)


class LLMError(Exception):
    """Provider failed; message never contains keys or user text."""


class RateLimited(LLMError):
    pass


class LLM(Protocol):
    @property
    def version(self) -> str: ...

    async def complete_json(
        self, system: str, user: str, schema: dict, schema_name: str
    ) -> tuple[dict, str]:
        """Returns (parsed JSON, provider:model that answered)."""
        ...


class GroqProvider:
    def __init__(self, api_key: str, model: str, client: httpx.AsyncClient | None = None):
        self._key = api_key
        self.model = model
        self._client = client

    @property
    def version(self) -> str:
        return f"groq:{self.model}"

    async def complete_json(
        self, system: str, user: str, schema: dict, schema_name: str
    ) -> tuple[dict, str]:
        body = {
            "model": self.model,
            "temperature": 0,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            },
        }
        if "gpt-oss" in self.model:
            body["reasoning_effort"] = (
                "low"  # keeps latency and tokens down (8K tokens/min free tier)
            )
        client = self._client or httpx.AsyncClient(timeout=TIMEOUT)
        try:
            res = await client.post(
                GROQ_URL, json=body, headers={"Authorization": f"Bearer {self._key}"}
            )
        except httpx.HTTPError as e:
            raise LLMError(f"groq unreachable: {type(e).__name__}") from None
        finally:
            if self._client is None:
                await client.aclose()
        if res.status_code == 429:
            raise RateLimited("groq rate limited")
        if res.status_code >= 400:
            raise LLMError(f"groq HTTP {res.status_code}")
        try:
            content = res.json()["choices"][0]["message"]["content"]
            return json.loads(content), self.version
        except (KeyError, IndexError, ValueError, TypeError):
            raise LLMError("groq returned unexpected JSON") from None


class GeminiProvider:
    def __init__(self, api_key: str, model: str, client: httpx.AsyncClient | None = None):
        self._key = api_key
        self.model = model
        self._client = client

    @property
    def version(self) -> str:
        return f"gemini:{self.model}"

    async def complete_json(
        self, system: str, user: str, schema: dict, schema_name: str
    ) -> tuple[dict, str]:
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
                "responseJsonSchema": schema,
                # Gemini 3 models think before answering by default; keep it short for latency.
                "thinkingConfig": {"thinkingLevel": "low"},
            },
        }
        client = self._client or httpx.AsyncClient(timeout=TIMEOUT)
        try:
            res = await client.post(
                GEMINI_URL.format(model=self.model),
                json=body,
                headers={"x-goog-api-key": self._key},
            )
        except httpx.HTTPError as e:
            raise LLMError(f"gemini unreachable: {type(e).__name__}") from None
        finally:
            if self._client is None:
                await client.aclose()
        if res.status_code == 429:
            raise RateLimited("gemini rate limited")
        if res.status_code >= 400:
            raise LLMError(f"gemini HTTP {res.status_code}")
        try:
            text = res.json()["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text), self.version
        except (KeyError, IndexError, ValueError, TypeError):
            raise LLMError("gemini returned unexpected JSON") from None


class FallbackLLM:
    """Primary first; the overflow provider only on HTTP 429 (decision D3)."""

    def __init__(self, primary: LLM | None, overflow: LLM | None):
        self.primary = primary
        self.overflow = overflow

    @property
    def version(self) -> str:
        return (
            (self.primary or self.overflow).version if (self.primary or self.overflow) else "none"
        )

    async def complete_json(
        self, system: str, user: str, schema: dict, schema_name: str
    ) -> tuple[dict, str]:
        if self.primary is None and self.overflow is None:
            raise LLMError("no LLM configured (GROQ_API_KEY / GEMINI_API_KEY missing)")
        if self.primary is not None:
            try:
                return await self.primary.complete_json(system, user, schema, schema_name)
            except RateLimited:
                if self.overflow is None:
                    raise
        assert self.overflow is not None
        return await self.overflow.complete_json(system, user, schema, schema_name)
