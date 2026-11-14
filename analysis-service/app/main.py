"""Analysis service (ARCHITECTURE §7). Stateless; the web app is its only client.

Task 0.8: skeleton with the health endpoint only. Text and audio analysis,
HMAC request signing and model loading are added in Phases 4 and 7.
"""

from fastapi import FastAPI

from app import __version__

app = FastAPI(title="NHAA analysis service", version=__version__)


@app.get("/v1/health")
def health() -> dict[str, object]:
    """API_CONTRACTS §8.4. Models are not loaded yet in the skeleton."""
    return {
        "status": "ok",
        "models": {"stt": "not_loaded", "ser": "not_loaded", "nlp": "not_configured"},
    }
