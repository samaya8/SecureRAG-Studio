# Backend Work Documentation

## Important Status Note

The `backend/` folder is a Python FastAPI prototype for SecureRAG Studio. It is kept for reference and experimentation with ingestion, embeddings, retrieval, Qdrant, prompt construction, and backend API contracts.

The currently deployed/running application backend is the Next.js API backend in:

- `src/app/api/securerag/documents/route.ts`
- `src/app/api/securerag/query/route.ts`
- `src/app/api/securerag/health/route.ts`
- `src/lib/securerag/`
- `src/lib/ai/`

The Python backend is still valuable because it shows the original backend design and the logic that later informed the TypeScript implementation.

## What You Built In The Backend Folder

You built a FastAPI-based RAG backend prototype with these responsibilities:

1. Accept and validate user questions.
2. Detect unsafe prompt-injection style queries.
3. Load documents from PDF, DOCX, TXT, and Markdown files.
4. Split documents into stable overlapping chunks.
5. Generate vector embeddings with SentenceTransformers.
6. Store embedded chunks in Qdrant.
7. Retrieve relevant chunks for a user query.
8. Build a grounded prompt using only retrieved evidence.
9. Pass that prompt through a replaceable AI provider boundary.
10. Return a strict answer contract with citations, evidence, scores, confidence, and safe no-answer behavior.

## Backend Architecture

The backend follows a RAG pipeline:

```text
Uploaded document
  -> DocumentLoader
  -> Chunker
  -> Embedder
  -> Qdrant VectorStore
  -> Retriever
  -> PromptBuilder
  -> AIProvider
  -> AnswerResponse
```

The main app starts in `backend/app/main.py`. It creates a FastAPI app and mounts three route groups:

- `/ingest/` for document ingestion.
- `/retrieve/` for direct retrieval testing.
- `/query/` for the full question-answering flow.

It also exposes:

- `/` basic root check.
- `/health` health check.

## Configuration

Configuration lives in `backend/app/config.py`.

Main settings:

- `EMBEDDING_MODEL`: defaults to `BAAI/bge-small-en-v1.5`.
- `QDRANT_HOST`: defaults to `localhost`.
- `QDRANT_PORT`: defaults to `6333`.
- `COLLECTION_NAME`: defaults to `secure_rag`.
- `TOP_K`: defaults to `5`.
- `SCORE_THRESHOLD`: defaults to `0.65`.

These values control which embedding model is loaded, where Qdrant runs, which collection stores vectors, how many chunks are retrieved, and what minimum similarity score is trusted.

## Dependency Layer

`backend/app/dependencies.py` defines lazy cached dependencies:

- `get_embedder()`
- `get_vector_store()`
- `get_retriever()`
- `get_prompt_builder()`
- `get_ai_provider()`

This matters because embedding models and vector-store clients can be expensive to initialize. The backend only creates them when an endpoint needs them, and then reuses them in the same process.

## Ingestion Flow

The ingestion route is in `backend/app/routes/ingest.py`.

Endpoint:

```text
POST /ingest/
```

It accepts:

- `file`: uploaded document.
- `corpus_id`: form field, defaulting to `default`.

Supported file extensions:

- `.pdf`
- `.docx`
- `.txt`
- `.md`

Flow:

1. Validate the uploaded file extension.
2. Save the upload temporarily.
3. Load text using `DocumentLoader`.
4. Reject the file if no readable text is found.
5. Split loaded text into chunks using `Chunker`.
6. Embed chunks using `Embedder`.
7. Create the Qdrant collection if needed.
8. Upsert embedded chunks into Qdrant with the selected `corpus_id`.
9. Delete the temporary file.
10. Return ingestion counts.

## Document Loading

Document loading lives in `backend/app/ingestion/loaders.py`.

`DocumentLoader` handles:

- PDFs with `pypdf`.
- DOCX files with `python-docx`.
- TXT and Markdown files with normal UTF-8 text loading.

For PDFs, each page becomes a separate `Document` object so page numbers can be preserved for citations.

For extracted text, whitespace is normalized so chunks are cleaner and retrieval is less noisy.

## Chunking

Chunking lives in `backend/app/ingestion/chunker.py`.

`Chunker` splits documents into overlapping chunks:

- Default chunk size: `1000` characters.
- Default overlap: `150` characters.

The chunker tries to split naturally at:

- paragraph breaks,
- line breaks,
- sentence boundaries,
- spaces.

Each chunk receives a deterministic SHA-256 `chunk_id` based on:

```text
filename:page:offset
```

This makes chunks stable and traceable.

## Embeddings

Embedding logic lives in `backend/app/ingestion/embedder.py`.

`Embedder` uses `SentenceTransformer` with:

```text
BAAI/bge-small-en-v1.5
```

It can embed:

- a single text string,
- a user query,
- a list of chunks.

Embeddings are normalized, which works well with cosine similarity in Qdrant.

## Vector Store

Qdrant integration lives in `backend/app/retrieval/vector_store.py`.

`VectorStore` handles:

- connecting to Qdrant,
- creating the vector collection,
- inserting embedded chunks,
- searching for relevant chunks.

The Qdrant collection uses:

- vector size `384`,
- cosine distance.

Each stored point includes payload metadata:

- `chunk_id`
- `text`
- `filename`
- `page`
- `section`
- `chunk_index`
- `corpus_id`

The search method supports corpus filtering, so retrieval can be limited to one approved corpus.

## Retrieval

Retrieval orchestration lives in `backend/app/retrieval/retriever.py`.

`Retriever.retrieve()`:

1. Embeds the user query.
2. Sends the query vector to Qdrant.
3. Applies `top_k`, score threshold, and corpus filtering.
4. Returns a list of `RetrievalResult` objects.

The direct retrieval endpoint is in `backend/app/routes/retrieve.py`.

Endpoint:

```text
POST /retrieve/
```

It validates the query first, retrieves relevant chunks, and returns filename, page, score, and text for each result.

## Query Validation And Safety

Safety validation lives in `backend/app/security/validator.py`.

`QueryValidator` rejects:

- empty queries,
- whitespace-only queries,
- overly long queries,
- punctuation-only queries,
- excessive repeated punctuation,
- suspicious repeated text,
- prompt-injection phrases.

Examples of blocked phrases:

- `ignore previous instructions`
- `reveal your system prompt`
- `show api key`
- `disable citations`
- `bypass approved documents`
- `pretend you are an administrator`
- `change document approval`

This is important because retrieved document text and user questions are treated as untrusted input.

## Prompt Building

Prompt construction lives in `backend/app/generation/prompt_builder.py`.

`PromptBuilder` builds a grounded prompt with:

- strict instructions to answer only from retrieved context,
- a fallback sentence when there is not enough information,
- citation requirements,
- retrieved context sections,
- the user question.

Each retrieved context block includes:

- document number,
- filename,
- page,
- retrieval score,
- chunk content.

Long chunks are capped to `1000` characters in the prompt.

## AI Provider Boundary

The provider abstraction lives in `backend/app/generation/provider.py`.

It defines:

- `AIProvider` protocol.
- `PlaceholderAIProvider`.

The placeholder provider returns:

```text
Provider not connected.
```

This means the Python backend was designed to be provider-ready without directly owning Gemini/API-key integration. In the final app, the real Gemini integration exists in the TypeScript backend under `src/lib/ai/`.

## Query Answering Flow

The full question-answering route is in `backend/app/routes/query.py`.

Endpoint:

```text
POST /query/
```

Flow:

1. Validate the question.
2. If the question is suspicious, return a safe blocked no-answer response.
3. Retrieve chunks from the requested corpus.
4. Keep only chunks above `SCORE_THRESHOLD`.
5. If no trusted evidence exists, return a no-answer response.
6. Build a grounded prompt from the trusted chunks.
7. Send the prompt to the AI provider.
8. If the provider fails, return a safe `MODEL_FAILED` error.
9. If the answer is empty or says there is not enough information, return no-answer.
10. Convert trusted chunks into citations.
11. Compute retrieval quality and citation coverage.
12. Return a structured `AnswerResponse`.

## Response Contract

The strict API models live in `backend/app/models/schemas.py`.

Important models:

- `DocumentRegistrationRequest`
- `QueryRequest`
- `Citation`
- `AnswerResponse`
- `RetrieveRequest`
- `RetrieveResponse`
- `IngestResponse`
- `ErrorResponse`

`AnswerResponse` supports exactly two safe shapes.

### Supported Answer

A supported answer must include:

- `question`
- non-empty `answer`
- at least one citation
- evidence snippets
- positive citation coverage
- positive retrieval quality score
- confidence of `high`, `medium`, or `low`
- `not_found=false`
- `safety_flag=false`
- `limitation=null`

### No-Answer Response

A no-answer response must include:

- `answer=null`
- no citations
- no evidence
- `citation_coverage=0`
- `retrieval_quality_score=0`
- `confidence=low`
- `not_found=true`
- a non-empty `limitation`

If `safety_flag=true`, the response must also be a no-answer response.

## Scoring

The backend computes:

- `retrieval_quality_score`: best trusted retrieval score multiplied by 100.
- `citation_coverage`: percentage of trusted evidence chunks represented by citations.
- `confidence`: derived from retrieval quality.

Confidence mapping:

- `high`: score >= 85
- `medium`: score >= 70
- `low`: below 70

## Tests You Added Or Maintained

The backend tests cover the important behavior:

- contract validation,
- strict response shapes,
- safe no-answer states,
- prompt-injection handling,
- retrieval result formatting,
- query route success path,
- query route no-evidence path,
- safe provider failure behavior,
- chunking behavior,
- embedding behavior,
- Qdrant/vector-store behavior,
- prompt builder behavior,
- health endpoint behavior.

Key test files:

- `backend/tests/test_contracts.py`
- `backend/tests/test_query_route.py`
- `backend/tests/chunker_test.py`
- `backend/tests/embedder_test.py`
- `backend/tests/prompt_builder_test.py`
- `backend/tests/qdrant_test.py`
- `backend/tests/retriever_test.py`
- `backend/tests/test_health.py`

## How To Run The Python Backend Prototype

From the project root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

On Windows PowerShell, activation is usually:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The prototype expects Qdrant to be running locally on port `6333`.

## How The Python Backend Differs From The Running App

The Python backend:

- is an exploratory prototype,
- uses FastAPI,
- uses Qdrant directly,
- uses SentenceTransformers for embeddings,
- has a placeholder AI provider,
- is not used by `npm run dev`,
- is not deployed as the app backend.

The running SecureRAG Studio app:

- uses Next.js API routes,
- stores the approved corpus in repository files,
- implements retrieval and security in TypeScript,
- uses the Gemini provider in `src/lib/ai/gemini-provider.ts`,
- is run with `npm run dev`,
- is tested with Vitest.

## Short Summary For Presentation

In the backend folder, you built the first RAG backend prototype. It loads documents, chunks them, embeds the chunks, stores them in Qdrant, retrieves relevant evidence for a question, validates unsafe queries, builds grounded prompts, and returns strict answer responses with citations and safe no-answer behavior. You also defined the contracts and tests that describe how the backend should behave when evidence is available, missing, unsafe, or when the AI provider fails.
