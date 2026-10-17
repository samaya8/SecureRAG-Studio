from dataclasses import dataclass


@dataclass
class RetrievalResult:
    """
    Represents a retrieved chunk returned from the vector store.
    """

    chunk_id: str
    text: str
    filename: str
    page: int
    section: str | None
    chunk_index: int
    score: float