/**
 * Shared contracts for SecureRAG Studio.
 *
 * Owner: Somaya Osama (Backend & Retrieval) with Sara (contract approval).
 *
 * Every layer -- API routes, retrieval, evaluation and the frontend --
 * imports its types from this file so that the request/response contract
 * documented in docs/api-contracts.md exists in exactly one place.
 */

/* ------------------------------------------------------------------ */
/* Documents and corpora                                               */
/* ------------------------------------------------------------------ */

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "archived",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const SOURCE_TYPES = ["pdf", "text", "markdown"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface ApprovedDocument {
  id: string;
  title: string;
  version: string;
  category: string;
  approvalStatus: ApprovalStatus;
  uploadedAt: string;
  approvedBy?: string;
  sourceType: SourceType;
}

/** A document entry as stored in the corpus manifest (adds the file path). */
export interface CorpusDocumentEntry extends ApprovedDocument {
  /** Repository-relative path of the text used for retrieval. */
  file: string;
}

export interface CorpusDefinition {
  id: string;
  title: string;
  description: string;
  documents: CorpusDocumentEntry[];
}

export interface CorpusManifest {
  version: string;
  generatedAt: string;
  corpora: CorpusDefinition[];
}

/** Public, non-sensitive corpus description returned by the documents API. */
export interface CorpusSummary {
  corpusId: string;
  title: string;
  description: string;
  approvedDocumentCount: number;
  excludedDocumentCount: number;
  documents: ApprovedDocument[];
}

/* ------------------------------------------------------------------ */
/* Retrieval                                                           */
/* ------------------------------------------------------------------ */

export interface DocumentChunk {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceVersion: string;
  corpusId: string;
  page?: number;
  text: string;
}

export interface RetrievedChunk extends DocumentChunk {
  /** Normalised relevance score in the 0-1 range. */
  score: number;
}

/* ------------------------------------------------------------------ */
/* API contract                                                        */
/* ------------------------------------------------------------------ */

export interface QueryRequest {
  question: string;
  corpusId: string;
}

export interface Citation {
  sourceId: string;
  sourceTitle: string;
  evidenceSnippet: string;
  page?: number;
  chunkId: string;
  relevanceScore: number;
}

export type Confidence = "high" | "medium" | "low";

export interface QueryResponse {
  question: string;
  answer: string;
  citations: Citation[];
  /** Exact supporting snippets, in the same order as `citations`. */
  evidence: string[];
  citationCoverage: number;
  retrievalQualityScore: number;
  confidence: Confidence;
  notFound: boolean;
  safetyFlag: boolean;
  limitation: string | null;
  requestId: string;
}

export const ERROR_CODES = [
  "INVALID_QUERY",
  "INVALID_CORPUS",
  "UNAPPROVED_DOCUMENT",
  "RETRIEVAL_FAILED",
  "MODEL_FAILED",
  "INVALID_MODEL_OUTPUT",
  "SAFETY_REJECTION",
  "CONFIGURATION_ERROR",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorResponse {
  errorCode: ErrorCode;
  message: string;
  retryable: boolean;
  requestId: string;
}

export interface DocumentsResponse {
  corpora: CorpusSummary[];
  requestId: string;
}

export interface LoadDocumentsResponse {
  corpusId: string;
  title: string;
  approvedDocumentCount: number;
  excludedDocumentCount: number;
  chunkCount: number;
  documents: ApprovedDocument[];
  requestId: string;
}

export interface HealthResponse {
  status: "healthy" | "degraded";
  service: string;
  environment: string;
  checks: {
    api: "available";
    providerConfigured: boolean;
    provider: string;
    corpusAvailable: boolean;
    corpusCount: number;
    approvedDocumentCount: number;
  };
  issues: string[];
  timestamp: string;
  requestId: string;
}

/* ------------------------------------------------------------------ */
/* Request validation                                                  */
/* ------------------------------------------------------------------ */

export const QUESTION_MIN_LENGTH = 3;
export const QUESTION_MAX_LENGTH = 500;
export const CORPUS_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errorCode: ErrorCode; message: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an untrusted request body against the QueryRequest contract.
 * Returns a structured result instead of throwing, so routes can map it
 * straight onto an ErrorResponse.
 */
export function validateQueryRequest(body: unknown): ValidationResult<QueryRequest> {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errorCode: "INVALID_QUERY",
      message: "The request body must be a JSON object.",
    };
  }

  const { question, corpusId } = body;

  if (typeof question !== "string") {
    return {
      ok: false,
      errorCode: "INVALID_QUERY",
      message: "The question field is required and must be a string.",
    };
  }

  const trimmedQuestion = question.trim();

  if (trimmedQuestion.length === 0) {
    return {
      ok: false,
      errorCode: "INVALID_QUERY",
      message: "The question field is required.",
    };
  }

  if (trimmedQuestion.length < QUESTION_MIN_LENGTH) {
    return {
      ok: false,
      errorCode: "INVALID_QUERY",
      message: `The question must contain at least ${QUESTION_MIN_LENGTH} characters.`,
    };
  }

  if (trimmedQuestion.length > QUESTION_MAX_LENGTH) {
    return {
      ok: false,
      errorCode: "INVALID_QUERY",
      message: `The question must not exceed ${QUESTION_MAX_LENGTH} characters.`,
    };
  }

  if (typeof corpusId !== "string" || corpusId.trim().length === 0) {
    return {
      ok: false,
      errorCode: "INVALID_CORPUS",
      message: "The corpusId field is required.",
    };
  }

  const normalisedCorpusId = corpusId.trim().toLowerCase();

  if (!CORPUS_ID_PATTERN.test(normalisedCorpusId)) {
    return {
      ok: false,
      errorCode: "INVALID_CORPUS",
      message: "The corpusId format is not valid.",
    };
  }

  // Unknown extra fields are ignored on purpose (documented in
  // docs/security-boundaries.md) so that clients can add metadata without
  // breaking the contract, while nothing unvalidated reaches the core.
  return {
    ok: true,
    value: { question: trimmedQuestion, corpusId: normalisedCorpusId },
  };
}

/** Validates a load/registration request for the documents route. */
export function validateLoadDocumentsRequest(
  body: unknown,
): ValidationResult<{ corpusId: string }> {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errorCode: "INVALID_CORPUS",
      message: "The request body must be a JSON object.",
    };
  }

  const { corpusId } = body;

  if (typeof corpusId !== "string" || corpusId.trim().length === 0) {
    return {
      ok: false,
      errorCode: "INVALID_CORPUS",
      message: "The corpusId field is required.",
    };
  }

  const normalisedCorpusId = corpusId.trim().toLowerCase();

  if (!CORPUS_ID_PATTERN.test(normalisedCorpusId)) {
    return {
      ok: false,
      errorCode: "INVALID_CORPUS",
      message: "The corpusId format is not valid.",
    };
  }

  return { ok: true, value: { corpusId: normalisedCorpusId } };
}

/* ------------------------------------------------------------------ */
/* Response validation (output guard)                                  */
/* ------------------------------------------------------------------ */

function isScore(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Final guard executed before a QueryResponse leaves the server.
 * Enforces the response rules from docs/api-contracts.md.
 */
export function validateQueryResponse(response: QueryResponse): string[] {
  const problems: string[] = [];

  if (!isScore(response.citationCoverage)) {
    problems.push("citationCoverage is outside the 0-100 range.");
  }
  if (!isScore(response.retrievalQualityScore)) {
    problems.push("retrievalQualityScore is outside the 0-100 range.");
  }
  if (!response.notFound && response.citations.length === 0) {
    problems.push("A supported answer must include at least one citation.");
  }
  if (!response.notFound && response.answer.trim().length === 0) {
    problems.push("A supported answer must not be empty.");
  }
  if (response.notFound && response.citations.length > 0) {
    problems.push("A not-found answer must not include citations.");
  }
  if (response.citations.length !== response.evidence.length) {
    problems.push("Every citation must have a matching evidence snippet.");
  }
  for (const citation of response.citations) {
    if (
      typeof citation.relevanceScore !== "number" ||
      citation.relevanceScore < 0 ||
      citation.relevanceScore > 1
    ) {
      problems.push(`Citation ${citation.chunkId} has an out-of-range relevance score.`);
    }
    if (!citation.sourceId || !citation.chunkId) {
      problems.push("Citations must include sourceId and chunkId.");
    }
  }

  return problems;
}
