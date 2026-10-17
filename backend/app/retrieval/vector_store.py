import uuid
from app.models.retrieval_result import RetrievalResult
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from app.models.embedded_chunk import EmbeddedChunk


class VectorStore:
    """
    Handles all communication with Qdrant.
    """

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6333,
        collection_name: str = "secure_rag",
    ):
        self.collection_name = collection_name

        self.client = QdrantClient(
            host=host,
            port=port,
        )

    def create_collection(self):

        collections = self.client.get_collections().collections

        names = [collection.name for collection in collections]

        if self.collection_name in names:
            return

        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(
                size=384,
                distance=Distance.COSINE,
            ),
        )

    def upsert_chunks(
        self,
        embedded_chunks: list[EmbeddedChunk],
        corpus_id: str = "default",
    ):

        points = []

        for embedded in embedded_chunks:

            chunk = embedded.chunk

            points.append(
                PointStruct(
                    id=str(uuid.uuid5(uuid.NAMESPACE_DNS, chunk.chunk_id)),
                    vector=embedded.embedding,
                    payload={
                        "chunk_id": chunk.chunk_id,
                        "text": chunk.text,
                        "filename": chunk.filename,
                        "page": chunk.page,
                        "section": chunk.section,
                        "chunk_index": chunk.chunk_index,
                        "corpus_id": corpus_id,
                    },
                )
            )

        self.client.upsert(
            collection_name=self.collection_name,
            points=points,
        )
    def search(
        self,
        query_vector: list[float],
        top_k: int = 5,
        score_threshold: float = 0.65,
        corpus_id: str = "default",
    ) -> list[RetrievalResult]:
        """
        Search for the most relevant chunks.
        """

        query_filter = None

        if corpus_id != "default":
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="corpus_id",
                        match=MatchValue(value=corpus_id),
                    )
                ]
            )

        response = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            query_filter=query_filter,
            limit=top_k,
            with_payload=True,
        )

        results = []

        for point in response.points:

            if point.score < score_threshold:
                continue

            payload = point.payload

            results.append(
                RetrievalResult(
                    chunk_id=payload["chunk_id"],
                    text=payload["text"],
                    filename=payload["filename"],
                    page=payload["page"],
                    section=payload.get("section"),
                    chunk_index=payload.get("chunk_index", 0),
                    score=point.score,
                )
            )

        return results  
