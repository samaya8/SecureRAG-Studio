# Python Backend (exploratory prototype — not the deployed backend)

## Status

This FastAPI service is an **exploratory prototype from the foundation phase**. It is
kept in the repository for reference and for the team's Qdrant/embedding experiments.

**It is not the backend of SecureRAG Studio.** The project documentation defines the
backend as Next.js API Routes, and that is where the running implementation lives:

| Route | Implementation |
|-------|----------------|
| `POST /api/securerag/documents` | `src/app/api/securerag/documents/route.ts` |
| `POST /api/securerag/query` | `src/app/api/securerag/query/route.ts` |
| `GET /api/securerag/health` | `src/app/api/securerag/health/route.ts` |

The retrieval, chunking, citation, security and evaluation logic lives in
`src/lib/securerag/`, and the AI provider abstraction lives in `src/lib/ai/`.

## Why it is kept

- It documents the ingestion and vector-store design the team evaluated.
- It contains unit tests for the chunker, embedder and prompt builder that informed the
  TypeScript implementation.

## Why it is not wired up

Running two backends would duplicate the API contract and create two places where the
approved-document rule would have to be enforced, which is exactly the kind of
divergence the security boundaries document forbids. Deleting it would lose the team's
prototype work, so it stays here, clearly marked, and is excluded from the application
build, the CI pipeline and the deployment.

## If you want to run it anyway

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

It requires its own environment file (`backend/.env.example`) and a running Qdrant
instance. It is not covered by `npm run verify` and is not part of the release.
