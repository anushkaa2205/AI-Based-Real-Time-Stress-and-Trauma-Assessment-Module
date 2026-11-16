"""Indicator-extraction prompt (task 4.3, FR-NLP-01…08, FR-EMO-01).

Kept short (well under 1,500 tokens) because Groq's free tier allows 8K tokens
a minute. The model only ANALYSES text: it never writes to the person
(CLAUDE.md rule 2) and never gives a score for the whole case (rule 3).
All examples are synthetic and non-graphic (rule 11).
"""

from __future__ import annotations

PROMPT_VERSION = "prompt-v2"  # v2: previousQuestion (task M.9, FR-NLP-11)

DIMENSIONS = [
    "ACUTE_STRESS",
    "SEVERE_TRAUMA",
    "FEAR_ANXIETY",
    "DEPRESSION",
    "SUICIDAL_IDEATION",
    "INTIMIDATION",
    "SOCIAL_ISOLATION",
    "EXTREME_VULNERABILITY",
]
FLAGS = [
    "SUICIDAL_INTENT",
    "PASSIVE_SUICIDAL_IDEATION",
    "ACCUSED_PRESENT",
    "CONFINED",
    "SERIOUS_INJURY",
    "THREAT_TO_LIFE",
    "PRESSURE_TO_WITHDRAW",
    "DISPLACED",
]
EMOTIONS = ["fear", "sadness", "anger", "shame", "shock_numbness", "neutral"]
LANGS = ["en", "hi", "hi-Latn", "mr", "ta", "bn", "other"]

SYSTEM = f"""You analyse one message written to a helpline in India for victims of caste-based atrocities.
You never reply to the person. Return JSON only, matching the schema.

Find signs of these dimensions: ACUTE_STRESS (overwhelmed, panic), SEVERE_TRAUMA (intrusive memories,
numbness, current injury), FEAR_ANXIETY, DEPRESSION (hopeless, low mood), SUICIDAL_IDEATION (incl. self-harm,
indirect wishes to be gone), INTIMIDATION (threats, pressure, accused nearby), SOCIAL_ISOLATION (boycott,
eviction, nobody to turn to), EXTREME_VULNERABILITY (alone, dependent on accused, minor, disability).

For each sign: score 0-1 (strength), confidence 0-1, "quote" = the shortest phrase copied EXACTLY,
character for character, from the ORIGINAL message (never from your translation; keep its script and spelling),
"negated" = true if the person denies it ("I would never hurt myself", "main mar nahi rahi"),
"flags" from {FLAGS} only when clearly stated (intent/plan → SUICIDAL_INTENT; wish to be dead without
plan → PASSIVE_SUICIDAL_IDEATION; accused present/near NOW → ACCUSED_PRESENT; locked in → CONFINED;
current serious injury → SERIOUS_INJURY; threat to kill → THREAT_TO_LIFE; pressure to withdraw case or
change testimony → PRESSURE_TO_WITHDRAW; forced out of home/village → DISPLACED), else [].
"rationale": max 12 neutral words. Never use diagnostic labels. One entry per distinct sign; [] if none.
If "previousQuestion" is given, it is what the helpline's chatbot or operator asked just before: read a short
answer ("No", "हाँ", "yes") with it (e.g. "No" to "Are you safe right now?" is a sign of FEAR_ANXIETY).
Never find signs in the question itself, and copy quotes only from the message, never from the question.

Also: language code ({", ".join(LANGS)}; Romanised Hindi = hi-Latn), a faithful English translation,
immediate_danger (accused present, confinement or injury right now), and the main emotion
({", ".join(EMOTIONS)}) with a distribution summing to about 1.

Examples (abbreviated):
"वो लोग घर के बाहर खड़े हैं, कह रहे हैं केस वापस लो" → INTIMIDATION 0.95 quote "घर के बाहर खड़े हैं" flags
[ACCUSED_PRESENT]; INTIMIDATION 0.9 quote "केस वापस लो" flags [PRESSURE_TO_WITHDRAW]; emotion fear.
"main kabhi khud ko nuksaan nahi pahunchaungi, bas dar lagta hai" → SUICIDAL_IDEATION 0.6 quote
"khud ko nuksaan" negated true; FEAR_ANXIETY 0.6 quote "dar lagta hai".
"Everyone would be happier if I was not here" → SUICIDAL_IDEATION 0.75 quote
"Everyone would be happier if I was not here" flags [PASSIVE_SUICIDAL_IDEATION]; emotion sadness."""


def _number() -> dict:
    return {"type": "number", "minimum": 0, "maximum": 1}


def _obj(props: dict) -> dict:
    return {
        "type": "object",
        "properties": props,
        "required": list(props),
        "additionalProperties": False,
    }


OUTPUT_SCHEMA: dict = _obj(
    {
        "language": _obj({"code": {"type": "string", "enum": LANGS}, "confidence": _number()}),
        "translation_en": {"type": "string"},
        "indicators": {
            "type": "array",
            "items": _obj(
                {
                    "dimension": {"type": "string", "enum": DIMENSIONS},
                    "score": _number(),
                    "confidence": _number(),
                    "quote": {"type": "string"},
                    "negated": {"type": "boolean"},
                    "flags": {"type": "array", "items": {"type": "string", "enum": FLAGS}},
                    "rationale": {"type": "string"},
                }
            ),
        },
        "immediate_danger": _obj(
            {"detected": {"type": "boolean"}, "confidence": _number(), "quote": {"type": "string"}}
        ),
        "emotion": _obj(
            {
                "label": {"type": "string", "enum": EMOTIONS},
                "confidence": _number(),
                "distribution": _obj({e: _number() for e in EMOTIONS}),
            }
        ),
    }
)

SUMMARY_VERSION = "summary-v1"

SUMMARY_SYSTEM = """You write a short neutral case summary for a helpline counsellor, from messages a person
sent to a helpline. Facts only, in third person, at most 80 words. No diagnosis, no judgement, no advice,
nothing that is not in the messages. Return JSON with "summary" (in the requested language) and
"summary_en" (English)."""

SUMMARY_SCHEMA: dict = _obj({"summary": {"type": "string"}, "summary_en": {"type": "string"}})
