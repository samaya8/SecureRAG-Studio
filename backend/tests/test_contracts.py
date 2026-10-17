import pytest
from pydantic import ValidationError

from app.models.schemas import (
    AnswerResponse,
    DocumentRegistrationRequest,
    QueryRequest,
)


ANSWER_FIELDS = {
    "question",
    "answer",
    "citation_coverage",
    "citations",
    "evidence",
    "retrieval_quality_score",
    "confidence",
    "not_found",
    "safety_flag",
    "limitation",
}


def supported_answer(**overrides) -> AnswerResponse:
    values = {
        "question": "What is the attendance requirement?",
        "answer": "Students must attend at least 75% of classes.",
        "citations": [
            {
                "source_id": "attendance-2026",
                "source_title": "Attendance Policy",
                "evidence_snippet": "Students are required to attend at least 75%.",
                "page": 3,
                "chunk_id": "attendance-2026-chunk-12",
                "relevance_score": 0.94,
            }
        ],
        "evidence": ["Students are required to attend at least 75%."],
        "citation_coverage": 100.0,
        "retrieval_quality_score": 94.0,
        "confidence": "high",
        "not_found": False,
        "safety_flag": False,
        "limitation": None,
    }
    values.update(overrides)
    return AnswerResponse(**values)


def not_found_answer(**overrides) -> AnswerResponse:
    values = {
        "question": "What salary do graduates receive?",
        "answer": None,
        "citations": [],
        "evidence": [],
        "citation_coverage": 0.0,
        "retrieval_quality_score": 0.0,
        "confidence": "low",
        "not_found": True,
        "safety_flag": False,
        "limitation": "No supporting evidence exists in the approved corpus.",
    }
    values.update(overrides)
    return AnswerResponse(**values)


def test_document_registration_requires_approved_bounded_source_metadata():
    registration = DocumentRegistrationRequest(
        source_id="attendance-2026",
        source_title=" Attendance Policy ",
        corpus_id="training-handbook",
        approved=True,
    )

    assert registration.source_title == "Attendance Policy"
    assert registration.approved is True

    with pytest.raises(ValidationError):
        DocumentRegistrationRequest(
            source_id="attendance-2026",
            source_title="Attendance Policy",
            corpus_id="training-handbook",
            approved=False,
        )


def test_query_uses_question_and_accepts_legacy_query_alias():
    canonical = QueryRequest(question=" What is the attendance policy? ")
    legacy = QueryRequest(query="What is the attendance policy?")
    with_corpus = QueryRequest(
        question="What is the attendance policy?",
        corpusId="approved-handbook",
    )

    assert canonical.question == "What is the attendance policy?"
    assert canonical.query == canonical.question
    assert legacy.question == canonical.question
    assert with_corpus.corpus_id == "approved-handbook"
    assert set(legacy.model_dump()) == {"question", "corpus_id"}


def test_contracts_forbid_unknown_fields():
    with pytest.raises(ValidationError):
        QueryRequest(question="A valid question?", unexpected="other")


def test_supported_answer_has_exact_fields_and_complete_evidence():
    response = supported_answer()
    schema = AnswerResponse.model_json_schema()

    assert set(response.model_dump()) == ANSWER_FIELDS
    assert set(schema["properties"]) == ANSWER_FIELDS
    assert set(schema["required"]) == ANSWER_FIELDS
    assert response.not_found is False
    assert response.citations[0].source_id == "attendance-2026"


def test_not_found_answer_has_exact_safe_no_answer_shape():
    response = not_found_answer()

    assert set(response.model_dump()) == ANSWER_FIELDS
    assert response.answer is None
    assert response.retrieval_quality_score == 0.0
    assert response.citation_coverage == 0.0


@pytest.mark.parametrize(
    "overrides",
    [
        {"answer": None},
        {"citations": []},
        {"evidence": []},
        {"retrieval_quality_score": 0.0},
        {"citation_coverage": 0.0},
        {"safety_flag": True},
    ],
)
def test_supported_answer_rejects_incomplete_or_blocked_states(overrides):
    with pytest.raises(ValidationError):
        supported_answer(**overrides)


@pytest.mark.parametrize(
    "overrides",
    [
        {"answer": "An unsupported answer"},
        {"citations": [
            {
                "source_id": "attendance-2026",
                "source_title": "Attendance Policy",
                "evidence_snippet": "Students are required to attend at least 75%.",
                "chunk_id": "attendance-2026-chunk-12",
                "relevance_score": 0.94,
            }
        ]},
        {"evidence": ["Students are required to attend at least 75%."]},
        {"retrieval_quality_score": 10.0},
        {"citation_coverage": 100.0},
        {"confidence": "medium"},
        {"limitation": None},
    ],
)
def test_not_found_answer_rejects_evidence_scores_or_missing_limitation(overrides):
    with pytest.raises(ValidationError):
        not_found_answer(**overrides)


def test_safety_flag_uses_no_answer_shape():
    response = not_found_answer(
        safety_flag=True,
        limitation="The request was blocked by the safety policy.",
    )

    assert response.safety_flag is True
    assert response.not_found is True
