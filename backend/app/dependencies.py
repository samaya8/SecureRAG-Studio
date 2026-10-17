"""Lazy process-local dependencies for the exploratory backend routes."""

from functools import lru_cache
from typing import Any

from app.config import settings


@lru_cache(maxsize=1)
def get_embedder() -> Any:
    """Load the embedding model only when an endpoint actually needs it."""

    from app.ingestion.embedder import Embedder

    return Embedder(model_name=settings.EMBEDDING_MODEL)


@lru_cache(maxsize=1)
def get_vector_store() -> Any:
    """Construct the Qdrant client only when an endpoint actually needs it."""

    from app.retrieval.vector_store import VectorStore

    return VectorStore(
        host=settings.QDRANT_HOST,
        port=settings.QDRANT_PORT,
        collection_name=settings.COLLECTION_NAME,
    )


@lru_cache(maxsize=1)
def get_retriever() -> Any:
    """Share one lazily constructed retriever within the server process."""

    from app.retrieval.retriever import Retriever

    return Retriever(
        vector_store=get_vector_store(),
        embedder=get_embedder(),
    )


@lru_cache(maxsize=1)
def get_prompt_builder() -> Any:
    """Share the prompt builder used by the query orchestration route."""

    from app.generation.prompt_builder import PromptBuilder

    return PromptBuilder()


@lru_cache(maxsize=1)
def get_ai_provider() -> Any:
    """Return the replaceable AI provider boundary."""

    from app.generation.provider import PlaceholderAIProvider

    return PlaceholderAIProvider()
