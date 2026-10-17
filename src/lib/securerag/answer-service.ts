import type { AIProvider, EvidenceItem } from "@/lib/ai/providers";
import { buildCitations, citationCoverage, verifyCitations } from "./citations";
import { getConfig } from "./config";
import { deriveConfidence } from "./evaluation";
import { logger, hashForLogging } from "./logger";
import { retrieveEvidence, scoreRetrievalQuality } from "./retrieval";
import type { QueryResponse, RetrievedChunk } from "./schema";
import { validateQueryResponse } from "./schema";
import {
  INDIRECT_INJECTION_LIMITATION,
  detectDirectInjection,
  detectIndirectInjection,
  SAFETY_REJECTION_MESSAGE,
} from "./security";

/**
 * Orchestration service: security -> retrieval -> provider -> validation.
 *
 * Owner: Monica Nabil (Platform Integration) with Somaya Osama (retrieval).
 *
 * The central rule of SecureRAG Studio is enforced here and nowhere else:
 * no valid evidence means no answer. Every early return produces a complete,
 * contract-shaped QueryResponse so the frontend never has to special-case a
 * partial payload.
 */

export interface AnswerQuestionInput {
  question: string;
  corpusId: string;
  requestId: string;
}

const NOT_FOUND_LIMITATION =
  "No supporting evidence was found in the approved corpus.";

function emptyResponse(
  input: AnswerQuestionInput,
  limitation: string,
  safetyFlag = false,
): QueryResponse {
  return {
    question: input.question,
    answer: "",
    citations: [],
    evidence: [],
    citationCoverage: 0,
    retrievalQualityScore: 0,
    confidence: "low",
    notFound: true,
    safetyFlag,
    limitation,
    requestId: input.requestId,
  };
}

export async function answerQuestion(
  provider: AIProvider,
  input: AnswerQuestionInput,
): Promise<QueryResponse> {
  const { question, corpusId, requestId } = input;
  const config = getConfig();
  const startedAt = Date.now();

  /* 1. Security layer: direct prompt injection is rejected before anything
        expensive happens, and before any evidence is loaded. */
  const directScan = detectDirectInjection(question);
  if (directScan.detected) {
    logger.warn("Blocked a direct prompt-injection attempt", {
      requestId,
      corpusId,
      questionHash: hashForLogging(question),
      matchedRules: directScan.matchedRules.join(","),
    });
    return emptyResponse(input, SAFETY_REJECTION_MESSAGE, true);
  }

  /* 2. Retrieval over approved documents only. */
  const retrieved = await retrieveEvidence(question, corpusId, {
    topK: config.maxEvidenceChunks,
  });
  const trusted: RetrievedChunk[] = retrieved.filter(
    (chunk) => chunk.score >= config.retrievalScoreThreshold,
  );

  logger.info("Retrieval completed", {
    requestId,
    corpusId,
    questionHash: hashForLogging(question),
    chunkCount: retrieved.length,
    trustedChunkCount: trusted.length,
    topScore: retrieved[0]?.score ?? 0,
  });

  if (trusted.length === 0) {
    return emptyResponse(input, NOT_FOUND_LIMITATION);
  }

  /* 3. Indirect injection: evidence may contain embedded instructions. The
        prompt builder neutralises them; here we only record the flag. */
  const indirectScan = detectIndirectInjection(trusted.map((chunk) => chunk.text).join("\n"));
  if (indirectScan.detected) {
    logger.warn("Evidence contains embedded instructions", {
      requestId,
      corpusId,
      matchedRules: indirectScan.matchedRules.join(","),
      affectedSourceIds: trusted
        .filter((chunk) => detectIndirectInjection(chunk.text).detected)
        .map((chunk) => chunk.sourceId)
        .join(","),
    });
  }

  /* 4. Generation. Provider errors propagate as typed SecureRAGErrors and
        are turned into safe responses by the route. */
  const evidence: EvidenceItem[] = trusted.map((chunk, index) => ({
    index: index + 1,
    text: chunk.text,
  }));

  const generated = await provider.generateAnswer({ question, evidence });

  const answer = generated.answer.trim();
  const modelReportedNotFound =
    answer.toUpperCase() === "NOT_FOUND" ||
    answer.length === 0 ||
    generated.usedEvidenceIndexes.length === 0;

  if (modelReportedNotFound) {
    return emptyResponse(input, NOT_FOUND_LIMITATION, indirectScan.detected);
  }

  /* 5. Citation generation and verification. A citation that does not match
        a retrieved chunk is discarded, never shown. */
  const citations = buildCitations(
    `${question}\n${answer}`,
    trusted,
    generated.usedEvidenceIndexes,
  );
  const { valid: verifiedCitations, invalid } = verifyCitations(citations, trusted);

  if (invalid.length > 0) {
    logger.warn("Discarded citations that did not match retrieved evidence", {
      requestId,
      corpusId,
      discardedCount: invalid.length,
    });
  }

  if (verifiedCitations.length === 0) {
    // No verifiable citation means no answer, even though the model produced
    // text. This is the anti-hallucination backstop.
    return emptyResponse(input, NOT_FOUND_LIMITATION, indirectScan.detected);
  }

  /* 6. Deterministic scoring. */
  const coverage = citationCoverage(answer, verifiedCitations);
  const retrievalQuality = scoreRetrievalQuality(
    question,
    trusted,
    config.retrievalScoreThreshold,
  );

  if (coverage < config.minCitationCoverage) {
    logger.warn("Answer rejected for insufficient citation coverage", {
      requestId,
      corpusId,
      citationCoverage: coverage,
    });
    return emptyResponse(
      input,
      "The generated answer was not sufficiently supported by the approved evidence.",
      indirectScan.detected,
    );
  }

  const limitations: string[] = [];
  if (indirectScan.detected) {
    limitations.push(INDIRECT_INJECTION_LIMITATION);
  }
  if (coverage < 60) {
    limitations.push("Parts of this answer are only partially supported by the evidence.");
  }

  const response: QueryResponse = {
    question,
    answer,
    citations: verifiedCitations,
    evidence: verifiedCitations.map((citation) => citation.evidenceSnippet),
    citationCoverage: coverage,
    retrievalQualityScore: retrievalQuality,
    confidence: deriveConfidence(retrievalQuality, coverage, verifiedCitations.length),
    notFound: false,
    safetyFlag: indirectScan.detected,
    limitation: limitations.length > 0 ? limitations.join(" ") : null,
    requestId,
  };

  /* 7. Output structure guard. If the assembled response would violate the
        published contract, fall back to a safe not-found response. */
  const problems = validateQueryResponse(response);
  if (problems.length > 0) {
    logger.error("Assembled response failed contract validation", {
      requestId,
      corpusId,
      problemCount: problems.length,
      problems: problems.join(" | "),
    });
    return emptyResponse(input, NOT_FOUND_LIMITATION, indirectScan.detected);
  }

  logger.info("Query answered", {
    requestId,
    corpusId,
    citationCount: response.citations.length,
    citationCoverage: response.citationCoverage,
    retrievalQualityScore: response.retrievalQualityScore,
    durationMs: Date.now() - startedAt,
  });

  return response;
}
