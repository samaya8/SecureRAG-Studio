# SecureRAG Studio Architecture

## 1. System Overview

SecureRAG Studio is a secure Retrieval-Augmented Generation application that answers questions using only an approved and bounded document corpus.

The system retrieves relevant evidence from approved documents, generates an answer based on that evidence, validates the result, and returns exact citations.

The language model is not treated as the source of truth. The approved documents are the source of truth.

The system must return a safe not-found response when sufficient evidence is unavailable.

---

## 2. Architecture Goals

The architecture is designed to provide:

- Grounded answers based on approved documents
- Exact supporting citations
- Safe handling of unsupported questions
- Prompt-injection protection
- Stable structured API responses
- Deterministic evaluation scores
- Clear separation between frontend, backend, retrieval, and AI components
- Secure server-side handling of secrets

---

## 3. Main Components

### Frontend

The frontend provides:

- Approved corpus information
- Question input
- Loading and validation states
- Answer display
- Evidence and citation display
- Retrieval diagnostics
- Confidence indicators
- Safe not-found and error messages
- Evaluation results

### Backend API

The backend is responsible for:

- Request validation
- Corpus validation
- Approved-document filtering
- Document retrieval
- AI-provider communication
- Structured output validation
- Citation validation
- Deterministic score calculation
- Safe error handling

### Approved Corpus

The approved corpus contains the documents that the system is allowed to search.

Only documents with:

```text
approvalStatus = approved
```

may be retrieved.

Pending, rejected, and archived documents must not be searchable.

### Retrieval Layer

The retrieval layer:

1. Receives the validated question.
2. Searches approved document chunks.
3. Ranks relevant chunks.
4. Returns evidence snippets and source metadata.
5. Rejects insufficient retrieval results.

### AI Provider

The AI provider generates an answer using retrieved evidence.

The AI provider:

- Cannot access unapproved documents
- Cannot approve documents
- Cannot change permissions
- Cannot make authorization decisions
- Cannot expose API keys or system prompts
- Must use only the provided evidence

### Validation and Safety Layer

The validation layer checks:

- Request structure
- Question length
- Corpus availability
- Document approval status
- Suspicious input
- Generated output structure
- Citation presence
- Evidence availability
- Score ranges
- Safe error responses

---

## 4. High-Level Architecture Diagram

```text
┌──────────────────────────┐
│          User            │
└─────────────┬────────────┘
              │ Question
              ▼
┌──────────────────────────┐
│        Frontend UI       │
│ Question Form            │
│ Evidence Panel           │
│ Diagnostics              │
└─────────────┬────────────┘
              │ QueryRequest
              ▼
┌──────────────────────────┐
│      Backend API         │
│ Input Validation         │
│ Corpus Validation        │
│ Safety Checks            │
└─────────────┬────────────┘
              │ Validated request
              ▼
┌──────────────────────────┐
│     Retrieval Layer      │
│ Approved Documents Only  │
│ Chunk Search and Ranking │
└─────────────┬────────────┘
              │ Retrieved evidence
              ▼
┌──────────────────────────┐
│       AI Provider        │
│ Evidence-Grounded Answer │
└─────────────┬────────────┘
              │ Structured output
              ▼
┌──────────────────────────┐
│ Output Validation Layer  │
│ Citation Validation      │
│ Score Calculation        │
│ Not-Found Enforcement    │
└─────────────┬────────────┘
              │ QueryResponse
              ▼
┌──────────────────────────┐
│        Frontend UI       │
│ Answer + Exact Evidence  │
└──────────────────────────┘
```

---

## 5. Data Flow

The normal query flow is:

1. The user enters a question.
2. The frontend validates basic input requirements.
3. The frontend sends a `QueryRequest` to the backend.
4. The backend validates the question and corpus ID.
5. The backend checks for suspicious or malformed input.
6. The retrieval layer searches approved documents only.
7. Relevant chunks are returned with source metadata.
8. The AI provider receives the question and retrieved evidence.
9. The provider produces a structured answer.
10. The backend validates the generated structure.
11. Citations are checked against retrieved evidence.
12. Deterministic evaluation scores are calculated.
13. The backend returns a `QueryResponse`.
14. The frontend displays the answer, evidence, and diagnostics.

---

## 6. Frontend Responsibilities

The frontend must:

- Validate empty or obviously invalid questions
- Send requests using the agreed API contract
- Display loading status
- Display supported answers
- Display exact evidence snippets
- Display source titles and page numbers when available
- Display confidence and evaluation scores
- Handle not-found responses safely
- Handle provider and retrieval failures
- Display suspicious-request warnings
- Avoid exposing secrets or internal errors
- Never calculate authorization or approval decisions

The frontend must not contain private API keys.

---

## 7. Backend Responsibilities

The backend must:

- Validate all incoming requests
- Reject malformed input
- Enforce question-length limits
- Validate corpus IDs
- Search approved documents only
- Reject answers without sufficient evidence
- Communicate with the AI provider server-side
- Validate provider output
- Calculate deterministic scores
- Produce structured errors
- Prevent internal errors from reaching users
- Keep authorization decisions outside the language model

---

## 8. Retrieval Flow

The retrieval process follows these steps:

1. Load approved document metadata.
2. Exclude pending, rejected, and archived documents.
3. Divide documents into searchable chunks.
4. Compare the question with approved chunks.
5. Rank the chunks by relevance.
6. Select the strongest evidence.
7. Return chunk text and source metadata.
8. Return not-found when evidence is insufficient.

Each retrieved citation should include:

- Source identifier
- Source title
- Exact evidence snippet
- Page number when available
- Chunk identifier
- Relevance score

---

## 9. AI Provider Boundary

The AI provider is outside the trusted application boundary.

The provider receives only:

- The validated question
- The approved retrieved evidence
- Instructions for structured output

The provider must not receive:

- API keys
- Database credentials
- Internal authorization data
- Unapproved documents
- Private system configuration

Provider output must be validated before it is displayed.

The application must not trust provider output automatically.

---

## 10. Trust Boundaries

### Trusted Components

The following components are controlled by the application:

- Server-side validation
- Approved document register
- Corpus permission rules
- Deterministic score functions
- Structured output schema
- Error handling rules

### Untrusted Inputs

The following must be treated as untrusted:

- User questions
- Uploaded documents
- Text inside retrieved documents
- AI-provider output
- External error messages

Retrieved documents may contain instructions that attempt to manipulate the model. Such instructions must be treated as document content, not application commands.

---

## 11. Supported Answer Flow

A supported answer requires:

1. A valid question
2. A valid approved corpus
3. Relevant retrieved evidence
4. At least one valid citation
5. A response matching the agreed schema

Expected result:

```text
notFound = false
citations.length >= 1
confidence = high | medium | low
limitation = null or an explanatory message
```

---

## 12. Not-Found Flow

The system must return not-found when:

- No relevant evidence is retrieved
- Retrieved evidence does not answer the question
- The corpus is empty
- Only unapproved documents contain relevant information

Expected result:

```text
answer = ""
citations = []
citationCoverage = 0
retrievalQualityScore = 0
confidence = "low"
notFound = true
safetyFlag = false
```

The limitation field must explain that the approved corpus does not contain sufficient evidence.

---

## 13. Suspicious Request Flow

A request may be considered suspicious when it attempts to:

- Ignore system instructions
- Bypass approved-document rules
- Reveal API keys
- Reveal system prompts
- Disable citations
- Pretend to be an administrator
- Change document approval status

Expected result:

```text
safetyFlag = true
```

The request must be rejected or safely limited without exposing internal information.

---

## 14. Error Flow

Errors must use the shared `ErrorResponse` contract.

The backend must:

- Return a clear error code
- Return a safe user-facing message
- Indicate whether retrying may help
- Never return API keys
- Never return stack traces
- Never return raw provider errors
- Never expose internal paths or database details

---

## 15. Evaluation Scores

Evaluation scores are deterministic and must be calculated using normal application code.

The language model must not invent the scores.

### Citation Coverage

For the MVP:

- No answer or no citations: `0`
- Answer with at least one valid citation: `100`

### Retrieval Quality Score

The score compares the expected source IDs with the retrieved source IDs.

Both scores use a range from:

```text
0–100
```

---

## 16. Team Responsibilities

### Sara — Integration Lead and Solution Architect

- Architecture design
- API contract coordination
- Security boundaries
- GitHub workflow
- Pull-request review
- Integration testing
- Deployment coordination
- Release management

### Somaya — RAG and Backend Engineer

- Document API
- Query API
- Retrieval implementation
- Provider integration
- Backend validation
- Backend testing

### Mohab — Product UI, Security and Evaluation Engineer

- Frontend implementation
- Evidence presentation
- Evaluation cases
- Evaluation dashboard
- Prompt-injection testing
- UI state handling
