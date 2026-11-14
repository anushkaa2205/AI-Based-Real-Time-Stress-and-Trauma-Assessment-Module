from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_answers_ok() -> None:
    res = client.get("/v1/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert set(body["models"]) == {"stt", "ser", "nlp"}
