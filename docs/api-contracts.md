# SecureRAG Studio API Contracts

These contracts define the shared data structures used by the backend, frontend, retrieval system, and evaluation components.

All team members must follow the same field names and types.

---

## Approved Document Contract

```typescript
interface ApprovedDocument {
  id: string;
  title: string;
  version: string;
  category: string;
  approvalStatus: "pending" | "approved" | "rejected" | "archived";
  uploadedAt: string;
  approvedBy?: string;
  sourceType: "pdf" | "text" | "markdown";
}
```

### Field Notes

| Field | Description |
|---|---|
| `id` | Unique document identifier |
| `title` | Human-readable document title |
| `version` | Document version |
| `category` | Policy or document category |
| `approvalStatus` | Current document approval state |
| `uploadedAt` | ISO 8601 upload timestamp |
| `approvedBy` | Optional approver name or identifier |
| `sourceType` | Original document format |

---

## Query Request Contract

```typescript
interface QueryRequest {
  question: string;
  corpusId: string;
}
```

### Validation Requirements

- `question` must not be empty.
- `question` must be within the allowed length limit.
- `corpusId` must reference an approved corpus.
- Invalid requests must return a structured error response.

---

## Citation Contract

```typescript
interface Citation {
  sourceId: string;
  sourceTitle: string;
  evidenceSnippet: string;
  page?: number;
  chunkId: string;
  relevanceScore: number;
}
```

### Field Notes

| Field | Description |
|---|---|
| `sourceId` | Identifier of the supporting document |
| `sourceTitle` | Title displayed to the user |
| `evidenceSnippet` | Exact supporting text |
| `page` | Optional page number |
| `chunkId` | Identifier of the retrieved chunk |
| `relevanceScore` | Retrieval relevance score |

---

## Query Response Contract

```typescript
interface QueryResponse {
  question: string;
  answer: string;
  citations: Citation[];
  /** Exact supporting snippets, in the same order as `citations`. */
  evidence: string[];
  citationCoverage: number;
  retrievalQualityScore: number;
  confidence: "high" | "medium" | "low";
  notFound: boolean;
  safetyFlag: boolean;
  limitation: string | null;
  /** Correlates the response with the server logs. */
  requestId: string;
}
```

### Response Rules

- Supported answers must include at least one citation.
- `citationCoverage` must be between `0` and `100`.
- `retrievalQualityScore` must be between `0` and `100`.
- `notFound` must be `true` when sufficient evidence is unavailable.
- `safetyFlag` must be `true` when unsafe or suspicious input is detected.
- `limitation` must explain incomplete, uncertain, or refused answers.
- `evidence` must contain exactly one entry per citation.
- `requestId` must be present on every response, including errors.
- Every citation must be verifiable against a chunk that was actually retrieved.

---

## Supported Response Example

```json
{
  "question": "What is the minimum attendance requirement?",
  "answer": "Students must attend at least 75% of scheduled classes.",
  "citations": [
    {
      "sourceId": "attendance-policy-2026",
      "sourceTitle": "University Attendance Policy",
      "evidenceSnippet": "Students are required to attend at least 75% of scheduled classes.",
      "page": 3,
      "chunkId": "attendance-policy-2026-chunk-12",
      "relevanceScore": 0.95
    }
  ],
  "evidence": [
    "Students are required to attend at least 75% of scheduled classes."
  ],
  "citationCoverage": 100,
  "retrievalQualityScore": 95,
  "confidence": "high",
  "notFound": false,
  "safetyFlag": false,
  "limitation": null,
  "requestId": "req_9f1c..."
}
```

---

## Not-Found Response Example

```json
{
  "question": "What salary will graduates receive?",
  "answer": "",
  "citations": [],
  "evidence": [],
  "citationCoverage": 0,
  "retrievalQualityScore": 0,
  "confidence": "low",
  "notFound": true,
  "safetyFlag": false,
  "limitation": "No supporting evidence was found in the approved corpus.",
  "requestId": "req_9f1c..."
}
```

---

## Error Response Contract

```typescript
interface ErrorResponse {
  errorCode: string;
  message: string;
  retryable: boolean;
  requestId: string;
}
```

## Error Response Example

```json
{
  "errorCode": "INVALID_QUERY",
  "message": "The question field is required.",
  "retryable": true,
  "requestId": "req_9f1c..."
}
```

---

## Standard Error Codes

| Error Code | Meaning |
|---|---|
| `INVALID_QUERY` | Question validation failed |
| `INVALID_CORPUS` | Corpus does not exist or is unavailable |
| `UNAPPROVED_DOCUMENT` | Document is not approved |
| `RETRIEVAL_FAILED` | Retrieval process failed |
| `MODEL_FAILED` | AI provider request failed |
| `INVALID_MODEL_OUTPUT` | Generated output did not match the schema |
| `SAFETY_REJECTION` | Request was blocked for security reasons |
| `CONFIGURATION_ERROR` | The platform is not configured (for example a missing API key) |
| `INTERNAL_ERROR` | Unexpected server error |

---

## Documents Contract

`GET /api/securerag/documents`

```typescript
interface DocumentsResponse {
  corpora: CorpusSummary[];
  requestId: string;
}

interface CorpusSummary {
  corpusId: string;
  title: string;
  description: string;
  approvedDocumentCount: number;
  excludedDocumentCount: number;
  /** Approved documents only. Rejected and pending documents are never listed. */
  documents: ApprovedDocument[];
}
```

`POST /api/securerag/documents`

```typescript
interface LoadDocumentsRequest {
  corpusId: string;
}

interface LoadDocumentsResponse {
  corpusId: string;
  title: string;
  approvedDocumentCount: number;
  excludedDocumentCount: number;
  chunkCount: number;
  documents: ApprovedDocument[];
  requestId: string;
}
```

---

## Health Contract

`GET /api/securerag/health`

```typescript
interface HealthResponse {
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
  /** Names of misconfigured variables. Never their values. */
  issues: string[];
  timestamp: string;
  requestId: string;
}
```

Returns `200` when healthy and `503` when degraded.

---

## Contract Ownership

- Architecture and contract coordination: Sara
- Backend implementation: Somaya
- Frontend and evaluation integration: Mohab

Any contract change must be reviewed before implementation and communicated to all team members.
