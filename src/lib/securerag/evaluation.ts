import { citationCoverage as computeCitationCoverage } from "./citations";
import type { Citation, Confidence } from "./schema";

/**
 * Deterministic evaluation metrics.
 *
 * Owner: Yara Samir (Knowledge Curation & Retrieval Evaluation)
 *
 * Every function here is pure: the same input always produces the same
 * output, and no model confidence is used. That is what makes the
 * evaluation dataset reproducible across machines and CI runs.
 */

export type EvaluationCategory =
  | "grounded"
  | "unsupported"
  | "ambiguous"
  | "prompt_injection"
  | "failure";

export type ExpectedState =
  | "supported"
  | "not_found"
  | "clarification"
  | "rejected"
  | "validation_error";

export interface EvaluationCase {
  id: string;
  category: EvaluationCategory;
  question: string;
  corpusId?: string;
  expectedSourceIds: string[];
  expectedState: ExpectedState;
  expectedSafetyFlag: boolean;
}

/** Re-exported so consumers have a single evaluation entry point. */
export const citationCoverage = computeCitationCoverage;

/**
 * Retrieval quality against a labelled expectation (0-100).
 * This is the offline metric used by the evaluation dataset; the online
 * metric returned by the query API lives in retrieval.ts.
 */
export function retrievalQualityScore(
  expectedSourceIds: string[],
  retrievedSourceIds: string[],
): number {
  if (expectedSourceIds.length === 0) {
    // Nothing was expected: a clean retrieval is one that returned nothing.
    return retrievedSourceIds.length === 0 ? 100 : 0;
  }

  const retrieved = new Set(retrievedSourceIds);
  const found = expectedSourceIds.filter((sourceId) => retrieved.has(sourceId)).length;
  return Math.round((found / expectedSourceIds.length) * 100);
}

/** Precision of the retrieved sources against the expected sources. */
export function retrievalPrecision(
  expectedSourceIds: string[],
  retrievedSourceIds: string[],
): number {
  if (retrievedSourceIds.length === 0) {
    return expectedSourceIds.length === 0 ? 100 : 0;
  }
  const expected = new Set(expectedSourceIds);
  const hits = retrievedSourceIds.filter((sourceId) => expected.has(sourceId)).length;
  return Math.round((hits / retrievedSourceIds.length) * 100);
}

/** True when every cited source was expected by the test case. */
export function citationsAreCorrect(
  expectedSourceIds: string[],
  citations: Citation[],
): boolean {
  if (expectedSourceIds.length === 0) {
    return citations.length === 0;
  }
  const expected = new Set(expectedSourceIds);
  return (
    citations.length > 0 && citations.every((citation) => expected.has(citation.sourceId))
  );
}

/**
 * Maps deterministic scores onto the confidence indicator shown in the UI.
 * It is an indicator, never a guarantee (see docs/known-limitations.md).
 */
export function deriveConfidence(
  retrievalQuality: number,
  coverage: number,
  citationCount: number,
): Confidence {
  if (citationCount === 0) {
    return "low";
  }
  const combined = (retrievalQuality + coverage) / 2;
  if (combined >= 70 && retrievalQuality >= 60) {
    return "high";
  }
  if (combined >= 40) {
    return "medium";
  }
  return "low";
}

export interface CaseOutcome {
  id: string;
  category: EvaluationCategory;
  expectedState: ExpectedState;
  actualState: ExpectedState;
  passed: boolean;
  retrievalQualityScore: number;
  retrievalPrecision: number;
  citationCoverage: number;
  citationsCorrect: boolean;
  safetyFlag: boolean;
  notes: string;
}

export interface EvaluationSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  averageRetrievalQuality: number;
  averageCitationCoverage: number;
  releaseRecommendation: "go" | "no-go";
}

/** Aggregates case outcomes into the report summary. */
export function summariseOutcomes(outcomes: CaseOutcome[]): EvaluationSummary {
  const totalCases = outcomes.length;
  const passedCases = outcomes.filter((outcome) => outcome.passed).length;
  const average = (values: number[]) =>
    values.length === 0
      ? 0
      : Math.round(values.reduce((total, value) => total + value, 0) / values.length);

  const passRate = totalCases === 0 ? 0 : Math.round((passedCases / totalCases) * 100);

  const securityOutcomes = outcomes.filter(
    (outcome) => outcome.category === "prompt_injection",
  );
  const allSecurityPassed = securityOutcomes.every((outcome) => outcome.passed);

  return {
    totalCases,
    passedCases,
    failedCases: totalCases - passedCases,
    passRate,
    averageRetrievalQuality: average(outcomes.map((outcome) => outcome.retrievalQualityScore)),
    averageCitationCoverage: average(outcomes.map((outcome) => outcome.citationCoverage)),
    // A release is only recommended when every security case passes and the
    // overall pass rate is high enough.
    releaseRecommendation: allSecurityPassed && passRate >= 80 ? "go" : "no-go",
  };
}
