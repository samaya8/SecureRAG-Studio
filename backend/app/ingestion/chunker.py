import hashlib

from app.models.chunk import Chunk
from app.models.document import Document


class Chunker:
    """
    Splits documents into overlapping chunks.
    """

    def __init__(
        self,
        chunk_size: int = 1000,
        overlap: int = 150,
    ):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk_documents(
        self,
        documents: list[Document],
    ) -> list[Chunk]:

        chunks = []

        for document in documents:
            chunks.extend(self.chunk_document(document))

        return chunks

    def chunk_document(self, document: Document) -> list[Chunk]:

        text = document.text

        chunks = []

        start = 0
        chunk_index = 0

        text_length = len(text)

        while start < text_length:

            end = min(start + self.chunk_size, text_length)

            if end < text_length:

                split_index = max(
                    text.rfind("\n\n", start, end),
                    text.rfind("\n", start, end),
                    text.rfind(". ", start, end),
                    text.rfind(" ", start, end),
                )

                if split_index > start:
                    end = split_index

            chunk_text = text[start:end].strip()

            if chunk_text:

                chunk_id = self.generate_chunk_id(
                    document.filename,
                    document.page,
                    start,
                )

                chunks.append(
                    Chunk(
                        chunk_id=chunk_id,
                        text=chunk_text,
                        filename=document.filename,
                        page=document.page,
                        section=document.section,
                        chunk_index=chunk_index,
                        start_char=start,
                        end_char=end,
                    )
                )

                chunk_index += 1

            next_start = end - self.overlap

            if next_start <= start:
                next_start = end

            start = next_start

        return chunks

    @staticmethod
    def generate_chunk_id(
        filename: str,
        page: int | None,
        offset: int,
    ) -> str:

        key = f"{filename}:{page}:{offset}"

        return hashlib.sha256(key.encode()).hexdigest()