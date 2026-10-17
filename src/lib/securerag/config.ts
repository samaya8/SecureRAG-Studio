/**
 * Centralized configuration reader and validator.
 *
 * Owner: Monica Nabil (Platform Integration & Deployment)
 *
 * Nothing else in the app may call `process.env` directly -- always go
 * through getConfig() so there is one place that knows the variable names,
 * one place that validates them, and one place to change defaults.
 *
 * This module is server-only. No value here is ever sent to the browser.
 */

export type ProviderName = "gemini" | "mock";

export interface AppConfig {
  nodeEnv: string;
  provider: ProviderName;
  geminiApiKey: string | null;
  geminiModel: string;
  providerTimeoutMs: number;
  /** Evidence scoring below this is not trusted enough to send to the model. */
  retrievalScoreThreshold: number;
  /** Maximum number of evidence chunks sent to the provider. */
  maxEvidenceChunks: number;
  /** Minimum citation coverage (0-100) an answer must reach to be returned. */
  minCitationCoverage: number;
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function readUnitInterval(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

function readPercentage(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return fallback;
  }
  return parsed;
}

function readProvider(value: string | undefined): ProviderName {
  return value?.trim().toLowerCase() === "mock" ? "mock" : "gemini";
}

export function getConfig(): AppConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    provider: readProvider(process.env.AI_PROVIDER),
    // An empty or placeholder value counts as "not configured" so the health
    // endpoint reports the problem instead of failing later at request time.
    geminiApiKey:
      !apiKey || apiKey.startsWith("replace_with") || apiKey === "your_api_key_here"
        ? null
        : apiKey,
    geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite",
    providerTimeoutMs: readPositiveNumber(process.env.PROVIDER_TIMEOUT_MS, 15_000),
    retrievalScoreThreshold: readUnitInterval(process.env.RETRIEVAL_SCORE_THRESHOLD, 0.35),
    maxEvidenceChunks: readPositiveNumber(process.env.MAX_EVIDENCE_CHUNKS, 5),
    minCitationCoverage: readPercentage(process.env.MIN_CITATION_COVERAGE, 25),
  };
}

export interface ConfigIssue {
  variable: string;
  message: string;
}

/**
 * Reports configuration problems for the health endpoint.
 * Never returns a value -- only the name of the variable and what is wrong.
 */
export function validateConfig(config: AppConfig = getConfig()): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  if (config.provider === "gemini" && !config.geminiApiKey) {
    issues.push({
      variable: "GEMINI_API_KEY",
      message: "GEMINI_API_KEY is not configured. Query requests will fail safely.",
    });
  }

  if (config.provider === "mock" && config.nodeEnv === "production") {
    issues.push({
      variable: "AI_PROVIDER",
      message: "The mock provider is enabled in production. Set AI_PROVIDER=gemini.",
    });
  }

  return issues;
}
