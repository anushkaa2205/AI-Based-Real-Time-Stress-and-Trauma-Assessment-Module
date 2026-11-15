"""Decode a browser audio chunk (webm/opus, ogg, wav) to 16 kHz mono float32 (ARCHITECTURE §7).

Decoding happens in memory only: the bytes are never written to disk (FR-VOI-09).
"""

from __future__ import annotations

import io

import numpy as np

SAMPLE_RATE = 16_000


class BadAudio(ValueError):
    """The bytes could not be decoded as audio (API_CONTRACTS §8.5 BAD_AUDIO)."""


def decode(data: bytes, max_seconds: float | None = None) -> np.ndarray:
    """Returns mono float32 samples in [-1, 1] at 16 kHz."""
    import av  # imported lazily so the text-only service starts without the voice stack

    if not data:
        raise BadAudio("empty")
    try:
        with av.open(io.BytesIO(data), mode="r") as container:
            stream = next((s for s in container.streams if s.type == "audio"), None)
            if stream is None:
                raise BadAudio("no audio stream")
            resampler = av.AudioResampler(format="flt", layout="mono", rate=SAMPLE_RATE)
            chunks: list[np.ndarray] = []
            total = 0
            limit = int(max_seconds * SAMPLE_RATE) if max_seconds else None
            for frame in container.decode(stream):
                for out in resampler.resample(frame):
                    arr = out.to_ndarray().reshape(-1)
                    chunks.append(arr)
                    total += arr.size
                if limit is not None and total > limit:
                    raise BadAudio("too long")
            for out in resampler.resample(None):  # flush
                chunks.append(out.to_ndarray().reshape(-1))
    except BadAudio:
        raise
    except Exception as e:  # PyAV raises many error types; all mean "not decodable"
        raise BadAudio(type(e).__name__) from None
    if not chunks:
        raise BadAudio("no samples")
    samples = np.concatenate(chunks).astype(np.float32)
    return np.clip(samples, -1.0, 1.0)
