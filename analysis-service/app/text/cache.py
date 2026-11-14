"""On-disk cache of model answers by input hash (task 4.5).

Re-running the evaluation set should not use up the free quota. Only the
model's JSON answer is stored, under a hash of (prompt version, model, input).
The folder is git-ignored. Synthetic data only, as everywhere in this project.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


class DiskCache:
    def __init__(self, folder: Path, enabled: bool = True):
        self.folder = folder
        self.enabled = enabled

    @staticmethod
    def key(*parts: object) -> str:
        raw = json.dumps(parts, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(raw.encode()).hexdigest()

    def get(self, key: str) -> dict | None:
        if not self.enabled:
            return None
        path = self.folder / f"{key}.json"
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def put(self, key: str, value: dict) -> None:
        if not self.enabled:
            return
        self.folder.mkdir(parents=True, exist_ok=True)
        (self.folder / f"{key}.json").write_text(
            json.dumps(value, ensure_ascii=False), encoding="utf-8"
        )
