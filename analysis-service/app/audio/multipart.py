"""Minimal multipart/form-data parser (standard library only), used after the HMAC check
has verified the exact raw body. Returns {name: (filename | None, bytes)}."""

from __future__ import annotations

from email.parser import BytesParser
from email.policy import HTTP


def parse(content_type: str, body: bytes) -> dict[str, tuple[str | None, bytes]]:
    if (
        not content_type.lower().startswith("multipart/form-data")
        or "boundary=" not in content_type
    ):
        raise ValueError("not multipart")
    msg = BytesParser(policy=HTTP).parsebytes(
        b"Content-Type: " + content_type.encode("latin-1") + b"\r\n\r\n" + body
    )
    if not msg.is_multipart():
        raise ValueError("not multipart")
    out: dict[str, tuple[str | None, bytes]] = {}
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        payload = part.get_payload(decode=True) or b""
        out[str(name)] = (part.get_filename(), payload)
    return out
