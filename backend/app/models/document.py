from dataclasses import dataclass


@dataclass
class Document:
    """
    Represents a loaded document or a single page of a document.
    """

    text: str
    filename: str
    page: int | None = None
    section: str | None = None