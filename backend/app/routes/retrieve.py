from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_retriever
from app.security.validator import QueryValidator
from app.models.schemas import (
    RetrieveRequest,
    RetrieveResponse,
    RetrievedChunk,
)

router = APIRouter(
    prefix="/retrieve",
    tags=["Retrieval"],
)


@router.post(
    "/",
    response_model=RetrieveResponse,
)
async def retrieve(
    request: RetrieveRequest,
    retriever: Any = Depends(get_retriever),
):

    # Validate the query first
    valid, error = QueryValidator.validate(request.query)

    if not valid:
        raise HTTPException(
            status_code=400,
            detail=error,
        )

    # Retrieve relevant chunks
    results = retriever.retrieve(
        request.query,
        corpus_id=request.corpus_id,
    )

    return RetrieveResponse(
        status="success",
        results=[
            RetrievedChunk(
                filename=result.filename,
                page=result.page,
                score=result.score,
                text=result.text,
            )
            for result in results
        ],
    )
