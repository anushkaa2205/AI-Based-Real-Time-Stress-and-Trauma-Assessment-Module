"""Voice analysis (tasks 7.2–7.4, 7.10): AC-VOI-01/02/03/04, endpoint safety. Synthetic audio only.

The speech fixture is offline text-to-speech (no real voice): six phrases separated by five
inserted pauses of known length. Pitch tests use generated harmonic tones of known frequency.
Speech-to-text is replaced by a fake, so these tests need no network or API key.
"""

from __future__ import annotations

import io
import json
import time
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app.audio import emotion as ser
from app.audio import features as fx
from app.audio import speakers as spk
from app.audio import stt
from app.audio.decode import SAMPLE_RATE, BadAudio, decode
from app.config import Settings
from app.main import app, get_settings
from app.security import sign

FIXTURE = Path(__file__).parent / "fixtures" / "audio" / "pauses_en.wav"
INSERTED_PAUSES_MS = [700, 1000, 1300, 1600, 900]
FIXTURE_WORDS = 52
SECRET = "test-secret-for-signing-requests"


@pytest.fixture(scope="module")
def speech() -> np.ndarray:
    samples, sr = sf.read(FIXTURE, dtype="float32")
    assert sr == SAMPLE_RATE
    return samples


def tone(f0: np.ndarray | float, seconds: float, amp: float = 0.3) -> np.ndarray:
    """Harmonic complex (voice-like) with an instantaneous fundamental f0 (Hz)."""
    n = int(seconds * SAMPLE_RATE)
    f = np.full(n, f0, dtype=np.float64) if np.isscalar(f0) else np.asarray(f0, dtype=np.float64)
    phase = 2 * np.pi * np.cumsum(f) / SAMPLE_RATE
    y = sum(np.sin(k * phase) / k for k in range(1, 6))
    return (amp * y / np.max(np.abs(y))).astype(np.float32)


def to_webm(samples: np.ndarray) -> bytes:
    """Opus in WebM, like a browser MediaRecorder chunk."""
    import av

    buf = io.BytesIO()
    with av.open(buf, mode="w", format="webm") as out:
        st = out.add_stream("libopus", rate=48_000, layout="mono")
        frame = av.AudioFrame.from_ndarray(
            (samples * 32767).astype(np.int16).reshape(1, -1), format="s16", layout="mono"
        )
        frame.sample_rate = SAMPLE_RATE
        rs = av.AudioResampler(format="s16", layout="mono", rate=48_000)
        for fr in rs.resample(frame) + rs.resample(None):
            for pkt in st.encode(fr):
                out.mux(pkt)
        for pkt in st.encode(None):
            out.mux(pkt)
    return buf.getvalue()


# --- AC-VOI-01: pauses ---------------------------------------------------------------------


def test_detects_all_five_inserted_pauses_within_0_3_s(speech):
    seg = fx.speech_segments(speech)
    p = fx.pauses(seg)
    gaps = p["gapsMs"]
    assert len(gaps) == 5, gaps
    for got, want in zip(gaps, INSERTED_PAUSES_MS, strict=True):
        assert abs(got - want) <= 300, (got, want)
    assert p["count"] == 5
    assert p["maxMs"] == max(gaps)
    assert 0 < p["silenceRatio"] < 1


def test_long_silence_counts_as_an_event():
    quiet = np.zeros(int(3.5 * SAMPLE_RATE), dtype=np.float32)
    seg = fx.speech_segments(quiet)
    assert fx.leading_silence_ms(seg) >= fx.LONG_SILENCE_MS


# --- AC-VOI-02: pitch -------------------------------------------------------------------------


@pytest.mark.parametrize("f0", [120.0, 180.0, 240.0])
def test_mean_pitch_within_10_percent(f0):
    stats, _ = fx.pitch(tone(f0, 3.0))
    assert stats is not None
    assert abs(stats["meanHz"] - f0) / f0 <= 0.10


def test_flat_and_agitated_voices_deviate_from_the_speaker_baseline():
    t = np.arange(int(4 * SAMPLE_RATE)) / SAMPLE_RATE
    normal = tone(200 + 25 * np.sin(2 * np.pi * 0.8 * t), 4.0)  # ordinary intonation
    flat = tone(200.0, 4.0)  # monotone
    agitated = tone(200 + 70 * np.sin(2 * np.pi * 3.0 * t), 4.0)  # wide, fast swings

    def window(samples):
        p, _ = fx.pitch(samples)
        return {"pitchStdHz": p["stdHz"], "pitchMeanHz": p["meanHz"]}

    base = None
    for _ in range(5):  # 5 × 4 s of voiced audio → baseline ready (≥ 20 s)
        base = fx.update_baseline(base, window(normal), 4000)
    assert fx.baseline_ready(base)
    flat_z = fx.deviation(base, window(flat))["pitchStdZ"]
    agit_z = fx.deviation(base, window(agitated))["pitchStdZ"]
    assert flat_z is not None and flat_z <= -1.5  # web flags "low variation"
    assert agit_z is not None and agit_z >= 1.5  # web flags "high variation"


def test_baseline_is_a_voiced_time_weighted_running_mean():
    b = fx.update_baseline(None, {"pitchMeanHz": 200.0}, 5000)
    b = fx.update_baseline(b, {"pitchMeanHz": 100.0}, 15000)
    assert b["pitchMeanHz"] == pytest.approx(125.0)
    assert b["voicedMs"] == 20000 and fx.baseline_ready(b)


# --- AC-VOI-03: speech rate -----------------------------------------------------------------


def test_speech_rate_within_15_percent_of_manual_count(speech):
    """Manual reference: known word count over speaking time.

    Speaking time = duration − inserted pauses − leading/trailing silence.
    """
    seg = fx.speech_segments(speech)
    rms = np.sqrt(np.convolve(speech**2, np.ones(160) / 160, mode="same"))
    loud = np.flatnonzero(rms > 0.01)
    edge_ms = (loud[0] + (speech.size - loud[-1])) * 1000 / SAMPLE_RATE
    ref_speaking_s = (speech.size * 1000 / SAMPLE_RATE - edge_ms - sum(INSERTED_PAUSES_MS)) / 1000
    manual_wpm = FIXTURE_WORDS / ref_speaking_s * 60
    measured_wpm = FIXTURE_WORDS / (seg.voiced_ms / 60_000)
    assert abs(measured_wpm - manual_wpm) / manual_wpm <= 0.15, (measured_wpm, manual_wpm)


# --- AC-VOI-04: emotion always has a label and a confidence ------------------------------


def test_rule_based_emotion_always_labels():
    for dev in [
        None,
        {"pitchStdZ": -2.0, "energyZ": -1.0},
        {"pitchStdZ": 2.0, "speechRateZ": 1.0},
        {"pitchStdZ": 0.1},
    ]:
        e = ser.rule_based(dev)
        assert e["label"] in {"fear", "sadness", "anger", "neutral", "flat"}
        assert 0 < e["confidence"] <= 1
    assert ser.rule_based({"pitchStdZ": -2.0, "energyZ": -1.0})["label"] == "flat"


# --- decoding and the endpoint ----------------------------------------------------------------


def test_decodes_browser_style_webm_opus(speech):
    out = decode(to_webm(speech[: 5 * SAMPLE_RATE]), 6.5)
    assert abs(out.size / SAMPLE_RATE - 5.0) < 0.1


def test_rejects_garbage_and_overlong_audio(speech):
    with pytest.raises(BadAudio):
        decode(b"not audio at all", 6.5)
    with pytest.raises(BadAudio):
        decode(to_webm(speech[: 10 * SAMPLE_RATE]), 6.5)


@pytest.fixture
def client(monkeypatch, tmp_path):
    s = Settings(SECRET, "fake-groq-key", None, "m", "g", tmp_path / "cache", False)
    app.dependency_overrides[get_settings] = lambda: s

    async def fake_whisper(api_key, samples, language, offset_ms):
        return stt.Transcript(
            text="the village meeting was held near the old school",
            language="en",
            confidence=0.9,
            words=[],
            model="fake:stt",
        )

    monkeypatch.setattr(stt, "whisper", fake_whisper)
    # Keep the unit tests fast and offline: the rule-based emotion path.
    monkeypatch.setattr(ser, "_load", lambda: None)
    # One fixed voice fingerprint: one voice, so MIXED audio is all the caller's (M.10).
    monkeypatch.setattr(spk, "_embed", lambda samples: np.ones(4, dtype=np.float32) / 2)
    yield TestClient(app)
    app.dependency_overrides.clear()


def multipart(meta: dict, audio: bytes) -> tuple[bytes, str]:
    b = "----testboundary123"
    body = (
        (
            f"--{b}\r\n"
            'Content-Disposition: form-data; name="meta"\r\n'
            "Content-Type: application/json\r\n\r\n"
            f"{json.dumps(meta)}\r\n"
            f"--{b}\r\n"
            'Content-Disposition: form-data; name="audio"; filename="chunk.webm"\r\n'
            "Content-Type: audio/webm\r\n\r\n"
        ).encode()
        + audio
        + f"\r\n--{b}--\r\n".encode()
    )
    return body, f"multipart/form-data; boundary={b}"


def signed(body: bytes, ctype: str) -> dict[str, str]:
    ts = str(int(time.time()))
    return {"content-type": ctype, "x-timestamp": ts, "x-signature": sign(SECRET, ts, body)}


def test_endpoint_returns_features_baseline_and_emotion(client, speech):
    body, ctype = multipart(
        {"windowIndex": 3, "startMs": 15000, "languageHint": "en"},
        to_webm(speech[: 5 * SAMPLE_RATE]),
    )
    r = client.post("/v1/analyze/audio", content=body, headers=signed(body, ctype))
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["transcript"]["text"].startswith("the village")
    assert set(j["pauses"]) == {"count", "meanMs", "maxMs", "silenceRatio"}
    assert j["pitch"]["meanHz"] > 80
    assert j["speechRateWpm"] and j["speechRateWpm"] > 0
    assert j["emotion"]["label"] and 0 < j["emotion"]["confidence"] <= 1  # AC-VOI-04
    assert j["baselineDeviation"] is None and j["baselineUpdate"]["voicedMs"] > 0  # first window
    assert j["modelVersion"]["vad"].startswith("silero")


def test_endpoint_reports_deviation_once_the_baseline_is_ready(client, speech):
    base = {
        "pitchMeanHz": 200.0,
        "pitchStdHz": 30.0,
        "speechRateWpm": 150.0,
        "energyMeanDb": -25.0,
        "silenceRatio": 0.2,
        "voicedMs": 25000,
    }
    body, ctype = multipart(
        {"windowIndex": 9, "startMs": 45000, "baseline": base}, to_webm(speech[: 5 * SAMPLE_RATE])
    )
    j = client.post("/v1/analyze/audio", content=body, headers=signed(body, ctype)).json()
    assert j["baselineUpdate"] is None
    assert set(j["baselineDeviation"]) == {"pitchStdZ", "speechRateZ", "silenceRatioZ", "energyZ"}


def test_endpoint_security_and_errors(client, speech):
    body, ctype = multipart({"windowIndex": 0}, to_webm(speech[: 2 * SAMPLE_RATE]))
    assert (
        client.post("/v1/analyze/audio", content=body, headers={"content-type": ctype}).status_code
        == 401
    )
    bad, bctype = multipart({"windowIndex": 0}, b"garbage bytes")
    r = client.post("/v1/analyze/audio", content=bad, headers=signed(bad, bctype))
    assert r.status_code == 400 and r.json()["code"] == "BAD_AUDIO"
    big, gctype = multipart({"windowIndex": 0}, b"x" * (300 * 1024))
    assert (
        client.post("/v1/analyze/audio", content=big, headers=signed(big, gctype)).status_code
        == 413
    )
    odd, octype = multipart(
        {"windowIndex": 0, "languageHint": "fr"}, to_webm(speech[: 2 * SAMPLE_RATE])
    )
    assert (
        client.post("/v1/analyze/audio", content=odd, headers=signed(odd, octype)).status_code
        == 422
    )


def test_endpoint_reports_speakers_for_mixed_and_caller_only_audio(client, speech):
    """Task M.10 (FR-VOI-10): MIXED is the default; one voice so far is all the caller's."""
    audio = to_webm(speech[: 5 * SAMPLE_RATE])
    body, ctype = multipart({"windowIndex": 0, "startMs": 0, "languageHint": "en"}, audio)
    j = client.post("/v1/analyze/audio", content=body, headers=signed(body, ctype)).json()
    sp = j["speakers"]
    assert sp["audioSource"] == "MIXED" and sp["singleVoice"] is True
    assert (
        sp["separated"] is False and sp["confident"] is False
    )  # limited confidence for this window
    assert j["transcript"]["text"].startswith("the village")  # nothing discarded
    assert json.loads(sp["state"])["voices"]  # fingerprints only, for the next window
    assert j["modelVersion"]["speakers"] == spk.SPK_VERSION

    body, ctype = multipart(
        {"windowIndex": 1, "startMs": 5000, "languageHint": "en", "audioSource": "CALLER_ONLY"},
        audio,
    )
    sp = client.post("/v1/analyze/audio", content=body, headers=signed(body, ctype)).json()[
        "speakers"
    ]
    assert sp == {
        **sp,
        "audioSource": "CALLER_ONLY",
        "separated": False,
        "confident": True,
        "operatorText": None,
        "state": None,
    }
