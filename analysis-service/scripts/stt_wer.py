"""Speech-to-text word error rate on the reference recordings (task 9.1, AC-VOI-07).

Run from analysis-service/:  .venv\\Scripts\\python scripts\\stt_wer.py
Only the synthetic English fixture exists so far; other languages need recordings (task E.4).
Prints the WER only (no transcript).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import soundfile as sf  # noqa: E402

from app.audio import stt  # noqa: E402
from app.config import load_settings  # noqa: E402

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures", "audio")
REFERENCES = {
    "pauses_en.wav": (
        "en",
        "the village meeting was held near the old school "
        "many families came to talk about the water supply "
        "the officer wrote down every complaint in a register "
        "people asked when the new pump would be repaired "
        "the committee promised to visit again next month "
        "everyone went home before the evening rain started",
    )
}


def words(s: str) -> list[str]:
    return re.sub(r"[^\w\s]", " ", s.lower()).split()


def wer(ref: list[str], hyp: list[str]) -> float:
    """Levenshtein distance over words / reference length."""
    d = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        prev, d[0] = d[0], i
        for j, h in enumerate(hyp, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (r != h))
    return d[len(hyp)] / max(1, len(ref))


async def main() -> None:
    s = load_settings()
    out = {}
    for name, (lang, ref) in REFERENCES.items():
        samples, _ = sf.read(os.path.join(FIXTURES, name), dtype="float32")
        t = await stt.whisper(s.groq_api_key, samples, lang, 0)
        out[name] = {
            "language": lang,
            "engine": t.model,
            "wer": round(wer(words(ref), words(t.text)), 3),
            "referenceWords": len(words(ref)),
        }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
