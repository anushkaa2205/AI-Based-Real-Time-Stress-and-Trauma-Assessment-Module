"""Text analysis (tasks 4.2–4.4): language, translation, indicators with evidence, emotion.

The model's quotes are checked here first: each must be found word-for-word in
the original message, or the indicator is dropped (CLAUDE.md rule 12). The web
app checks again (task 4.7) before anything is stored.
"""

from __future__ import annotations

import json
import time
import unicodedata
from typing import Any

from app.text.cache import DiskCache
from app.text.lid import guess_language
from app.text.llm import LLM
from app.text.prompt import (
    DIMENSIONS,
    EMOTIONS,
    FLAGS,
    OUTPUT_SCHEMA,
    PROMPT_VERSION,
    SUMMARY_SCHEMA,
    SUMMARY_SYSTEM,
    SUMMARY_VERSION,
    SYSTEM,
)


def _clamp(v: Any) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if x != x else min(1.0, max(0.0, x))  # NaN → 0


def find_span(text: str, quote: str) -> tuple[int, int, str] | None:
    """Exact match first, then case-insensitive (Latin script), then NFC-normalised."""
    q = quote.strip()
    if not q:
        return None
    i = text.find(q)
    if i >= 0:
        return i, i + len(q), q
    i = text.lower().find(q.lower())
    if i >= 0 and len(text.lower()) == len(text):
        return i, i + len(q), text[i : i + len(q)]
    nt, nq = unicodedata.normalize("NFC", text), unicodedata.normalize("NFC", q)
    i = nt.find(nq)
    if i >= 0 and nt == text:
        return i, i + len(nq), nq
    return None


def shape(raw: dict, text: str, hint: str | None, nlp_version: str) -> dict:
    """Validates and shapes the model output into the §8.1 response, dropping bad parts."""
    code, lid_conf, script = guess_language(text, hint)
    lang = raw.get("language") if isinstance(raw.get("language"), dict) else {}
    model_code = lang.get("code")
    if model_code in {"en", "hi", "hi-Latn", "mr", "ta", "bn"}:
        # The script decides between scripts; the model decides within one (hi/mr, en/hi-Latn).
        if (script == "Deva" and model_code in {"hi", "mr"}) or (
            script == "Latn" and model_code in {"en", "hi-Latn"}
        ):
            code, lid_conf = model_code, max(lid_conf, _clamp(lang.get("confidence")))

    indicators = []
    seen: set[tuple[str, int, int]] = set()
    for item in raw.get("indicators") or []:
        if not isinstance(item, dict) or item.get("dimension") not in DIMENSIONS:
            continue
        span = find_span(text, str(item.get("quote", "")))
        if span is None:
            continue  # invented or translated quote: drop (rule 12)
        start, end, quote = span
        key = (item["dimension"], start, end)
        if key in seen:
            continue
        seen.add(key)
        indicators.append(
            {
                "dimension": item["dimension"],
                "score": _clamp(item.get("score")),
                "confidence": _clamp(item.get("confidence")),
                "negated": bool(item.get("negated", False)),
                "flags": [f for f in (item.get("flags") or []) if f in FLAGS],
                "evidence": {"quote": quote, "start": start, "end": end},
                "rationale": str(item.get("rationale", ""))[:120],
            }
        )

    danger_raw = (
        raw.get("immediate_danger") if isinstance(raw.get("immediate_danger"), dict) else {}
    )
    danger_span = (
        find_span(text, str(danger_raw.get("quote", ""))) if danger_raw.get("detected") else None
    )
    immediate = {
        "detected": bool(danger_raw.get("detected")) and danger_span is not None,
        "confidence": _clamp(danger_raw.get("confidence")),
        "evidence": (
            {"quote": danger_span[2], "start": danger_span[0], "end": danger_span[1]}
            if danger_span
            else None
        ),
    }

    emo_raw = raw.get("emotion") if isinstance(raw.get("emotion"), dict) else {}
    dist_raw = emo_raw.get("distribution") if isinstance(emo_raw.get("distribution"), dict) else {}
    distribution = {e: _clamp(dist_raw.get(e)) for e in EMOTIONS}
    label = (
        emo_raw.get("label")
        if emo_raw.get("label") in EMOTIONS
        else max(distribution, key=lambda e: distribution[e])
    )

    return {
        "language": {"code": code, "confidence": round(lid_conf, 3), "script": script},
        "translation": {"en": str(raw.get("translation_en", ""))[:4000]},
        "indicators": indicators,
        "immediateDanger": immediate,
        "emotion": {
            "label": label,
            "confidence": _clamp(emo_raw.get("confidence")),
            "distribution": distribution,
        },
        "modelVersion": {
            "nlp": f"{nlp_version}@{PROMPT_VERSION}",
            "lid": "script+llm",
            "mt": "llm",
            "emotion": "llm",
        },
    }


async def analyze_text(llm: LLM, cache: DiskCache, req: dict) -> dict:
    t0 = time.perf_counter()
    text: str = req["text"]
    user = json.dumps(
        {
            "message": text,
            "languageHint": req.get("languageHint"),
            "context": req.get("context") or {},
            # The chatbot's or operator's question just before the message (task M.9, FR-NLP-11).
            # Context only: quotes are still checked against the message alone.
            "previousQuestion": str(req.get("previousQuestion") or "")[:500] or None,
        },
        ensure_ascii=False,
    )
    key = DiskCache.key(PROMPT_VERSION, llm.version, user)
    cached = cache.get(key)
    if cached is not None:
        raw, version = cached["raw"], cached["version"]
    else:
        raw, version = await llm.complete_json(SYSTEM, user, OUTPUT_SCHEMA, "helpline_analysis")
        cache.put(key, {"raw": raw, "version": version})
    out = shape(raw, text, req.get("languageHint"), version)
    out["latencyMs"] = round((time.perf_counter() - t0) * 1000)
    out["cached"] = cached is not None
    return out


async def summarize(llm: LLM, cache: DiskCache, req: dict) -> dict:
    lines = [f"{m.get('sender', 'VICTIM')}: {m.get('text', '')}" for m in req.get("messages", [])]
    user = json.dumps(
        {"language": req.get("language", "en"), "messages": lines}, ensure_ascii=False
    )
    key = DiskCache.key(SUMMARY_VERSION, llm.version, user)
    cached = cache.get(key)
    if cached is not None:
        raw, version = cached["raw"], cached["version"]
    else:
        raw, version = await llm.complete_json(SUMMARY_SYSTEM, user, SUMMARY_SCHEMA, "case_summary")
        cache.put(key, {"raw": raw, "version": version})
    return {
        "summary": str(raw.get("summary", ""))[:1200],
        "summaryEn": str(raw.get("summary_en", ""))[:1200],
        "modelVersion": f"{version}@{SUMMARY_VERSION}",
    }
