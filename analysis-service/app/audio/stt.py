"""Speech-to-text (task 7.2, FR-VOI-01, decision D4).

- Hindi, English, Hinglish: Groq `whisper-large-v3-turbo` (free tier, word timings).
- Marathi, Tamil, Bengali: AI4Bharat IndicConformer-600M, self-hosted (gated; needs HF_TOKEN).
Each falls back to the other when it fails; if both fail the caller keeps the acoustic
features and the victim can type instead (NFR-REL-02).
Audio and transcripts are never logged.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any

import httpx
import numpy as np

from app.http import shared_client

GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
WHISPER_MODEL = "whisper-large-v3-turbo"
INDIC_REPO = "ai4bharat/indic-conformer-600m-multilingual"
INDIC_LANGS = {"mr", "ta", "bn"}
WHISPER_LANGS = {"hi", "en"}


class SttError(RuntimeError):
    pass


@dataclass
class Transcript:
    text: str
    language: str | None
    confidence: float | None
    words: list[dict[str, Any]] = field(default_factory=list)
    model: str = ""


def to_opus(samples: np.ndarray) -> bytes:
    """Compact Ogg/Opus of the decoded 16 kHz mono audio (~10 KB per 5 s instead of ~160 KB WAV)."""
    import io

    import av

    buf = io.BytesIO()
    with av.open(buf, mode="w", format="ogg") as out:
        st = out.add_stream("libopus", rate=48_000, layout="mono")
        st.bit_rate = 24_000
        pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16).reshape(1, -1)
        frame = av.AudioFrame.from_ndarray(pcm, format="s16", layout="mono")
        frame.sample_rate = 16_000
        rs = av.AudioResampler(format="s16", layout="mono", rate=48_000)
        for fr in rs.resample(frame) + rs.resample(None):
            for pkt in st.encode(fr):
                out.mux(pkt)
        for pkt in st.encode(None):
            out.mux(pkt)
    return buf.getvalue()


async def whisper(
    api_key: str | None, samples: np.ndarray, language: str | None, offset_ms: int
) -> Transcript:
    if not api_key:
        raise SttError("groq not configured")
    data: dict[str, Any] = {
        "model": WHISPER_MODEL,
        "response_format": "verbose_json",
        "timestamp_granularities[]": "word",
        "temperature": "0",
    }
    if language in WHISPER_LANGS:
        data["language"] = language  # Hinglish: leave unset so Whisper detects it
    audio = to_opus(samples)
    try:
        r = await shared_client().post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            data=data,
            files={"file": ("chunk.ogg", audio, "audio/ogg")},
            timeout=httpx.Timeout(10.0, connect=3.0),
        )
    except httpx.HTTPError as e:
        raise SttError(f"groq unreachable: {type(e).__name__}") from None
    if r.status_code != 200:
        raise SttError(f"groq {r.status_code}")
    body = r.json()
    words = [
        {
            "w": w.get("word", "").strip(),
            "startMs": offset_ms + round(float(w.get("start", 0)) * 1000),
            "endMs": offset_ms + round(float(w.get("end", 0)) * 1000),
        }
        for w in body.get("words") or []
        if w.get("word", "").strip()
    ]
    segs = body.get("segments") or []
    # avg_logprob → a rough 0–1 confidence
    conf = float(np.exp(np.mean([s.get("avg_logprob", -1.0) for s in segs]))) if segs else None
    lang = body.get("language")
    lang_code = {
        "hindi": "hi",
        "english": "en",
        "marathi": "mr",
        "tamil": "ta",
        "bengali": "bn",
    }.get(str(lang).lower(), lang)
    return Transcript(
        text=(body.get("text") or "").strip(),
        language=lang_code,
        confidence=round(conf, 2) if conf else None,
        words=words,
        model=f"groq:{WHISPER_MODEL}",
    )


#: Pinned commit of the model repo; overridable with INDIC_REVISION.
INDIC_DEFAULT_REVISION = "2a77d305038dfc502fd9464e7d028b90381976cb"
#: Only the CTC path is used: skip the RNN-T decoder and per-language joint networks.
INDIC_IGNORE = ["assets/joint_*", "assets/rnnt_decoder*", "*.py"]
BLANK_ID = 256

_indic_lock = threading.Lock()
_indic: dict[str, Any] | None = None


def indic_loaded() -> bool:
    return _indic is not None


def _load_indic(token: str | None, revision: str | None) -> dict[str, Any]:
    """Our own loader for the IndicConformer ONNX export (same steps as the model card's CTC path).

    We do not use `trust_remote_code`: the repo's loader would run code from the hub and
    ignores the pinned revision. Here no repo code runs and the files are pinned.
    """
    global _indic
    with _indic_lock:
        if _indic is None:
            if not token:
                raise SttError("HF_TOKEN missing")
            import json
            from pathlib import Path

            import onnxruntime as ort
            import torch
            from huggingface_hub import snapshot_download

            loc = Path(
                snapshot_download(
                    INDIC_REPO,
                    revision=revision or INDIC_DEFAULT_REVISION,
                    token=token,
                    ignore_patterns=INDIC_IGNORE,
                )
            )
            a = loc / "assets"
            cpu = ["CPUExecutionProvider"]
            _indic = {
                "pre": torch.jit.load(str(a / "preprocessor.ts"), map_location="cpu"),
                "encoder": ort.InferenceSession(str(a / "encoder.onnx"), providers=cpu),
                "ctc": ort.InferenceSession(str(a / "ctc_decoder.onnx"), providers=cpu),
                "vocab": json.loads((a / "vocab.json").read_text(encoding="utf-8")),
                "masks": json.loads((a / "language_masks.json").read_text(encoding="utf-8")),
            }
        return _indic


def indic(
    token: str | None, revision: str | None, samples: np.ndarray, language: str
) -> Transcript:
    """Greedy CTC decoding. Synchronous (CPU); call it in a worker thread."""
    import torch

    m = _load_indic(token, revision)
    if language not in m["masks"]:
        raise SttError("unsupported language")
    wav = torch.from_numpy(samples).unsqueeze(0)
    with torch.inference_mode():
        signal, length = m["pre"](input_signal=wav, length=torch.tensor([wav.shape[-1]]))
    out, _lens = m["encoder"].run(
        ["outputs", "encoded_lengths"], {"audio_signal": signal.numpy(), "length": length.numpy()}
    )
    logprobs = m["ctc"].run(["logprobs"], {"encoder_output": out})[0][:, :, m["masks"][language]]
    path = np.argmax(logprobs[0], axis=-1)
    collapsed = [int(t) for i, t in enumerate(path) if i == 0 or t != path[i - 1]]
    vocab = m["vocab"][language]
    text = "".join(vocab[t] for t in collapsed if t != BLANK_ID).replace("▁", " ").strip()
    return Transcript(
        text=text,
        language=language,
        confidence=None,
        words=[],
        model="ai4bharat:indic-conformer-600m:ctc",
    )
