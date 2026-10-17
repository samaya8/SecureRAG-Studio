# SecureRAG Studio Deployment

## Required environment variables

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `PROVIDER_TIMEOUT_MS`
- `RETRIEVAL_SCORE_THRESHOLD` (optional, defaults to `0.35`)

## Before deployment

1. Merge approved work into `dev`.
2. Run `npm ci`.
3. Run `npm run lint`.
4. Run `npm run type-check`.
5. Run `npm test`.
6. Run `npm run build`.
7. Confirm that no secret is committed.
8. Configure environment variables on the deployment platform.

## After deployment

1. Open the application URL.
2. Open `/api/securerag/health`.
3. Confirm that the health status is `healthy`.
4. Test one supported question.
5. Test one unsupported question.
6. Test one prompt-injection question.
7. Check logs for errors.

## Recovery plan

- **Provider outage / Gemini API errors:** the health endpoint will report
  `degraded` only when the API key is missing, not when Gemini itself is
  down. A failing provider call surfaces as a `502 PROVIDER_ERROR` on
  `/api/securerag/query` (see `src/lib/securerag/errors.ts`). No fallback
  model is configured for the MVP; if Gemini has an extended outage, the
  team should communicate a temporary maintenance banner on the frontend.
- **Bad deploy:** re-deploy the previous known-good commit on `main`
  through the deployment platform's rollback feature; do not attempt to
  hotfix directly on `main`.
- **Leaked secret:** rotate the Gemini API key immediately in Google AI
  Studio, update the deployment platform's environment variable, and
  redeploy. Never rely on `git revert` alone -- a committed secret must be
  treated as compromised even after removal from history.
