"""Script-based language hints (task 4.2, FR-NLP-06, FR-LANG-03).

Unicode script decides Devanagari / Tamil / Bengali / Latin. Hindi vs Marathi
(both Devanagari) and English vs Romanised Hindi (both Latin) are left to the
LLM, with a small word list as a fallback for Romanised Hindi.
"""

from __future__ import annotations

import re

SCRIPTS = {
    "Deva": re.compile(r"[ऀ-ॿ]"),
    "Beng": re.compile(r"[ঀ-৿]"),
    "Taml": re.compile(r"[஀-௿]"),
    "Latn": re.compile(r"[A-Za-z]"),
}

# Frequent Romanised Hindi function words (synthetic list, extend with evaluation data)
HINGLISH_WORDS = {
    "hai",
    "hain",
    "nahi",
    "nahin",
    "nhi",
    "mujhe",
    "mera",
    "meri",
    "mere",
    "kya",
    "kyu",
    "kyun",
    "aur",
    "ko",
    "ki",
    "ka",
    "ke",
    "se",
    "ne",
    "bhi",
    "abhi",
    "kar",
    "raha",
    "rahi",
    "rahe",
    "ghar",
    "log",
    "wo",
    "woh",
    "yeh",
    "ye",
    "hum",
    "hume",
    "tha",
    "thi",
    "gaya",
    "gayi",
    "diya",
    "liya",
    "bahut",
}


def detect_script(text: str) -> str:
    counts = {name: len(rx.findall(text)) for name, rx in SCRIPTS.items()}
    best = max(counts, key=lambda k: counts[k])
    return best if counts[best] > 0 else "Zyyy"


def guess_language(text: str, hint: str | None) -> tuple[str, float, str]:
    """(BCP-47 code, confidence, script) without any model."""
    script = detect_script(text)
    if script == "Beng":
        return "bn", 0.95, script
    if script == "Taml":
        return "ta", 0.95, script
    if script == "Deva":
        return ("mr", 0.6, script) if hint == "mr" else ("hi", 0.85, script)
    if script == "Latn":
        words = re.findall(r"[a-z]+", text.lower())
        share = sum(w in HINGLISH_WORDS for w in words) / max(1, len(words))
        if share >= 0.2:
            return "hi-Latn", min(0.95, 0.6 + share), script
        return "en", 0.8, script
    return hint or "en", 0.3, script
