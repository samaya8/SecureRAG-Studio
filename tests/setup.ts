/**
 * Global test setup.
 *
 * Tests must never depend on a developer's local environment, so the
 * provider is forced to the deterministic mock and any real key that happens
 * to be present in the shell is removed before a single test runs.
 */
process.env.AI_PROVIDER = "mock";
delete process.env.GEMINI_API_KEY;
process.env.RETRIEVAL_SCORE_THRESHOLD = "0.35";
process.env.MIN_CITATION_COVERAGE = "25";
