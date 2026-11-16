"""Synthetic conversation generator for the demo input layer (task M.13, PRODUCT_VISION.md §6).

Demo only. The model writes SYNTHETIC TEST DATA: a short chatbot conversation between NHAA's
chatbot and an invented person, from the options a presenter chose. Nothing here is shown to a
real person and nothing here scores anything (CLAUDE.md rules 2 and 3): the web app sends the
generated lines through the module's normal /messages path, one at a time, like any NHAA system.

Guardrails, applied after generation whatever the model returns:
- the chatbot's lines are kept only if they are one of NHAA's scripted questions, word for word;
- the person's lines are trimmed, capped, and dropped if they contain a link, a phone-like number
  or an e-mail address (synthetic text carries no contact details);
- at most the requested number of turns.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.text.llm import LLM

GENERATE_VERSION = "generate-v1"

CATEGORIES = {
    "THREAT_INTIMIDATION": "threats or intimidation after a complaint",
    "PHYSICAL_ATTACK": "a physical attack (no injuries described in detail)",
    "SOCIAL_BOYCOTT": "a social boycott by the village",
    "PROPERTY_DAMAGE": "damage to the family's property or crops",
    "PRESSURE_TO_WITHDRAW": "pressure to withdraw the complaint",
    "CASE_STATUS": "a question about the status of a complaint, without distress",
}
TONES = {
    "calm": "calm; mostly practical questions",
    "worried": "worried and tired, with fear about what may happen",
    "distressed": "very distressed and afraid; may say they do not feel safe right now",
}
LENGTHS = {"short": 4, "medium": 8, "long": 12}
LANG_NAMES = {
    "en": "English",
    "hi": "Hindi (Devanagari)",
    "mr": "Marathi",
    "ta": "Tamil",
    "bn": "Bengali",
}
MAX_LINE = 400

SYSTEM = """You write SYNTHETIC test conversations for a demonstration of a helpline
assessment tool in India. The conversation is between NHAA's chatbot and an invented person
who has filed a complaint about a caste-based atrocity. Rules:
- Entirely fictional. No real names, villages, districts, phone numbers or other identifying
  details.
- Never name a caste or community. Respectful, calm wording. Nothing graphic: no details of
  violence or injuries, no description of any method of self-harm.
- The chatbot never gives advice and never says anything except questions. When it asks
  something, it uses one of the QUESTIONS given, copied exactly.
- The person writes short chat messages in the requested language and tone, as people type.
Return JSON: {"turns": [{"speaker": "CHATBOT" or "PERSON", "text": "..."}]}.
Start with the person."""

SCHEMA: dict = {
    "type": "object",
    "properties": {
        "turns": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "enum": ["CHATBOT", "PERSON"]},
                    "text": {"type": "string"},
                },
                "required": ["speaker", "text"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["turns"],
    "additionalProperties": False,
}

_CONTACT = re.compile(r"https?://|www\.|@[\w-]+\.|\d[\d\s-]{7,}\d")


class GenerateError(ValueError):
    pass


def check_request(req: dict) -> tuple[str, str, str, str, list[str]]:
    category = req.get("category")
    language = req.get("language")
    length = req.get("length")
    tone = req.get("tone")
    questions = req.get("questions")
    if category not in CATEGORIES:
        raise GenerateError("unknown category")
    if language not in LANG_NAMES:
        raise GenerateError("unknown language")
    if length not in LENGTHS:
        raise GenerateError("unknown length")
    if tone not in TONES:
        raise GenerateError("unknown tone")
    if (
        not isinstance(questions, list)
        or not all(isinstance(q, str) and 0 < len(q) <= 300 for q in questions)
        or len(questions) > 40
    ):
        raise GenerateError("questions must be NHAA's scripted questions")
    return category, language, length, tone, questions


def clean(raw: dict, questions: list[str], max_turns: int) -> list[dict[str, str]]:
    """Applies the guardrails above to whatever the model returned."""
    allowed = {q.strip() for q in questions}
    out: list[dict[str, str]] = []
    for t in raw.get("turns", []) if isinstance(raw.get("turns"), list) else []:
        if not isinstance(t, dict):
            continue
        text = " ".join(str(t.get("text", "")).split())
        if not text:
            continue
        if t.get("speaker") == "CHATBOT":
            if text in allowed:
                out.append({"speaker": "CHATBOT", "text": text})
        elif t.get("speaker") == "PERSON":
            if _CONTACT.search(text):
                continue
            out.append({"speaker": "PERSON", "text": text[:MAX_LINE]})
        if len(out) >= max_turns:
            break
    return out


async def generate_conversation(llm: LLM, req: dict) -> dict[str, Any]:
    category, language, length, tone, questions = check_request(req)
    max_turns = LENGTHS[length]
    user = json.dumps(
        {
            "topic": CATEGORIES[category],
            "language": LANG_NAMES[language],
            "tone": TONES[tone],
            "turns": max_turns,
            "QUESTIONS": questions,
        },
        ensure_ascii=False,
    )
    raw, version = await llm.complete_json(SYSTEM, user, SCHEMA, "synthetic_conversation")
    turns = clean(raw, questions, max_turns)
    if not any(t["speaker"] == "PERSON" for t in turns):
        raise GenerateError("the model returned no usable lines")
    return {"turns": turns, "synthetic": True, "modelVersion": f"{version}@{GENERATE_VERSION}"}
