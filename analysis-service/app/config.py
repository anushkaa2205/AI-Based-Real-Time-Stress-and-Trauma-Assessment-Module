"""Settings from the environment, with analysis-service/.env loaded if present.

Values are never logged. Missing keys only matter when the feature needing them runs.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def _load_env_file(path: Path) -> None:
    """Minimal KEY=VALUE loader; real environment variables win."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def _real(value: str | None) -> str | None:
    """Treat empty values and PASTE_... placeholders as missing."""
    if not value or value.startswith("PASTE_"):
        return None
    return value


@dataclass(frozen=True)
class Settings:
    hmac_secret: str | None
    groq_api_key: str | None
    gemini_api_key: str | None
    groq_model: str
    gemini_model: str
    cache_dir: Path
    use_cache: bool
    hf_token: str | None = None
    #: IndicConformer files are pinned to a repo commit (no hub code is run).
    indic_revision: str | None = None
    #: Load the voice models at start-up (default) instead of on the first voice window.
    preload_voice: bool = False


def load_settings() -> Settings:
    _load_env_file(ENV_FILE)
    return Settings(
        hmac_secret=_real(os.environ.get("ANALYSIS_HMAC_SECRET")),
        groq_api_key=_real(os.environ.get("GROQ_API_KEY")),
        gemini_api_key=_real(os.environ.get("GEMINI_API_KEY")),
        groq_model=os.environ.get("GROQ_MODEL") or "openai/gpt-oss-20b",
        gemini_model=os.environ.get("GEMINI_MODEL") or "gemini-3.5-flash-lite",
        cache_dir=Path(os.environ.get("ANALYSIS_CACHE_DIR") or ENV_FILE.parent / ".cache"),
        use_cache=(os.environ.get("ANALYSIS_CACHE") or "on") != "off",
        hf_token=_real(os.environ.get("HF_TOKEN")),
        indic_revision=os.environ.get("INDIC_REVISION") or None,
        preload_voice=(os.environ.get("PRELOAD_VOICE") or "on") != "off",
    )
