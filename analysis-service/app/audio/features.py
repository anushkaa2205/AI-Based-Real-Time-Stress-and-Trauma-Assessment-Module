"""Acoustic features for one voice window (tasks 7.2, 7.3; FR-VOI-02/03/04/07).

- Pauses: Silero VAD speech segments; a pause is a gap of at least MIN_PAUSE_MS between them.
- Pitch, jitter, shimmer: Praat via parselmouth.
- Energy: librosa RMS in dB.
- Speech rate: transcript words / voiced seconds (computed in analyze.py once STT has run).
- Baseline: the first BASELINE_SPEECH_MS of speech set the speaker's own baseline;
  later windows report z-like deviations from it (FR-VOI-03).
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np

from app.audio.decode import SAMPLE_RATE

MIN_PAUSE_MS = 300  # shorter gaps are normal between words
LONG_SILENCE_MS = 3000  # FR-VOI-05: long silence (e.g. after a question)
BASELINE_SPEECH_MS = 20_000  # FR-VOI-03: first 20–30 s of speech


@dataclass
class Segments:
    speech: list[tuple[int, int]]  # (startMs, endMs) within the window
    duration_ms: int

    @property
    def voiced_ms(self) -> int:
        return sum(e - s for s, e in self.speech)


@lru_cache(maxsize=1)
def _vad_model() -> Any:
    from silero_vad import load_silero_vad

    return load_silero_vad()


def speech_segments(samples: np.ndarray) -> Segments:
    """Silero VAD on 16 kHz mono samples."""
    import torch
    from silero_vad import get_speech_timestamps

    ts = get_speech_timestamps(
        torch.from_numpy(samples),
        _vad_model(),
        sampling_rate=SAMPLE_RATE,
        min_silence_duration_ms=150,
        min_speech_duration_ms=120,
        speech_pad_ms=30,
        return_seconds=False,
    )
    to_ms = 1000 / SAMPLE_RATE
    speech = [(round(t["start"] * to_ms), round(t["end"] * to_ms)) for t in ts]
    return Segments(speech=speech, duration_ms=round(samples.size * to_ms))


def pauses(seg: Segments) -> dict[str, float | int]:
    """FR-VOI-02: count, mean and max pause length, silence ratio."""
    pairs = zip(seg.speech, seg.speech[1:], strict=False)
    gaps = [b[0] - a[1] for a, b in pairs if b[0] - a[1] >= MIN_PAUSE_MS]
    silence_ratio = 1 - seg.voiced_ms / seg.duration_ms if seg.duration_ms else 0.0
    return {
        "count": len(gaps),
        "meanMs": round(float(np.mean(gaps))) if gaps else 0,
        "maxMs": max(gaps) if gaps else 0,
        "silenceRatio": round(float(max(0.0, min(1.0, silence_ratio))), 3),
        "gapsMs": gaps,  # used by the tests and events; dropped from the response
    }


def pitch(samples: np.ndarray) -> tuple[dict[str, float] | None, dict[str, float] | None]:
    """FR-VOI-03: mean, spread and range of F0 over voiced frames; jitter and shimmer."""
    import parselmouth
    from parselmouth.praat import call

    snd = parselmouth.Sound(samples.astype(np.float64), sampling_frequency=SAMPLE_RATE)
    p = snd.to_pitch(time_step=0.01, pitch_floor=75.0, pitch_ceiling=500.0)
    f0 = p.selected_array["frequency"]
    f0 = f0[f0 > 0]
    if f0.size < 10:  # under 0.1 s of voiced speech: no reliable pitch
        return None, None
    stats = {
        "meanHz": round(float(np.mean(f0)), 1),
        "stdHz": round(float(np.std(f0)), 1),
        # Robust range (5th–95th percentile), so one octave error does not dominate.
        "rangeHz": round(float(np.percentile(f0, 95) - np.percentile(f0, 5)), 1),
    }
    quality = None
    try:
        pp = call(snd, "To PointProcess (periodic, cc)", 75.0, 500.0)
        jitter = call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
        shimmer = call([snd, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        if np.isfinite(jitter) and np.isfinite(shimmer):
            quality = {"jitter": round(float(jitter), 4), "shimmer": round(float(shimmer), 4)}
    except Exception:  # Praat refuses very short or noisy input; quality is optional
        quality = None
    return stats, quality


def energy(samples: np.ndarray, seg: Segments) -> dict[str, float] | None:
    """FR-VOI-04: loudness (mean dB over speech) and the largest jump between half-second blocks."""
    import librosa

    hop = SAMPLE_RATE // 100  # 10 ms frames
    rms = librosa.feature.rms(y=samples, frame_length=hop * 4, hop_length=hop)[0]
    db = 20 * np.log10(np.maximum(rms, 1e-5))
    voiced = np.zeros_like(db, dtype=bool)
    for s, e in seg.speech:
        voiced[s // 10 : e // 10 + 1] = True
    voiced = voiced[: db.size]
    if not voiced.any():
        return None
    block = 50  # 0.5 s
    blocks = [db[i : i + block][voiced[i : i + block]] for i in range(0, db.size, block)]
    means = [float(np.mean(b)) for b in blocks if b.size >= 10]
    delta = max((abs(b - a) for a, b in zip(means, means[1:], strict=False)), default=0.0)
    return {"meanDb": round(float(np.mean(db[voiced])), 1), "deltaDb": round(delta, 1)}


def leading_silence_ms(seg: Segments) -> int:
    return seg.speech[0][0] if seg.speech else seg.duration_ms


# --- speaker baseline (FR-VOI-03) ------------------------------------------------------

BASELINE_KEYS = ("pitchMeanHz", "pitchStdHz", "speechRateWpm", "energyMeanDb", "silenceRatio")


def update_baseline(
    baseline: dict[str, Any] | None, window: dict[str, Any], voiced_ms: int
) -> dict[str, Any]:
    """Running mean of the window features, weighted by voiced time."""
    b = dict(baseline or {})
    prev = float(b.get("voicedMs") or 0)
    total = prev + voiced_ms
    if total <= 0:
        return b
    for k in BASELINE_KEYS:
        x = window.get(k)
        if x is None:
            continue
        old = b.get(k)
        b[k] = round(
            float(x) if old is None or prev == 0 else (old * prev + x * voiced_ms) / total, 3
        )
    b["voicedMs"] = int(total)
    return b


def baseline_ready(baseline: dict[str, Any] | None) -> bool:
    return bool(baseline) and float(baseline.get("voicedMs") or 0) >= BASELINE_SPEECH_MS


def deviation(baseline: dict[str, Any], window: dict[str, Any]) -> dict[str, float | None]:
    """Deviation in units of an expected spread for that feature (relative, with a floor)."""

    def z(key: str, rel: float, floor: float) -> float | None:
        x, b = window.get(key), baseline.get(key)
        if x is None or b is None:
            return None
        scale = max(abs(float(b)) * rel, floor)
        return round((float(x) - float(b)) / scale, 2)

    return {
        "pitchStdZ": z("pitchStdHz", 0.3, 5.0),
        "speechRateZ": z("speechRateWpm", 0.25, 15.0),
        "silenceRatioZ": z("silenceRatio", 0.0, 0.15),
        "energyZ": z("energyMeanDb", 0.0, 3.0),
    }
