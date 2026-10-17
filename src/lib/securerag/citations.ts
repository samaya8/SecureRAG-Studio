import { tokenize } from "./retrieval";
import type { Citation, RetrievedChunk } from "./schema";

/**
 * Citation generation and verification.
 *
 * Owner: Somaya Osama (Backend & Retrieval) with Yara Samir (verification).
 *
 * A citation is only produced from a chunk that was actually retrieved and
 * actually sent to the model. The model can never introduce a source: it
 * only returns 1-based indexes into the evidence list, and anything outside
 * that range is dropped here.
 */

const SNIPPET_MAX_LENGTH = 400;

/**
 * Picks the most relevant window of a chunk for display.
 *
 * The window is always a contiguous slice of the whitespace-normalised chunk
 * text, never a re-joined set of fragments, so `verifyCitations` can prove the
 * snippet really came from the document.
 */
export function selectEvidenceSnippet(question: string, chunkText: string): string {
  const normalised = chunkText.replace(/\s+/g, " ").trim();
  if (normalised.length <= SNIPPET_MAX_LENGTH) {
    return normalised;
  }

  const questionTerms = new Set(tokenize(question));

  // Score fixed-size windows and keep the densest one.
  const step = 60;
  let bestStart = 0;
  let bestScore = -1;

  for (let start = 0; start < normalised.length; start += step) {
    const window = normalised.slice(start, start + SNIPPET_MAX_LENGTH);
    const overlap = new Set(tokenize(window).filter((term) => questionTerms.has(term))).size;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestStart = start;
    }
    if (start + SNIPPET_MAX_LENGTH >= normalised.length) {
      break;
    }
  }

  // Align the window to a word boundary so the snippet reads cleanly.
  let start = bestStart;
  if (start > 0) {
    const boundary = normalised.indexOf(" ", start);
    start = boundary === -1 ? start : boundary + 1;
  }

  let snippet = normalised.slice(start, start + SNIPPET_MAX_LENGTH);
  if (start + SNIPPET_MAX_LENGTH < normalised.length) {
    const lastSpace = snippet.lastIndexOf(" ");
    if (lastSpace > SNIPPET_MAX_LENGTH / 2) {
      snippet = snippet.slice(0, lastSpace);
    }
  }

  return snippet.trim();
}

/**
 * Builds citations from the evidence indexes the model reported.
 * Indexes are 1-based and must refer to a chunk that was sent; invalid,
 * duplicate and out-of-range values are discarded.
 */
export function buildCitations(
  /** Text used to choose the most relevant snippet: the question plus, once
   *  generation has happened, the answer itself. Selecting on the answer is
   *  what guarantees the displayed evidence actually supports it. */
  focusText: string,
  chunks: RetrievedChunk[],
  usedEvidenceIndexes: number[],
): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];

  for (const rawIndex of usedEvidenceIndexes) {
    if (!Number.isInteger(rawIndex)) {
      continue;
    }
    const chunk = chunks[rawIndex - 1];
    if (!chunk || seen.has(chunk.chunkId)) {
      continue;
    }
    seen.add(chunk.chunkId);

    const citation: Citation = {
      sourceId: chunk.sourceId,
      sourceTitle: chunk.sourceTitle,
      evidenceSnippet: selectEvidenceSnippet(focusText, chunk.text),
      chunkId: chunk.chunkId,
      relevanceScore: chunk.score,
    };
    if (chunk.page !== undefined) {
      citation.page = chunk.page;
    }
    citations.push(citation);
  }

  return citations;
}

export interface CitationVerification {
  valid: Citation[];
  invalid: Citation[];
}

/**
 * Verifies that every citation still points at a retrieved chunk and that
 * its snippet really comes from that chunk. This is the last line of
 * defence against a fabricated or edited citation.
 */
export function verifyCitations(
  citations: Citation[],
  chunks: RetrievedChunk[],
): CitationVerification {
  const byChunkId = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const valid: Citation[] = [];
  const invalid: Citation[] = [];

  for (const citation of citations) {
    const chunk = byChunkId.get(citation.chunkId);
    if (!chunk || chunk.sourceId !== citation.sourceId) {
      invalid.push(citation);
      continue;
    }
    const haystack = chunk.text.replace(/\s+/g, " ").trim();
    const needle = citation.evidenceSnippet.replace(/\s+/g, " ").trim();
    if (needle.length === 0 || !haystack.includes(needle)) {
      invalid.push(citation);
      continue;
    }
    valid.push(citation);
  }

  return { valid, invalid };
}

/**
 * Deterministic citation coverage (0-100): the share of the answer's
 * meaningful terms that also appear in the cited evidence.
 *
 * This is a lexical grounding measure, not a semantic entailment check --
 * see docs/known-limitations.md.
 */
export function citationCoverage(answer: string, citations: Citation[]): number {
  const answerTerms = Array.from(new Set(tokenize(answer)));
  if (answerTerms.length === 0 || citations.length === 0) {
    return 0;
  }

  const evidenceTerms = new Set(
    tokenize(citations.map((citation) => citation.evidenceSnippet).join(" ")),
  );

  const supported = answerTerms.filter((term) => evidenceTerms.has(term)).length;
  return Math.max(0, Math.min(100, Math.round((supported / answerTerms.length) * 100)));
}
