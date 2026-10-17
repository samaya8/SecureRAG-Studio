from typing import Literal

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    model_validator,
)


class _StrictContract(BaseModel):
    """Shared validation rules for the Session 1 public contracts."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        strict=True,
        str_strip_whitespace=True,
    )


# ==========================================
# Session 1 Baseline Contracts
# ==========================================

class DocumentRegistrationRequest(_StrictContract):
    """Metadata required before a document can enter an approved corpus."""

    source_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        description="Stable identifier for the source document",
    )
    source_title: str = Field(
        ...,
        min_length=1,
        max_length=300,
        description="Human-readable source title",
    )
    corpus_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        description="Bounded corpus that owns the document",
    )
    approved: Literal[True] = Field(
        ...,
        description="Only explicitly approved documents may be registered",
    )


class QueryRequest(_StrictContract):
    """A question submitted against the approved bounded corpus."""

    question: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        validation_alias=AliasChoices("question", "query"),
        description="User question; the legacy input name 'query' is also accepted",
    )
    corpus_id: str = Field(
        "default",
        min_length=1,
        max_length=128,
        validation_alias=AliasChoices("corpusId", "corpus_id"),
        serialization_alias="corpusId",
        description="Bounded approved corpus identifier",
    )

    @property
    def query(self) -> str:
        """Keep existing route code compatible while `question` is canonical."""

        return self.question


ConfidenceLevel = Literal["high", "medium", "low"]


class Citation(_StrictContract):
    """Source evidence that supports a generated answer."""

    source_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        serialization_alias="sourceId",
    )
    source_title: str = Field(
        ...,
        min_length=1,
        max_length=300,
        serialization_alias="sourceTitle",
    )
    evidence_snippet: str = Field(
        ...,
        min_length=1,
        serialization_alias="evidenceSnippet",
    )
    page: int | None = None
    chunk_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        serialization_alias="chunkId",
    )
    relevance_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        serialization_alias="relevanceScore",
    )


class AnswerResponse(_StrictContract):
    """Structured answer contract returned by the query orchestration route."""

    question: str = Field(..., min_length=1, max_length=1000)
    answer: str | None = Field(..., min_length=1)
    citations: list[Citation]
    evidence: list[str]
    citation_coverage: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        serialization_alias="citationCoverage",
    )
    retrieval_quality_score: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        serialization_alias="retrievalQualityScore",
    )
    confidence: ConfidenceLevel
    not_found: StrictBool = Field(..., serialization_alias="notFound")
    safety_flag: StrictBool = Field(..., serialization_alias="safetyFlag")
    limitation: str | None = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_answer_state(self):
        """
        Enforce a supported answer or a safe no-answer state.

        `safety_flag=True` means the request was blocked and therefore must use
        the same no-answer shape as any other not-found result.
        """

        if self.not_found:
            if self.answer is not None:
                raise ValueError(
                    "not_found responses cannot contain an answer"
                )
            if self.citations or self.evidence:
                raise ValueError(
                    "not_found responses cannot contain citations or evidence"
                )
            if (
                self.retrieval_quality_score != 0.0
                or self.citation_coverage != 0.0
            ):
                raise ValueError(
                    "not_found responses require zero retrieval quality and citation coverage"
                )
            if self.confidence != "low":
                raise ValueError("not_found responses require confidence='low'")
            if self.limitation is None:
                raise ValueError("not_found responses require a limitation")
            return self

        if self.safety_flag:
            raise ValueError("safety_flag=True requires not_found=True")
        if self.answer is None:
            raise ValueError("supported responses require an answer")
        if not self.citations or not self.evidence:
            raise ValueError(
                "supported responses require citations and evidence"
            )
        if self.retrieval_quality_score <= 0.0 or self.citation_coverage <= 0.0:
            raise ValueError(
                "supported responses require positive retrieval quality and citation coverage"
            )

        return self


# ==========================================
# Retrieval Schemas
# ==========================================

class RetrieveRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="User query",
    )
    corpus_id: str = Field(
        "default",
        validation_alias=AliasChoices("corpusId", "corpus_id"),
        serialization_alias="corpusId",
        description="Bounded approved corpus identifier",
    )


class RetrievedChunk(BaseModel):
    filename: str
    page: int | None = None
    score: float
    text: str


class RetrieveResponse(BaseModel):
    status: Literal["success"]
    results: list[RetrievedChunk]


# ==========================================
# Ingestion Schemas
# ==========================================

class IngestResponse(BaseModel):
    status: Literal["success"]
    filename: str
    documents: int
    chunks: int
    message: str


# Backwards-compatible name for code that imported the earlier response class.
QueryResponse = AnswerResponse


# ==========================================
# Error Schemas
# ==========================================

class ErrorResponse(BaseModel):
    detail: str
