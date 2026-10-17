from pathlib import Path
import shutil
import tempfile
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.dependencies import get_embedder, get_vector_store
from app.ingestion.loaders import DocumentLoader
from app.ingestion.chunker import Chunker

router = APIRouter(prefix="/ingest", tags=["Ingestion"])


@router.post("/")
async def ingest_document(
    file: UploadFile = File(...),
    corpus_id: str = Form("default"),
    embedder: Any = Depends(get_embedder),
    vector_store: Any = Depends(get_vector_store),
):
    """
    Upload a document and ingest it into Qdrant.
    """

    allowed_extensions = {".pdf", ".docx", ".txt", ".md"}

    extension = Path(file.filename).suffix.lower()

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {extension}",
        )

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=extension,
    ) as temp_file:

        shutil.copyfileobj(file.file, temp_file)

        temp_path = temp_file.name

    try:

        loader = DocumentLoader()
        documents = loader.load(temp_path)

        if not documents:
            raise HTTPException(
                status_code=400,
                detail="Document contains no readable text.",
            )

        chunker = Chunker()
        chunks = chunker.chunk_documents(documents)

        embedded_chunks = embedder.embed_chunks(chunks)

        vector_store.create_collection()

        vector_store.upsert_chunks(
            embedded_chunks,
            corpus_id=corpus_id,
        )

        return {
            "status": "success",
            "filename": file.filename,
            "documents": len(documents),
            "chunks": len(chunks),
            "message": "Document ingested successfully.",
        }

    finally:

        Path(temp_path).unlink(missing_ok=True)
