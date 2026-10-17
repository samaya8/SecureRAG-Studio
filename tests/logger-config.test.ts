import { afterEach, describe, expect, it, vi } from "vitest";

import { getConfig, validateConfig } from "@/lib/securerag/config";
import { createRequestId, hashForLogging, logger } from "@/lib/securerag/logger";

describe("privacy-safe logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("redacts anything that looks like a secret", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logger.info("test", { apiKey: "secret-value", authorization: "Bearer abc" });

    const line = spy.mock.calls[0][0] as string;
    expect(line).not.toContain("secret-value");
    expect(line).not.toContain("Bearer abc");
    expect(line).toContain("[redacted]");
  });

  it("truncates long values so document content cannot be dumped", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logger.info("test", { evidence: "x".repeat(5000) });

    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain("truncated");
    expect(line.length).toBeLessThan(1000);
  });

  it("hashes a question instead of logging it", () => {
    const hash = hashForLogging("What is the minimum attendance requirement?");
    expect(hash).toMatch(/^h[0-9a-f]+$/);
    expect(hash).not.toContain("attendance");
  });

  it("produces the same hash for the same question", () => {
    expect(hashForLogging("same question")).toBe(hashForLogging("same question"));
  });

  it("creates unique request ids", () => {
    expect(createRequestId()).not.toBe(createRequestId());
    expect(createRequestId()).toMatch(/^req_/);
  });
});

describe("configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to safe defaults for invalid values", () => {
    vi.stubEnv("PROVIDER_TIMEOUT_MS", "not-a-number");
    vi.stubEnv("RETRIEVAL_SCORE_THRESHOLD", "12");
    vi.stubEnv("MIN_CITATION_COVERAGE", "-5");

    const config = getConfig();
    expect(config.providerTimeoutMs).toBe(15_000);
    expect(config.retrievalScoreThreshold).toBe(0.35);
    expect(config.minCitationCoverage).toBe(25);
  });

  it("defaults to the Gemini provider", () => {
    vi.stubEnv("AI_PROVIDER", "");
    expect(getConfig().provider).toBe("gemini");
  });

  it("reports a missing API key without revealing any value", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");

    const issues = validateConfig();
    expect(issues).toHaveLength(1);
    expect(issues[0].variable).toBe("GEMINI_API_KEY");
  });

  it("warns when the mock provider is enabled in production", () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "production");

    expect(validateConfig().some((issue) => issue.variable === "AI_PROVIDER")).toBe(true);
  });

  it("reports no issue when the mock provider is used in development", () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    expect(validateConfig()).toHaveLength(0);
  });
});
