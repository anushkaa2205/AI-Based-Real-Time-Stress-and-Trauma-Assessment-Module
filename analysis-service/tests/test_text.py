"""Text analysis endpoint with recorded model responses (task 4.5). Synthetic text only."""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app, get_cache, get_llm, get_settings
from app.security import sign, verify
from app.text.analyze import find_span
from app.text.cache import DiskCache
from app.text.lid import guess_language
from app.text.llm import FallbackLLM, GeminiProvider, GroqProvider, LLMError, RateLimited

FIXTURES = Path(__file__).parent / "fixtures"
SECRET = "test-secret-for-signing-requests"
HINDI = "वो लोग घर के बाहर खड़े हैं, कह रहे हैं केस वापस लो"
HINGLISH = "main kabhi khud ko nuksaan nahi pahunchaungi, bas dar lagta hai"


class RecordedLLM:
    """Returns a recorded answer, counts calls and keeps the last user payload."""

    def __init__(self, fixture: str | None = None, error: Exception | None = None):
        self.raw = json.loads((FIXTURES / fixture).read_text(encoding="utf-8")) if fixture else {}
        self.error = error
        self.calls = 0

    @property
    def version(self) -> str:
        return "recorded:test-model"

    async def complete_json(self, system, user, schema, schema_name):
        self.calls += 1
        self.last_user = json.loads(user)
        if self.error:
            raise self.error
        return self.raw, self.version


def settings(tmp_path: Path, cache: bool = False) -> Settings:
    return Settings(SECRET, None, None, "m", "g", tmp_path / "cache", cache)


@pytest.fixture
def make_client(tmp_path):
    def _make(llm, cache=False):
        s = settings(tmp_path, cache)
        app.dependency_overrides[get_settings] = lambda: s
        app.dependency_overrides[get_llm] = lambda: llm
        app.dependency_overrides[get_cache] = lambda: DiskCache(s.cache_dir, s.use_cache)
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


def post(client: TestClient, path: str, payload: dict, secret: str = SECRET, ts: int | None = None):
    body = json.dumps(payload, ensure_ascii=False).encode()
    stamp = str(ts if ts is not None else int(time.time()))
    headers = {
        "x-timestamp": stamp,
        "x-signature": sign(secret, stamp, body),
        "content-type": "application/json",
    }
    return client.post(path, content=body, headers=headers)


# --- signing (task 4.1) -------------------------------------------------------------


def test_signature_round_trip_and_rejections():
    body = b'{"text":"x"}'
    now = time.time()
    ts = str(int(now))
    good = sign(SECRET, ts, body)
    assert verify(SECRET, ts, good, body, now)
    assert not verify(SECRET, ts, good, b'{"text":"y"}', now)  # body changed
    assert not verify("other-secret", ts, good, body, now)  # wrong secret
    assert not verify(
        SECRET, str(int(now) - 61), sign(SECRET, str(int(now) - 61), body), body, now
    )  # too old
    assert not verify(SECRET, ts, None, body, now)
    assert not verify(None, ts, good, body, now)  # service without a secret refuses everything


def test_signature_matches_the_web_app_test_vector():
    # Same vector as web/tests/unit/analysis-client.test.ts
    assert sign("vector-secret", "1700000000", b'{"a":1}') == (
        "sha256="
        + __import__("hmac").new(b"vector-secret", b'1700000000.{"a":1}', "sha256").hexdigest()
    )


def test_unsigned_or_badly_signed_requests_get_401(make_client):
    client = make_client(RecordedLLM("hindi_threat.json"))
    assert client.post("/v1/analyze/text", json={"text": HINDI}).status_code == 401
    assert post(client, "/v1/analyze/text", {"text": HINDI}, secret="wrong").status_code == 401
    assert (
        post(client, "/v1/analyze/text", {"text": HINDI}, ts=int(time.time()) - 600).status_code
        == 401
    )


# --- analysis (tasks 4.2–4.5) --------------------------------------------------------


def test_hindi_threat_keeps_only_quotes_found_in_the_original(make_client):
    client = make_client(RecordedLLM("hindi_threat.json"))
    res = post(client, "/v1/analyze/text", {"text": HINDI, "languageHint": "hi"})
    assert res.status_code == 200
    body = res.json()
    assert body["language"] == {"code": "hi", "confidence": 0.97, "script": "Deva"}
    dims = [(i["dimension"], i["flags"]) for i in body["indicators"]]
    assert dims == [
        ("INTIMIDATION", ["ACCUSED_PRESENT"]),
        ("INTIMIDATION", ["PRESSURE_TO_WITHDRAW"]),
    ]
    for ind in body["indicators"]:
        ev = ind["evidence"]
        assert HINDI[ev["start"] : ev["end"]] == ev["quote"]  # rule 12
    assert body["immediateDanger"]["detected"] is True
    assert body["emotion"]["label"] == "fear"
    assert body["translation"]["en"].startswith("Those people")
    assert body["modelVersion"]["nlp"] == "recorded:test-model@prompt-v2"


def test_previous_question_is_context_only(make_client):
    """Task M.9: the question asked just before is passed to the model.

    Quotes still come from the message.
    """
    llm = RecordedLLM("hindi_threat.json")
    client = make_client(llm)
    payload = {
        "text": HINDI,
        "languageHint": "hi",
        "previousQuestion": "Are you safe right now?",
    }
    body = post(client, "/v1/analyze/text", payload).json()
    assert llm.last_user["previousQuestion"] == "Are you safe right now?"
    assert llm.last_user["message"] == HINDI
    for ind in body["indicators"]:
        ev = ind["evidence"]
        assert HINDI[ev["start"] : ev["end"]] == ev["quote"]  # rule 12: never from the question
    post(client, "/v1/analyze/text", {"text": HINDI, "languageHint": "hi"})
    assert llm.last_user["previousQuestion"] is None


def test_hinglish_negation_clamping_and_unknown_flags(make_client):
    client = make_client(RecordedLLM("hinglish_negation.json"))
    body = post(client, "/v1/analyze/text", {"text": HINGLISH}).json()
    assert body["language"]["code"] == "hi-Latn"
    si, fear = body["indicators"]
    assert si["negated"] is True
    assert fear["score"] == 1.0  # clamped
    assert fear["flags"] == []  # unknown flag dropped
    assert (
        fear["evidence"]["quote"] == "dar lagta hai"
    )  # case-insensitive match returns the original text
    assert body["immediateDanger"] == {"detected": False, "confidence": 0.1, "evidence": None}


def test_cache_avoids_a_second_model_call(make_client):
    llm = RecordedLLM("hindi_threat.json")
    client = make_client(llm, cache=True)
    first = post(client, "/v1/analyze/text", {"text": HINDI}).json()
    second = post(client, "/v1/analyze/text", {"text": HINDI}).json()
    assert llm.calls == 1
    assert first["cached"] is False and second["cached"] is True
    assert first["indicators"] == second["indicators"]


def test_model_failure_is_503_so_the_web_app_falls_back(make_client):
    client = make_client(RecordedLLM(error=LLMError("down")))
    res = post(client, "/v1/analyze/text", {"text": HINDI})
    assert res.status_code == 503
    assert res.json()["code"] == "MODEL_UNAVAILABLE"


def test_validation(make_client):
    client = make_client(RecordedLLM("hindi_threat.json"))
    assert post(client, "/v1/analyze/text", {"text": "  "}).status_code == 400
    assert post(client, "/v1/analyze/text", {"text": "x" * 4001}).status_code == 413


def test_summarize(make_client):
    class SummaryLLM(RecordedLLM):
        async def complete_json(self, system, user, schema, schema_name):
            self.calls += 1
            return {
                "summary": "सारांश",
                "summary_en": "Caller reports threats at home.",
            }, self.version

    client = make_client(SummaryLLM())
    res = post(
        client,
        "/v1/summarize",
        {"messages": [{"sender": "VICTIM", "text": HINDI}], "language": "hi"},
    )
    assert res.status_code == 200
    assert res.json() == {
        "summary": "सारांश",
        "summaryEn": "Caller reports threats at home.",
        "modelVersion": "recorded:test-model@summary-v1",
    }


# --- helpers ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "hint", "code", "script"),
    [
        (HINDI, None, "hi", "Deva"),
        ("मला भीती वाटते", "mr", "mr", "Deva"),
        ("আমি ভয় পাচ্ছি", None, "bn", "Beng"),
        ("எனக்கு பயமாக இருக்கிறது", None, "ta", "Taml"),
        (HINGLISH, None, "hi-Latn", "Latn"),
        ("They came again yesterday and I am scared", None, "en", "Latn"),
    ],
)
def test_language_guess_by_script(text, hint, code, script):
    got_code, _, got_script = guess_language(text, hint)
    assert (got_code, got_script) == (code, script)


def test_find_span_only_returns_exact_text():
    assert find_span(HINDI, "केस वापस लो") is not None
    assert find_span(HINDI, "withdraw the case") is None
    assert find_span("abc", "   ") is None


# --- providers -------------------------------------------------------------------------


def _mock_client(status: int, payload: dict) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(status, json=payload))
    )


async def test_groq_429_falls_back_to_gemini():
    groq = GroqProvider("k", "openai/gpt-oss-20b", client=_mock_client(429, {}))
    gemini_payload = {"candidates": [{"content": {"parts": [{"text": json.dumps({"ok": True})}]}}]}
    gemini = GeminiProvider("k", "gemini-2.5-flash", client=_mock_client(200, gemini_payload))
    raw, version = await FallbackLLM(groq, gemini).complete_json("s", "u", {}, "n")
    assert raw == {"ok": True}
    assert version == "gemini:gemini-2.5-flash"


async def test_groq_success_and_other_errors_do_not_fall_back():
    ok = {"choices": [{"message": {"content": json.dumps({"x": 1})}}]}
    groq = GroqProvider("k", "m", client=_mock_client(200, ok))
    assert (await FallbackLLM(groq, None).complete_json("s", "u", {}, "n"))[0] == {"x": 1}
    broken = GroqProvider("k", "m", client=_mock_client(500, {}))
    with pytest.raises(LLMError):
        await FallbackLLM(
            broken, GeminiProvider("k", "g", client=_mock_client(200, {}))
        ).complete_json("s", "u", {}, "n")
    with pytest.raises(RateLimited):
        await FallbackLLM(GroqProvider("k", "m", client=_mock_client(429, {})), None).complete_json(
            "s", "u", {}, "n"
        )


async def test_no_keys_means_model_unavailable():
    with pytest.raises(LLMError):
        await FallbackLLM(None, None).complete_json("s", "u", {}, "n")
