"""POST /v1/analyze/audio orchestration (tasks 7.2–7.4, 7.6; API_CONTRACTS §8.2).

decode → VAD + pitch + energy (fast, CPU) → speech-to-text and voice emotion in parallel
→ speech rate, baseline update or deviations, events. Audio stays in memory and is
dropped when the request ends (FR-VOI-09). Nothing about the audio or transcript is logged.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import numpy as np

from app.audio import emotion as ser
from app.audio import features as fx
from app.audio import stt
from app.audio.decode import decode
from app.config import Settings

VAD_VERSION = "silero-vad@6"
EVENTS_VERSION = "rules@1"


def _acoustics(samples: np.ndarray) -> dict[str, Any]:
    seg = fx.speech_segments(samples)
    p, quality = fx.pitch(samples)
    return {
        "seg": seg,
        "pauses": fx.pauses(seg),
        "pitch": p,
        "quality": quality,
        "energy": fx.energy(samples, seg),
    }


async def _transcribe(
    settings: Settings,
    audio: bytes,
    filename: str,
    samples: np.ndarray,
    lang: str | None,
    start_ms: int,
) -> stt.Transcript | None:
    """Primary engine by language, then the other one; None if both fail (NFR-REL-02)."""

    async def indic(code: str) -> stt.Transcript:
        return await asyncio.to_thread(
            stt.indic, settings.hf_token, settings.indic_revision, samples, code
        )

    attempts: list[Any] = []
    if lang in stt.INDIC_LANGS:
        attempts = [
            lambda: indic(lang),
            lambda: stt.whisper(settings.groq_api_key, samples, None, start_ms),
        ]
    else:
        attempts = [lambda: stt.whisper(settings.groq_api_key, samples, lang, start_ms)]
        if lang == "hi":
            attempts.append(lambda: indic("hi"))
    for attempt in attempts:
        try:
            return await attempt()
        except Exception as e:
            print(f"[analyze/audio] stt attempt failed: {type(e).__name__}")
    return None


def _events(seg: fx.Segments, pauses: dict[str, Any], start_ms: int) -> list[dict[str, Any]]:
    """FR-VOI-05 (S): long silences.

    Crying/sobbing needs an audio event tagger (YAMNet, optional) and is not built.
    """
    out: list[dict[str, Any]] = []
    lead = fx.leading_silence_ms(seg)
    if lead >= fx.LONG_SILENCE_MS:
        out.append(
            {
                "type": "LONG_SILENCE",
                "startMs": start_ms,
                "endMs": start_ms + lead,
                "confidence": 0.9,
            }
        )
    for a, b in zip(seg.speech, seg.speech[1:], strict=False):
        if b[0] - a[1] >= fx.LONG_SILENCE_MS:
            out.append(
                {
                    "type": "LONG_SILENCE",
                    "startMs": start_ms + a[1],
                    "endMs": start_ms + b[0],
                    "confidence": 0.9,
                }
            )
    return out


async def analyze_audio(
    settings: Settings, audio: bytes, filename: str, meta: dict[str, Any], max_seconds: float | None
) -> dict[str, Any]:
    t0 = time.perf_counter()
    start_ms = int(meta.get("startMs") or 0)
    lang = meta.get("languageHint")
    baseline = meta.get("baseline") if isinstance(meta.get("baseline"), dict) else None

    samples = await asyncio.to_thread(decode, audio, max_seconds)
    t_dec = time.perf_counter()
    ac = await asyncio.to_thread(_acoustics, samples)
    t_ac = time.perf_counter()
    seg: fx.Segments = ac["seg"]

    window = {
        "pitchMeanHz": ac["pitch"]["meanHz"] if ac["pitch"] else None,
        "pitchStdHz": ac["pitch"]["stdHz"] if ac["pitch"] else None,
        "energyMeanDb": ac["energy"]["meanDb"] if ac["energy"] else None,
        "silenceRatio": ac["pauses"]["silenceRatio"],
    }
    # Deviations need the speaker baseline; emotion's "flat" rule uses pitch and energy only.
    ready = fx.baseline_ready(baseline)
    pre_dev = fx.deviation(baseline, window) if ready and baseline else None

    stage: dict[str, int] = {}

    async def timed(name: str, coro):
        t = time.perf_counter()
        try:
            return await coro
        finally:
            stage[name] = round((time.perf_counter() - t) * 1000)

    transcript, (emo, ser_version) = await asyncio.gather(
        timed("stt", _transcribe(settings, audio, filename, samples, lang, start_ms)),
        timed("ser", asyncio.to_thread(ser.classify, samples, pre_dev, seg.voiced_ms)),
    )

    words = len(transcript.text.split()) if transcript and transcript.text else 0
    rate = round(words / (seg.voiced_ms / 60_000)) if seg.voiced_ms >= 1000 and words else None
    window["speechRateWpm"] = rate

    deviation = fx.deviation(baseline, window) if ready and baseline else None
    baseline_update = None if ready else fx.update_baseline(baseline, window, seg.voiced_ms)

    pauses = {k: v for k, v in ac["pauses"].items() if k != "gapsMs"}
    return {
        "windowIndex": meta.get("windowIndex"),
        "durationMs": seg.duration_ms,
        "voicedMs": seg.voiced_ms,
        "transcript": (
            {
                "text": transcript.text,
                "language": transcript.language,
                "confidence": transcript.confidence,
                "words": transcript.words,
            }
            if transcript
            else None
        ),
        "pauses": pauses,
        "pitch": ac["pitch"],
        "speechRateWpm": rate,
        "energy": ac["energy"],
        "voiceQuality": ac["quality"],
        "events": _events(seg, ac["pauses"], start_ms),
        "emotion": emo,
        "baselineDeviation": deviation,
        "baselineUpdate": baseline_update,
        "modelVersion": {
            "stt": transcript.model if transcript else None,
            "vad": VAD_VERSION,
            "ser": ser_version,
            "events": EVENTS_VERSION,
        },
        "latencyMs": round((time.perf_counter() - t0) * 1000),
        # Stage timings in ms (no content), for the latency budget (NFR-PERF-02).
        "timingsMs": {
            "decode": round((t_dec - t0) * 1000),
            "acoustics": round((t_ac - t_dec) * 1000),
            **stage,
        },
    }


def warm_up() -> None:
    """Runs every CPU stage once on two seconds of a synthetic tone (no audio input involved)."""
    t = np.arange(2 * 16_000, dtype=np.float32) / 16_000
    samples = (0.2 * np.sin(2 * np.pi * 180 * t)).astype(np.float32)
    ac = _acoustics(samples)
    ser.classify(samples, None, max(ac["seg"].voiced_ms, 1000))
