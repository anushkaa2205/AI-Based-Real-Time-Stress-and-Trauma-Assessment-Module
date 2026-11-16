"""Speaker separation for two-voice calls (task M.10, FR-VOI-10, AC-VOI-08).

The two-voice fixture is offline text-to-speech (two Windows voices, no real person): an operator
and a caller taking turns. Two synthetic voices of different genders are easier to tell apart than
two real people, so these tests prove the mechanics, not real-world accuracy.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from app.audio import features as fx
from app.audio import speakers as spk
from app.audio import stt
from app.audio.analyze import _split_words
from app.audio.decode import SAMPLE_RATE

FIXTURE = Path(__file__).parent / "fixtures" / "audio" / "two_voices_en.wav"

#: Who speaks when in the fixture (seconds), from the script in its README.
TRUTH = [
    (0.1, 4.6, "OPERATOR"),
    (6.1, 10.6, "CALLER"),
    (12.0, 15.1, "OPERATOR"),
    (16.5, 19.0, "CALLER"),
    (20.3, 22.7, "OPERATOR"),
    (24.1, 26.5, "CALLER"),
]


def truth_at(seconds: float) -> str:
    return next(w for s, e, w in TRUTH if s - 0.3 <= seconds <= e + 0.3)


# --- the algorithm, with fake fingerprints ---------------------------------------------------

OP = np.array([1.0, 0.0, 0.0], dtype=np.float32)
CA = np.array([0.0, 1.0, 0.0], dtype=np.float32)


def fake_embed(samples: np.ndarray) -> np.ndarray:
    """Quiet stretches are one voice, loud ones the other; 0.5 is in between (ambiguous)."""
    level = float(np.mean(np.abs(samples)))
    if 0.45 <= level <= 0.55:
        return (OP + CA) / np.sqrt(2)
    return OP if level < 0.45 else CA


def window(stretches: list[tuple[int, int, float]], ms: int = 5000) -> np.ndarray:
    x = np.zeros(ms * SAMPLE_RATE // 1000, dtype=np.float32)
    for s, e, level in stretches:
        x[s * SAMPLE_RATE // 1000 : e * SAMPLE_RATE // 1000] = level
    return x


def test_first_voice_is_the_operator_and_labels_follow_the_voices():
    x = window([(0, 1500, 0.3), (2000, 3500, 0.7)])
    sep = spk.separate(x, [(0, 1500), (2000, 3500)], None, "OPERATOR", embed=fake_embed)
    assert [w for _, _, w in sep.labels] == ["OPERATOR", "CALLER"]
    assert sep.separated and sep.confident
    assert sep.ms("OPERATOR") == 1500 and sep.ms("CALLER") == 1500


def test_labels_stay_the_same_across_windows_through_the_state():
    first = spk.separate(
        window([(0, 1500, 0.3), (2000, 3500, 0.7)]),
        [(0, 1500), (2000, 3500)],
        None,
        "OPERATOR",
        embed=fake_embed,
    )
    # Next window: the caller speaks first this time; the state still knows who is who.
    second = spk.separate(
        window([(0, 1500, 0.7), (2000, 3500, 0.3)]),
        [(0, 1500), (2000, 3500)],
        first.state.dumps(),
        "OPERATOR",
        embed=fake_embed,
    )
    assert [w for _, _, w in second.labels] == ["CALLER", "OPERATOR"]


def test_the_caller_may_be_said_to_speak_first():
    sep = spk.separate(window([(0, 1500, 0.3)]), [(0, 1500)], None, "CALLER", embed=fake_embed)
    assert [w for _, _, w in sep.labels] == ["CALLER"]


def test_voices_too_close_to_tell_apart_are_not_confident():
    state = spk.separate(
        window([(0, 1500, 0.3), (2000, 3500, 0.7)]),
        [(0, 1500), (2000, 3500)],
        None,
        "OPERATOR",
        embed=fake_embed,
    ).state.dumps()
    sep = spk.separate(window([(0, 3000, 0.5)]), [(0, 3000)], state, "OPERATOR", embed=fake_embed)
    assert sep.separated and not sep.confident


def test_short_stretches_take_the_label_of_their_neighbour():
    x = window(
        [(0, 1500, 0.3), (1700, 2100, 0.7)]
    )  # the second stretch is too short to fingerprint
    sep = spk.separate(x, [(0, 1500), (1700, 2100)], None, "OPERATOR", embed=fake_embed)
    assert all(w == "OPERATOR" for _, _, w in sep.labels)


def test_speech_too_short_to_fingerprint_is_not_separated():
    sep = spk.separate(window([(0, 400, 0.3)]), [(0, 400)], None, "OPERATOR", embed=fake_embed)
    assert not sep.separated and not sep.confident and sep.labels == []


def test_state_holds_only_fingerprints_and_survives_bad_input():
    sep = spk.separate(
        window([(0, 1500, 0.3), (2000, 3500, 0.7)]),
        [(0, 1500), (2000, 3500)],
        None,
        "OPERATOR",
        embed=fake_embed,
    )
    state = json.loads(sep.state.dumps())
    assert set(state) == {"v", "first", "voices"} and set(state["voices"]) == {"OPERATOR", "CALLER"}
    assert all(len(v["c"]) == 3 for v in state["voices"].values())  # fingerprints, never samples
    assert spk.State.loads("not json", "OPERATOR").voices == {}


def test_words_are_split_by_speaker():
    sep = spk.Separation(
        labels=[(0, 1500, "OPERATOR"), (2000, 3500, "CALLER")],
        separated=True,
        confident=True,
        state=spk.State(),
    )
    t = stt.Transcript(
        text="are you safe no",
        language="en",
        confidence=0.9,
        words=[
            {"w": "are", "startMs": 10_100, "endMs": 10_300},
            {"w": "you", "startMs": 10_300, "endMs": 10_500},
            {"w": "safe", "startMs": 10_600, "endMs": 11_000},
            {"w": "No", "startMs": 12_200, "endMs": 12_500},
        ],
    )
    caller, operator = _split_words(t, sep, start_ms=10_000)
    assert caller.text == "No" and operator == "are you safe"


# --- AC-VOI-08 on the synthetic two-voice call, with the real speaker model ------------------


@pytest.fixture(scope="module")
def call() -> np.ndarray:
    data, sr = sf.read(FIXTURE, dtype="float32")
    assert sr == SAMPLE_RATE
    return data


@pytest.fixture(scope="module")
def model_ready() -> None:
    if spk._load() is None:
        pytest.skip("speaker model not available offline")


def test_every_stretch_of_the_call_gets_the_right_speaker_in_live_windows(call, model_ready):
    state = None
    checked = 0
    for start in range(0, call.size, 5 * SAMPLE_RATE):
        w = call[start : start + 5 * SAMPLE_RATE]
        seg = fx.speech_segments(w)
        sep = spk.separate(w, seg.speech, state, "OPERATOR")
        state = sep.state.dumps()
        assert sep.confident, f"window at {start / SAMPLE_RATE:.0f} s"
        for s, e, who in sep.labels:
            mid = start / SAMPLE_RATE + (s + e) / 2000
            assert who == truth_at(mid), f"{mid:.1f} s"
            checked += 1
    assert checked >= 8
