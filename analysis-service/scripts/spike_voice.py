"""Voice spike (Phase 7 plan, decision D4).

Measures seconds per 5-second chunk and RAM with all models loaded.

Run from analysis-service/:  .venv\\Scripts\\python scripts\\spike_voice.py
Uses the synthetic fixture only. Prints timings, never transcripts.
"""

from __future__ import annotations

import asyncio
import io
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

from app.audio import emotion as ser  # noqa: E402
from app.audio import features as fx  # noqa: E402
from app.audio import stt  # noqa: E402
from app.audio.decode import SAMPLE_RATE, decode  # noqa: E402
from app.config import load_settings  # noqa: E402

FIXTURE = os.path.join(
    os.path.dirname(__file__), "..", "tests", "fixtures", "audio", "pauses_en.wav"
)


def rss_mb() -> float:
    try:
        import psutil

        return psutil.Process().memory_info().rss / 1e6
    except ImportError:
        return float("nan")


def to_webm(samples: np.ndarray) -> bytes:
    """Encode like a browser MediaRecorder chunk: Opus in WebM, mono, 48 kHz."""
    import av

    buf = io.BytesIO()
    with av.open(buf, mode="w", format="webm") as out:
        st = out.add_stream("libopus", rate=48_000, layout="mono")
        frame = av.AudioFrame.from_ndarray(
            (samples * 32767).astype(np.int16).reshape(1, -1), format="s16", layout="mono"
        )
        frame.sample_rate = SAMPLE_RATE
        resampler = av.AudioResampler(format="s16", layout="mono", rate=48_000)
        for f in resampler.resample(frame) + resampler.resample(None):
            for pkt in st.encode(f):
                out.mux(pkt)
        for pkt in st.encode(None):
            out.mux(pkt)
    return buf.getvalue()


def timed(label: str, fn, *a):
    t = time.perf_counter()
    r = fn(*a)
    print(f"  {label:<22} {1000 * (time.perf_counter() - t):7.0f} ms")
    return r


async def main() -> None:
    s = load_settings()
    print(f"RSS at start: {rss_mb():.0f} MB")
    audio, sr = sf.read(FIXTURE, dtype="float32")
    assert sr == SAMPLE_RATE
    chunks = [audio[i : i + 5 * SAMPLE_RATE] for i in range(0, audio.size, 5 * SAMPLE_RATE)]
    webms = [to_webm(c) for c in chunks]
    print(f"{len(chunks)} chunks; webm sizes KB: {[round(len(w) / 1024, 1) for w in webms]}")

    print("Loading models (first-time downloads can take a while)…")
    t = time.perf_counter()
    fx._vad_model()
    print(f"  silero VAD loaded        {time.perf_counter() - t:6.1f} s, RSS {rss_mb():.0f} MB")
    t = time.perf_counter()
    ok = ser.preload()
    print(f"  emotion2vec+ loaded={ok}  {time.perf_counter() - t:6.1f} s, RSS {rss_mb():.0f} MB")
    t = time.perf_counter()
    try:
        stt._load_indic(s.hf_token, s.indic_revision)
        print(f"  IndicConformer loaded    {time.perf_counter() - t:6.1f} s, RSS {rss_mb():.0f} MB")
    except Exception as e:
        print(f"  IndicConformer FAILED: {type(e).__name__}: {e}")

    for i, w in enumerate(webms):
        print(f"chunk {i} ({len(chunks[i]) / SAMPLE_RATE:.1f} s):")
        smp = timed("decode", decode, w, 6.5)
        seg = timed("VAD", fx.speech_segments, smp)
        timed("pitch+quality", fx.pitch, smp)
        timed("energy", fx.energy, smp, seg)
        timed("emotion2vec+", ser.classify, smp, None, seg.voiced_ms)
        if stt.indic_loaded():
            timed("IndicConformer (mr)", stt.indic, s.hf_token, s.indic_revision, smp, "mr")
        t = time.perf_counter()
        try:
            await stt.whisper(s.groq_api_key, smp, "en", 0)
            print(f"  {'Groq Whisper (net)':<22} {1000 * (time.perf_counter() - t):7.0f} ms")
        except Exception as e:
            print(f"  Groq Whisper failed: {type(e).__name__}")
    print(f"RSS at end: {rss_mb():.0f} MB")


if __name__ == "__main__":
    asyncio.run(main())
