from app.config import settings
from app.ingestion.embedder import Embedder
from app.models.retrieval_result import RetrievalResult
from app.retrieval.vector_store import VectorStore


class Retriever:
    """
    Retrieves the most relevant chunks for a user query.
    """

    def __init__(
        self,
        vector_store: VectorStore,
        embedder: Embedder,
    ):
        self.vector_store = vector_store
        self.embedder = embedder

    def retrieve(
        self,
        query: str,
        corpus_id: str = "default",
        top_k: int = settings.TOP_K,
        score_threshold: float = settings.SCORE_THRESHOLD,
    ) -> list[RetrievalResult]:
        """
        Retrieve the most relevant chunks for a query.
        """

        query_vector = self.embedder.embed_query(query)

        return self.vector_store.search(
            query_vector=query_vector,
            top_k=top_k,
            score_threshold=score_threshold,
            corpus_id=corpus_id,
        )
