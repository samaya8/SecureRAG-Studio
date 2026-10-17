import sys

from fastapi.testclient import TestClient

from app.main import app


def test_health_starts_without_heavy_retrieval_dependencies():
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "service": "SecureRAG Backend",
    }
    assert "sentence_transformers" not in sys.modules
    assert "qdrant_client" not in sys.modules


def test_root_endpoint_is_available():
    with TestClient(app) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"message": "SecureRAG Backend is running"}
