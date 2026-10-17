from dataclasses import dataclass

@dataclass
class Chunk:
    chunk_id: str
    text: str
    filename: str
    page: int | None
    section: str | None
    chunk_index: int
    start_char: int
    end_char: int