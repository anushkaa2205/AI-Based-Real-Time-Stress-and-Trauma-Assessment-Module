"""Voice emotion (task 7.4, FR-VOI-06, AC-VOI-04): a label and a confidence for every window.

Primary: emotion2vec+ base (via FunASR). Fallback: a simple rule on the deviations from the
speaker's baseline, so a window always gets a label even when the model is not loaded.
Labels: fear, sadness, anger, neutral, flat (plus happy/other from the model).
"""

from __future__ import annotations

import threading
from typing import Any

import numpy as np

from app.audio.decode import SAMPLE_RATE

SER_REPO = "emotion2vec/emotion2vec_plus_base"
SER_VERSION = "emotion2vec_plus_base"

# emotion2vec labels look like "恐惧/fearful"; we keep the English part and map it.
LABEL_MAP = {
    "angry": "anger",
    "disgusted": "anger",
    "fearful": "fear",
    "sad": "sadness",
    "neutral": "neutral",
    "happy": "happy",
    "surprised": "other",
    "other": "other",
    "<unk>": "other",
}

_lock = threading.Lock()
_model: Any = None
_failed = False


def ser_loaded() -> bool:
    return _model is not None


def _load() -> Any:
    global _model, _failed
    with _lock:
        if _model is None and not _failed:
            try:
                from funasr import AutoModel

                _model = AutoModel(
                    model=SER_REPO,
                    hub="hf",
                    disable_update=True,
                    disable_pbar=True,
                    log_level="ERROR",
                )
            except Exception as e:
                _failed = True  # do not retry every window; the rule-based fallback takes over
                print(f"[emotion] model unavailable: {type(e).__name__}")
        return _model


def preload() -> bool:
    return _load() is not None


def _flat(dev: dict[str, Any] | None) -> bool:
    """Very flat pitch and quiet voice compared with the speaker's own start: "numb or flat"."""
    if not dev:
        return False
    p, e = dev.get("pitchStdZ"), dev.get("energyZ")
    return p is not None and p <= -1.5 and (e is None or e <= -0.5)


def rule_based(dev: dict[str, Any] | None) -> dict[str, Any]:
    """Fallback when the model is unavailable: low-confidence labels from deviations only."""
    if _flat(dev):
        return {
            "label": "flat",
            "confidence": 0.45,
            "distribution": {"flat": 0.45, "neutral": 0.55},
        }
    p = (dev or {}).get("pitchStdZ")
    r = (dev or {}).get("speechRateZ")
    if p is not None and p >= 1.5 and (r is None or r >= 0.5):
        return {"label": "fear", "confidence": 0.4, "distribution": {"fear": 0.4, "neutral": 0.6}}
    return {"label": "neutral", "confidence": 0.5, "distribution": {"neutral": 1.0}}


def classify(
    samples: np.ndarray, dev: dict[str, Any] | None, voiced_ms: int
) -> tuple[dict[str, Any], str]:
    """Synchronous (CPU); call it in a worker thread. Returns (emotion, modelVersion)."""
    model = _load() if voiced_ms >= 500 else None
    if model is None:
        return rule_based(dev), "rules@1"
    res = model.generate(
        samples.astype(np.float32), granularity="utterance", extract_embedding=False, fs=SAMPLE_RATE
    )
    item = res[0] if res else {}
    dist: dict[str, float] = {}
    for lab, score in zip(item.get("labels", []), item.get("scores", []), strict=False):
        key = LABEL_MAP.get(str(lab).split("/")[-1].strip().lower(), "other")
        dist[key] = dist.get(key, 0.0) + float(score)
    if not dist:
        return rule_based(dev), "rules@1"
    total = sum(dist.values()) or 1.0
    dist = {k: round(v / total, 3) for k, v in dist.items()}
    label, conf = max(dist.items(), key=lambda kv: kv[1])
    # The model has no "flat" class: a neutral voice that is much flatter and quieter than
    # the speaker's own start is reported as flat (FR-VOI-06 "numb or flat").
    if label == "neutral" and _flat(dev):
        label = "flat"
    return {"label": label, "confidence": round(conf, 3), "distribution": dist}, SER_VERSION
