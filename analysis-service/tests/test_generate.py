"""Synthetic conversation generator for the demo (task M.13). Recorded model output only."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_llm, get_settings
from app.text.generate import LENGTHS, clean
from app.text.llm import LLMError
from tests.test_text import RecordedLLM, post, settings

QUESTIONS = [
    "Are you in a safe place right now?",
    "Is the person who harmed you near you right now?",
]
REQUEST = {
    "category": "PRESSURE_TO_WITHDRAW",
    "language": "en",
    "length": "short",
    "tone": "worried",
    "questions": QUESTIONS,
}


@pytest.fixture
def make_client(tmp_path):
    def _make(llm):
        s = settings(tmp_path)
        app.dependency_overrides[get_settings] = lambda: s
        app.dependency_overrides[get_llm] = lambda: llm
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


class GenLLM(RecordedLLM):
    def __init__(self, turns: list[dict] | None = None, error: Exception | None = None):
        super().__init__(error=error)
        self.raw = {"turns": turns or []}


def test_generates_a_cleaned_synthetic_conversation(make_client):
    llm = GenLLM(
        [
            {"speaker": "PERSON", "text": "  They keep telling me   to take the case back. "},
            {"speaker": "CHATBOT", "text": "Are you in a safe place right now?"},
            {"speaker": "PERSON", "text": "Yes, for now."},
            {
                "speaker": "CHATBOT",
                "text": "Do not worry, everything will be fine.",
            },  # not a scripted question: dropped
            {"speaker": "PERSON", "text": "Call me on 98765 43210"},  # contact details: dropped
            {"speaker": "PERSON", "text": "I am scared they will come back."},
        ]
    )
    r = post(make_client(llm), "/v1/demo/generate", REQUEST)
    assert r.status_code == 200
    body = r.json()
    assert body["synthetic"] is True
    assert body["modelVersion"].endswith("@generate-v1")
    assert body["turns"] == [
        {"speaker": "PERSON", "text": "They keep telling me to take the case back."},
        {"speaker": "CHATBOT", "text": "Are you in a safe place right now?"},
        {"speaker": "PERSON", "text": "Yes, for now."},
        {"speaker": "PERSON", "text": "I am scared they will come back."},
    ]
    # The model saw the scripted questions and the chosen options, nothing else.
    assert llm.last_user["QUESTIONS"] == QUESTIONS
    assert llm.last_user["turns"] == LENGTHS["short"]


def test_caps_the_number_of_turns():
    raw = {"turns": [{"speaker": "PERSON", "text": f"line {i}"} for i in range(30)]}
    assert len(clean(raw, QUESTIONS, LENGTHS["medium"])) == LENGTHS["medium"]
    assert clean({"turns": "nonsense"}, QUESTIONS, 4) == []


def test_rejects_unknown_options_and_needs_a_signature(make_client):
    client = make_client(GenLLM([{"speaker": "PERSON", "text": "hello"}]))
    for bad in [
        {"category": "X"},
        {"language": "fr"},
        {"length": "huge"},
        {"tone": "angry"},
        {"questions": "not a list"},
    ]:
        assert post(client, "/v1/demo/generate", {**REQUEST, **bad}).status_code == 422
    unsigned = client.post(
        "/v1/demo/generate",
        content=json.dumps(REQUEST),
        headers={"content-type": "application/json"},
    )
    assert unsigned.status_code == 401


def test_model_failure_or_nothing_usable(make_client):
    assert (
        post(make_client(GenLLM(error=LLMError("down"))), "/v1/demo/generate", REQUEST).status_code
        == 503
    )
    only_chatbot = GenLLM([{"speaker": "CHATBOT", "text": QUESTIONS[0]}])
    assert post(make_client(only_chatbot), "/v1/demo/generate", REQUEST).status_code == 422
