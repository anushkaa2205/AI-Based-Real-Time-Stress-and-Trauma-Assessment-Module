"""Speaker separation for two-voice call audio (task M.10, FR-VOI-10, AC-VOI-08).

A helpline recording often holds both voices. Each stretch of speech (Silero VAD) gets a voice
fingerprint from CAM++ (via FunASR, already installed for emotion2vec), and the fingerprints are
matched against the call's two speakers so the labels stay the same from window to window:

- the first voice heard is the operator, unless the caller speaks first (`firstSpeaker`);
- a stretch close enough to a known voice joins it; a clearly different one is the other speaker;
- when the two are too close to tell apart, or most speech is too short to fingerprint, the
  window is "not confident" and the web app marks the assessment limited confidence.

The service stays stateless: the two fingerprints travel in `state` (an opaque JSON string), which
the web app stores encrypted and deletes when the call ends. Fingerprints are biometric; they are
never logged.
Audio stays in memory (FR-VOI-09).
"""

from __future__ import annotations

import json
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.audio.decode import SAMPLE_RATE

SPK_REPO = "funasr/campplus"
SPK_VERSION = "campplus@funasr"
STATE_VERSION = 1

#: Shorter stretches cannot be fingerprinted reliably; they take their nearest neighbour's label.
MIN_EMBED_MS = 600
#: Long stretches are cut into pieces so a change of speaker without a pause is still caught.
PIECE_MS = 1_600
#: Cosine similarity to the only known voice below which a stretch is the other speaker.
NEW_SPEAKER_BELOW = 0.45
#: With both voices known, a stretch closer to one than the other by less than this is ambiguous.
MIN_MARGIN = 0.08
#: A window is not confident when more than this share of its speech could not be fingerprinted.
MAX_UNSURE_SHARE = 0.35

Embedder = Callable[[np.ndarray], np.ndarray]

_lock = threading.Lock()
_model: Any = None
_failed = False


def spk_loaded() -> bool:
    return _model is not None


def _load() -> Any:
    global _model, _failed
    with _lock:
        if _model is None and not _failed:
            try:
                from funasr import AutoModel

                _model = AutoModel(
                    model=SPK_REPO,
                    hub="hf",
                    disable_update=True,
                    disable_pbar=True,
                    log_level="ERROR",
                )
            except Exception as e:
                _failed = True  # do not retry every window; MIXED audio is then marked unseparated
                print(f"[speakers] model unavailable: {type(e).__name__}")
        return _model


def _embed(samples: np.ndarray) -> np.ndarray:
    """CAM++ fingerprint (192 numbers), unit length. Raises if the model is unavailable."""
    model = _load()
    if model is None:
        raise RuntimeError("speaker model unavailable")
    out = model.generate(input=samples.astype(np.float32), disable_pbar=True)
    v = np.asarray(out[0]["spk_embedding"], dtype=np.float32).reshape(-1)
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


@dataclass
class Voice:
    centroid: np.ndarray
    n: int


@dataclass
class State:
    first: str = "OPERATOR"
    voices: dict[str, Voice] = field(default_factory=dict)

    def dumps(self) -> str:
        return json.dumps(
            {
                "v": STATE_VERSION,
                "first": self.first,
                "voices": {
                    k: {"c": [round(float(x), 5) for x in v.centroid], "n": v.n}
                    for k, v in self.voices.items()
                },
            }
        )

    @staticmethod
    def loads(raw: str | None, first: str) -> State:
        if not raw:
            return State(first=first)
        try:
            d = json.loads(raw)
            if d.get("v") != STATE_VERSION:
                return State(first=first)
            voices = {
                k: Voice(np.asarray(v["c"], dtype=np.float32), int(v["n"]))
                for k, v in (d.get("voices") or {}).items()
                if k in ("OPERATOR", "CALLER")
            }
            return State(first=d.get("first") or first, voices=voices)
        except (ValueError, KeyError, TypeError):
            return State(first=first)


@dataclass
class Separation:
    #: (startMs, endMs, "OPERATOR" | "CALLER") within the window
    labels: list[tuple[int, int, str]]
    separated: bool
    confident: bool
    state: State

    def ms(self, who: str) -> int:
        return sum(e - s for s, e, w in self.labels if w == who)

    def label_at(self, ms: float) -> str | None:
        """Speaker at a time in the window: the stretch that contains it, else the nearest one."""
        if not self.labels:
            return None
        best = min(
            self.labels,
            key=lambda x: 0 if x[0] <= ms <= x[1] else min(abs(ms - x[0]), abs(ms - x[1])),
        )
        return best[2]

    def samples_of(self, samples: np.ndarray, who: str) -> np.ndarray:
        parts = [
            samples[s * SAMPLE_RATE // 1000 : e * SAMPLE_RATE // 1000]
            for s, e, w in self.labels
            if w == who
        ]
        return np.concatenate(parts).astype(np.float32) if parts else np.zeros(0, dtype=np.float32)


def _pieces(speech: list[tuple[int, int]]) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for s, e in speech:
        n = max(1, round((e - s) / PIECE_MS))
        step = (e - s) / n
        out.extend((round(s + i * step), round(s + (i + 1) * step)) for i in range(n))
    return out


def _other(label: str) -> str:
    return "CALLER" if label == "OPERATOR" else "OPERATOR"


def _cos(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    return float(np.dot(a, b) / (na * nb)) if na and nb else 0.0


def separate(
    samples: np.ndarray,
    speech: list[tuple[int, int]],
    state_raw: str | None,
    first_speaker: str = "OPERATOR",
    embed: Embedder | None = None,
) -> Separation:
    """Label each stretch of speech in one window as OPERATOR or CALLER."""
    embed = embed or _embed
    state = State.loads(state_raw, "CALLER" if first_speaker == "CALLER" else "OPERATOR")
    pieces = _pieces(speech)
    assigned: list[tuple[int, int, str | None]] = []
    ambiguous_ms = 0
    for s, e in pieces:
        if e - s < MIN_EMBED_MS:
            assigned.append((s, e, None))
            continue
        v = embed(samples[s * SAMPLE_RATE // 1000 : e * SAMPLE_RATE // 1000])
        if not state.voices:
            label = state.first
        elif len(state.voices) == 1:
            ((known, voice),) = state.voices.items()
            label = known if _cos(v, voice.centroid) >= NEW_SPEAKER_BELOW else _other(known)
        else:
            sims = {k: _cos(v, voice.centroid) for k, voice in state.voices.items()}
            label = max(sims, key=sims.get)  # type: ignore[arg-type]
            if abs(sims["OPERATOR"] - sims["CALLER"]) < MIN_MARGIN:
                ambiguous_ms += e - s
        voice = state.voices.get(label)
        if voice is None:
            state.voices[label] = Voice(v, 1)
        else:  # running mean, so the fingerprint settles over the call
            voice.centroid = (voice.centroid * voice.n + v) / (voice.n + 1)
            voice.n += 1
        assigned.append((s, e, label))

    labelled = [(s, e, w) for s, e, w in assigned if w is not None]
    if not labelled:
        # Speech too short to fingerprint (or none): nothing can be attributed with confidence.
        unknown = sum(e - s for s, e, _ in assigned)
        return Separation(labels=[], separated=unknown == 0, confident=unknown == 0, state=state)

    def nearest(ms: float) -> str:
        return min(labelled, key=lambda x: min(abs(ms - x[0]), abs(ms - x[1])))[2]

    unsure_ms = ambiguous_ms
    labels: list[tuple[int, int, str]] = []
    for s, e, w in assigned:
        if w is None:
            unsure_ms += e - s
            w = nearest((s + e) / 2)
        if labels and labels[-1][2] == w and s - labels[-1][1] <= 50:
            labels[-1] = (labels[-1][0], e, w)
        else:
            labels.append((s, e, w))
    voiced = sum(e - s for s, e, _ in assigned) or 1
    confident = unsure_ms / voiced <= MAX_UNSURE_SHARE
    return Separation(labels=labels, separated=True, confident=confident, state=state)


def warm_up() -> None:
    """Loads the model and fingerprints one second of a synthetic tone (no audio input involved)."""
    t = np.arange(SAMPLE_RATE, dtype=np.float32) / SAMPLE_RATE
    try:
        _embed((0.2 * np.sin(2 * np.pi * 180 * t)).astype(np.float32))
    except Exception as e:
        print(f"[speakers] warm-up skipped: {type(e).__name__}")
