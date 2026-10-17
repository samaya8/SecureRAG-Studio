from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.dependencies import get_ai_provider, get_prompt_builder, get_retriever
from app.models.retrieval_result import RetrievalResult
from app.models.schemas import (
    AnswerResponse,
    Citation,
    QueryRequest,
)
from app.security.validator import QueryValidator

router = APIRouter(
    prefix="/query",
    tags=["Query"],
)


@router.post(
    "/",
    response_model=AnswerResponse,
)
async def query(
    request: QueryRequest,
    retriever: Any = Depends(get_retriever),
    prompt_builder: Any = Depends(get_prompt_builder),
    ai_provider: Any = Depends(get_ai_provider),
):

    valid, error = QueryValidator.validate(request.question)

    if not valid:
        if QueryValidator.is_suspicious(request.question):
            return _build_not_found_response(
                question=request.question,
                safety_flag=True,
                limitation="The request was blocked by the safety policy.",
            )

        raise HTTPException(
            status_code=400,
            detail=error,
        )

    results = retriever.retrieve(
        request.question,
        corpus_id=request.corpus_id,
    )

    trusted_results = [
        result
        for result in results
        if result.score >= settings.SCORE_THRESHOLD
    ]

    if not trusted_results:
        return _build_not_found_response(
            question=request.question,
            limitation="No supporting evidence was found in the approved corpus.",
        )

    prompt = prompt_builder.build(
        question=request.question,
        results=trusted_results,
    )
    try:
        answer = ai_provider.generate(prompt).strip()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "errorCode": "MODEL_FAILED",
                "message": "The answer provider is currently unavailable.",
                "retryable": True,
            },
        ) from exc

    if not answer or answer == "I don't have enough information to answer that.":
        return _build_not_found_response(
            question=request.question,
            limitation="No supporting evidence was found in the approved corpus.",
        )

    citations = [_citation_from_result(result) for result in trusted_results]
    retrieval_quality_score = _retrieval_quality_score(trusted_results)
    citation_coverage = _citation_coverage(
        answer=answer,
        citations=citations,
        evidence_count=len(trusted_results),
    )

    return AnswerResponse(
        question=request.question,
        answer=answer,
        citations=citations,
        evidence=[citation.evidence_snippet for citation in citations],
        citation_coverage=citation_coverage,
        retrieval_quality_score=retrieval_quality_score,
        confidence=_confidence_from_score(retrieval_quality_score),
        not_found=False,
        safety_flag=False,
        limitation=None,
    )


def _build_not_found_response(
    question: str,
    limitation: str,
    safety_flag: bool = False,
) -> AnswerResponse:
    return AnswerResponse(
        question=question,
        answer=None,
        citations=[],
        evidence=[],
        citation_coverage=0.0,
        retrieval_quality_score=0.0,
        confidence="low",
        not_found=True,
        safety_flag=safety_flag,
        limitation=limitation,
    )


def _citation_from_result(result: RetrievalResult) -> Citation:
    return Citation(
        source_id=result.filename,
        source_title=result.filename,
        evidence_snippet=result.text,
        page=result.page,
        chunk_id=result.chunk_id,
        relevance_score=result.score,
    )


def _retrieval_quality_score(results: list[RetrievalResult]) -> float:
    best_score = max(result.score for result in results)
    return round(best_score * 100, 2)


def _citation_coverage(
    answer: str,
    citations: list[Citation],
    evidence_count: int,
) -> float:
    if not answer or evidence_count == 0:
        return 0.0

    cited_evidence_count = len(
        {
            citation.chunk_id
            for citation in citations
            if citation.evidence_snippet.strip()
        }
    )

    return round((cited_evidence_count / evidence_count) * 100, 2)


def _confidence_from_score(retrieval_quality_score: float) -> str:
    if retrieval_quality_score >= 85.0:
        return "high"
    if retrieval_quality_score >= 70.0:
        return "medium"
    return "low"
