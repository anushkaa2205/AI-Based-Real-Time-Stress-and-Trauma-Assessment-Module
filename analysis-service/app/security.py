"""Request signing between the web app and this service (task 4.1, API_CONTRACTS §8).

X-Timestamp: unix seconds
X-Signature: sha256=<hex HMAC-SHA256(secret, f"{timestamp}.{raw body}")>

The timestamp is part of the signed payload, so it cannot be changed to replay
an old request; requests older or newer than 60 seconds are rejected.
"""

from __future__ import annotations

import hashlib
import hmac

MAX_SKEW_SECONDS = 60


def sign(secret: str, timestamp: str, body: bytes) -> str:
    mac = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256)
    return "sha256=" + mac.hexdigest()


def verify(
    secret: str | None, timestamp: str | None, signature: str | None, body: bytes, now: float
) -> bool:
    if not secret or not timestamp or not signature:
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs(now - ts) > MAX_SKEW_SECONDS:
        return False
    return hmac.compare_digest(sign(secret, timestamp, body), signature)
