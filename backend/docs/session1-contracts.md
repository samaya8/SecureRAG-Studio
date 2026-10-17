# Session 1: Baseline Trace and Contracts

## Scope and current state

Session 1 defines the request trace, public data contracts, and trust
assumptions. It does not claim that answer generation, citation validation,
retrieval evaluation, authentication, or production ingestion is complete.

The repository contains exploratory ingestion and retrieval routes. They are
kept for later sessions, but they are not evidence that the complete RAG
workflow exists. The root and `/health` endpoints intentionally start without
loading an embedding model or connecting to Qdrant.

## Baseline request trace

1. An administrator selects a previously reviewed document.
2. `DocumentRegistrationRequest` records its stable `source_id`,
   `source_title`, owning `corpus_id`, and explicit approval.
3. `QueryRequest` accepts the canonical `question` field. The old input name
   `query` is accepted only as a compatibility alias.
4. A later retrieval session will search only the question's authorized,
   approved corpus and return evidence with the registered source identity.
5. The query route builds a grounded prompt and passes it to the configured
   provider boundary.
6. `AnswerResponse` permits exactly two result shapes:
   - supported: answer, citations, and evidence are present, scores are
     positive, and confidence is `high`, `medium`, or `low`;
   - no answer: answer, citations, and evidence are absent, scores are zero,
     confidence is `low`, and `limitation` explains why.
7. A blocked request sets `safety_flag=true` and uses the no-answer shape.

The exact answer fields are:

`question`, `answer`, `citations`, `evidence`, `citation_coverage`,
`retrieval_quality_score`, `confidence`, `not_found`, `safety_flag`, and
`limitation`.

## Safe bounded-corpus assumptions

- A corpus is finite and identified by `corpus_id`; retrieval must never fall
  back to the public internet or another corpus.
- `QueryRequest` carries the question and bounded `corpus_id`. Full
  server-side corpus authorization is still required before production use.
- Only explicitly reviewed documents with `approved=true` may be registered.
- `source_id` is stable and unique inside a corpus. `source_title` is display
  metadata and must not replace the stable ID.
- Registration, authorization, and corpus filtering are server-side controls.
  Client-provided approval alone is never sufficient authorization.
- Retrieved document text is untrusted data, not an instruction to the model.
- If evidence is missing, below threshold, outside the authorized corpus, or
  unsafe to use, the system returns the no-answer contract.
- Citation relevance scores are bounded to `[0, 1]`; aggregate response scores
  are bounded to `[0, 100]`. They are diagnostics, not guarantees of factual
  correctness.
- Logs and responses must not expose secrets, internal prompts, filesystem
  paths, or content from another corpus.

## Deferred to future sessions

- authenticated document registration and approval storage;
- corpus-scoped vector filtering and source persistence;
- Gemini/provider implementation beyond the placeholder provider boundary;
- safety classification and prompt-injection evaluation;
- end-to-end quality metrics and production error handling.
