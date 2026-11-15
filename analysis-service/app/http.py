"""One shared HTTP client per event loop (connection and TLS reuse).

Creating an httpx client per call cost ~1 s per request on the team laptop (TLS and proxy
setup each time); a reused client costs a few ms. Keyed by event loop so tests, which run
several loops, never share a client across loops.
"""

from __future__ import annotations

import asyncio

import httpx

DEFAULT_TIMEOUT = httpx.Timeout(15.0, connect=3.0)

_clients: dict[int, httpx.AsyncClient] = {}


def shared_client() -> httpx.AsyncClient:
    """Must be called from inside a running event loop."""
    loop = asyncio.get_running_loop()
    key = id(loop)
    client = _clients.get(key)
    if client is None or client.is_closed:
        client = httpx.AsyncClient(
            timeout=DEFAULT_TIMEOUT, limits=httpx.Limits(max_keepalive_connections=10)
        )
        _clients[key] = client
    return client


async def close_all() -> None:
    for client in list(_clients.values()):
        await client.aclose()
    _clients.clear()
