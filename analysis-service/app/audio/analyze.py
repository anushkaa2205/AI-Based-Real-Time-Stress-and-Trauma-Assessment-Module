"""POST /v1/analyze/audio orchestration (tasks 7.2–7.4, 7.6; API_CONTRACTS §8.2).

decode → (MIXED audio: VAD + speaker separation, task M.10) → VAD + pitch + energy on the caller's
speech (fast, CPU) → speech-to-text and voice emotion in parallel → speech rate, baseline update or
deviations, events. Only the caller's words and voice are returned for scoring; the operator's words
come back separately. Audio stays in memory and is
dropped when the request ends (FR-VOI-09). Nothing about the audio or transcript is logged.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import numpy as np

from app.audio import emotion as ser
from app.audio import features as fx
from app.audio import speakers as spk
from app.audio import stt
from app.audio.decode import SAMPLE_RATE, decode
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


#: Under this much caller speech there is nothing to measure (no pitch, energy or emotion).
MIN_CALLER_SAMPLES = SAMPLE_RATE * 3 // 10


def _no_speech(duration_ms: int) -> dict[str, Any]:
    """Acoustics for a window with no caller speech (e.g. only the operator talked)."""
    seg = fx.Segments(speech=[], duration_ms=duration_ms)
    return {"seg": seg, "pauses": fx.pauses(seg), "pitch": None, "quality": None, "energy": None}


def _split_words(
    transcript: stt.Transcript, sep: spk.Separation, start_ms: int
) -> tuple[stt.Transcript, str]:
    """Caller's words (as a transcript) and the operator's words, by each word's middle (M.10)."""
    caller: list[dict[str, Any]] = []
    operator: list[str] = []
    for w in transcript.words:
        mid = (float(w["startMs"]) + float(w["endMs"])) / 2 - start_ms
        if sep.label_at(mid) == "OPERATOR":
            operator.append(str(w["w"]))
        else:
            caller.append(w)
    text = " ".join(str(w["w"]).strip() for w in caller).strip()
    return (
        stt.Transcript(
            text=text,
            language=transcript.language,
            confidence=transcript.confidence,
            words=caller,
            model=transcript.model,
        ),
        " ".join(x.strip() for x in operator).strip(),
    )


async def analyze_audio(
    settings: Settings, audio: bytes, filename: str, meta: dict[str, Any], max_seconds: float | None
) -> dict[str, Any]:
    t0 = time.perf_counter()
    start_ms = int(meta.get("startMs") or 0)
    lang = meta.get("languageHint")
    baseline = meta.get("baseline") if isinstance(meta.get("baseline"), dict) else None
    # Task M.10 (FR-VOI-10): MIXED = both voices in one recording (the default).
    audio_source = "CALLER_ONLY" if meta.get("audioSource") == "CALLER_ONLY" else "MIXED"
    first_speaker = "CALLER" if meta.get("firstSpeaker") == "CALLER" else "OPERATOR"
    state_raw = meta.get("speakerState") if isinstance(meta.get("speakerState"), str) else None

    samples = await asyncio.to_thread(decode, audio, max_seconds)
    t_dec = time.perf_counter()

    stage: dict[str, int] = {}

    async def timed(name: str, coro):
        t = time.perf_counter()
        try:
            return await coro
        finally:
            stage[name] = round((time.perf_counter() - t) * 1000)

    # --- speaker separation: the caller's speech only, for features and scoring ---------------
    sep: spk.Separation | None = None
    if audio_source == "MIXED":
        speech = await asyncio.to_thread(fx.speech_segments, samples)
        try:
            sep = await timed(
                "speakers",
                asyncio.to_thread(spk.separate, samples, speech.speech, state_raw, first_speaker),
            )
        except (
            Exception
        ) as e:  # model missing or failed: the web app marks the call limited confidence
            print(f"[analyze/audio] speaker separation unavailable: {type(e).__name__}")
            sep = None
    # Until a second voice has been heard, nothing is discarded: all speech counts as the caller's
    # and the window is limited confidence (caller-only audio may be sent without saying so).
    single_voice = sep is not None and sep.separated and len(sep.state.voices) < 2
    separated = sep is not None and sep.separated and not single_voice
    caller_samples = sep.samples_of(samples, "CALLER") if separated and sep is not None else samples
    duration_ms = round(samples.size * 1000 / SAMPLE_RATE)

    has_caller = caller_samples.size >= MIN_CALLER_SAMPLES
    ac = (
        await asyncio.to_thread(_acoustics, caller_samples)
        if has_caller
        else _no_speech(duration_ms)
    )
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

    # --- speech-to-text --------------------------------------------------------------------------
    both = separated and sep is not None and sep.ms("CALLER") > 0 and sep.ms("OPERATOR") > 0
    per_speaker = both and lang in stt.INDIC_LANGS  # no word timings there: transcribe each voice
    operator_text = ""

    async def transcripts() -> stt.Transcript | None:
        nonlocal operator_text
        if per_speaker and sep is not None:
            op = sep.samples_of(samples, "OPERATOR")
            caller_t, op_t = await asyncio.gather(
                _transcribe(settings, audio, filename, caller_samples, lang, start_ms),
                _transcribe(settings, audio, filename, op, lang, start_ms),
            )
            operator_text = op_t.text.strip() if op_t and op_t.text else ""
            return caller_t
        full = await _transcribe(settings, audio, filename, samples, lang, start_ms)
        if not full or not separated or sep is None:
            return full
        if full.words:
            caller_t, operator_text = _split_words(full, sep, start_ms)
            return caller_t
        # No word timings and only one voice in this window: the whole text is that voice's.
        if sep.ms("OPERATOR") > 0 and sep.ms("CALLER") == 0:
            operator_text = full.text.strip()
            return stt.Transcript(
                text="",
                language=full.language,
                confidence=full.confidence,
                words=[],
                model=full.model,
            )
        return full

    async def emotion() -> tuple[dict[str, Any], str]:
        if not has_caller:
            return {"label": "neutral", "confidence": 0.0, "distribution": {}}, "none"
        return await asyncio.to_thread(ser.classify, caller_samples, pre_dev, seg.voiced_ms)

    transcript, (emo, ser_version) = await asyncio.gather(
        timed("stt", transcripts()), timed("ser", emotion())
    )

    words = len(transcript.text.split()) if transcript and transcript.text else 0
    rate = round(words / (seg.voiced_ms / 60_000)) if seg.voiced_ms >= 1000 and words else None
    window["speechRateWpm"] = rate

    deviation = fx.deviation(baseline, window) if ready and baseline else None
    baseline_update = (
        None if ready or not has_caller else fx.update_baseline(baseline, window, seg.voiced_ms)
    )

    caller_ms = sep.ms("CALLER") if separated and sep is not None else seg.voiced_ms
    speakers: dict[str, Any] = {
        "audioSource": audio_source,
        "separated": separated,
        "confident": True
        if audio_source == "CALLER_ONLY"
        else bool(separated and sep is not None and sep.confident),
        "callerMs": caller_ms,
        "operatorMs": sep.ms("OPERATOR") if separated and sep is not None else 0,
        "operatorText": operator_text or None,
        "singleVoice": single_voice,
        "state": sep.state.dumps() if sep is not None else state_raw,
    }

    pauses = {k: v for k, v in ac["pauses"].items() if k != "gapsMs"}
    return {
        "windowIndex": meta.get("windowIndex"),
        "durationMs": duration_ms,
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
        "speakers": speakers,
        "modelVersion": {
            "stt": transcript.model if transcript else None,
            "vad": VAD_VERSION,
            "ser": ser_version,
            "events": EVENTS_VERSION,
            **({"speakers": spk.SPK_VERSION} if audio_source == "MIXED" else {}),
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
    spk.warm_up()  # task M.10: load the speaker model before the first two-voice window
