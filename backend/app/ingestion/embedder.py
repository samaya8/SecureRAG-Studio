from sentence_transformers import SentenceTransformer

from app.models.chunk import Chunk
from app.models.embedded_chunk import EmbeddedChunk


class Embedder:
    """
    Generates embeddings for documents, chunks, and queries.
    """

    def __init__(
        self,
        model_name: str = "BAAI/bge-small-en-v1.5",
    ):
        self.model = SentenceTransformer(model_name)

    def embed_text(self, text: str) -> list[float]:
        """
        Generate an embedding for a single piece of text.
        """

        embedding = self.model.encode(
            text,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )

        return embedding.tolist()

    def embed_query(self, query: str) -> list[float]:
        """
        Generate an embedding for a user query.
        """

        return self.embed_text(query)

    def embed_chunks(
        self,
        chunks: list[Chunk],
    ) -> list[EmbeddedChunk]:
        """
        Generate embeddings for multiple chunks.
        """

        texts = [chunk.text for chunk in chunks]

        embeddings = self.model.encode(
            texts,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )

        embedded_chunks = []

        for chunk, embedding in zip(chunks, embeddings):
            embedded_chunks.append(
                EmbeddedChunk(
                    chunk=chunk,
                    embedding=embedding.tolist(),
                )
            )

        return embedded_chunks