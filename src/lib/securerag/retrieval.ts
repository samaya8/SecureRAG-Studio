import { loadCorpusChunks } from "./corpus";
import type { DocumentChunk, RetrievedChunk } from "./schema";

/**
 * Retrieval and ranking.
 *
 * Owner: Somaya Osama (Backend & Retrieval) with Yara Samir (metrics).
 *
 * The MVP uses a deterministic lexical ranker (BM25-style term weighting
 * plus phrase and coverage bonuses). It is intentionally not a model:
 * the same question against the same corpus always produces the same
 * ranking, which is what makes the evaluation layer reproducible.
 * Semantic retrieval is a documented follow-up (docs/known-limitations.md).
 */

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for",
  "from", "how", "i", "in", "is", "it", "its", "may", "must", "of", "on", "or",
  "should", "than", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "to", "was", "were", "what", "when", "where", "which", "who",
  "why", "will", "with", "would", "you", "your",
]);

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/** Lowercases, strips punctuation and removes stop words. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^-+|-+$/g, ""))
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * Very small English stemmer.
 *
 * It only strips the suffixes that matter for policy and research text, so
 * that "attendance"/"attend", "requirement"/"required" and "examinations"/
 * "examination" match each other. It is deliberately conservative: an
 * aggressive stemmer would create false matches that a lexical ranker cannot
 * recover from.
 */
export function stem(token: string): string {
  let current = token;

  if (current.length > 4 && current.endsWith("ies")) {
    current = `${current.slice(0, -3)}y`;
  } else if (current.length > 4 && current.endsWith("sses")) {
    current = current.slice(0, -2);
  } else if (current.length > 3 && current.endsWith("s") && !current.endsWith("ss")) {
    current = current.slice(0, -1);
  }

  for (const suffix of ["ements", "ement", "ances", "ance", "ences", "ence", "ments", "ment"]) {
    if (current.length > suffix.length + 3 && current.endsWith(suffix)) {
      return current.slice(0, -suffix.length);
    }
  }

  if (current.length > 5 && current.endsWith("ing")) {
    return current.slice(0, -3);
  }
  if (current.length > 4 && current.endsWith("ed")) {
    return current.slice(0, -2);
  }
  if (current.length > 5 && current.endsWith("ations")) {
    return current.slice(0, -6);
  }
  if (current.length > 5 && current.endsWith("ation")) {
    return current.slice(0, -5);
  }

  return current;
}

function stemAll(tokens: string[]): string[] {
  return tokens.map(stem);
}

export interface RetrieveOptions {
  /** Maximum number of chunks returned. */
  topK?: number;
  /** Chunks scoring below this are discarded before the provider call. */
  scoreThreshold?: number;
}

export const DEFAULT_TOP_K = 5;

interface ScoredChunk {
  chunk: DocumentChunk;
  rawScore: number;
  matchedTerms: number;
}

/**
 * Ranks pre-loaded chunks against a question. Exported separately from
 * `retrieveEvidence` so unit tests can rank a fixture corpus without
 * touching the filesystem.
 */
export function rankChunks(
  question: string,
  chunks: DocumentChunk[],
  options: RetrieveOptions = {},
): RetrievedChunk[] {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const questionTerms = Array.from(new Set(stemAll(tokenize(question))));

  if (questionTerms.length === 0 || chunks.length === 0) {
    return [];
  }

  const chunkTokens = chunks.map((chunk) => stemAll(tokenize(chunk.text)));
  const chunkLengths = chunkTokens.map((tokens) => tokens.length);
  const averageLength =
    chunkLengths.reduce((total, length) => total + length, 0) / chunkLengths.length || 1;

  // Document frequency per term.
  const documentFrequency = new Map<string, number>();
  for (const tokens of chunkTokens) {
    const unique = new Set(tokens);
    for (const term of questionTerms) {
      if (unique.has(term)) {
        documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
      }
    }
  }

  const totalChunks = chunks.length;
  const normalisedQuestion = question.toLowerCase();

  const scored: ScoredChunk[] = chunks.map((chunk, index) => {
    const tokens = chunkTokens[index];
    const length = chunkLengths[index] || 1;
    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }

    let score = 0;
    let matchedTerms = 0;

    for (const term of questionTerms) {
      const termFrequency = frequencies.get(term) ?? 0;
      if (termFrequency === 0) {
        continue;
      }
      matchedTerms += 1;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (totalChunks - df + 0.5) / (df + 0.5));
      const denominator =
        termFrequency + BM25_K1 * (1 - BM25_B + (BM25_B * length) / averageLength);
      score += idf * ((termFrequency * (BM25_K1 + 1)) / denominator);
    }

    // Coverage bonus: a chunk that contains most of the question's terms is
    // far more likely to actually answer it than one with a single rare hit.
    const coverage = matchedTerms / questionTerms.length;
    score *= 0.5 + coverage;

    // Phrase bonus for an exact multi-word overlap.
    const chunkText = chunk.text.toLowerCase();
    const questionPhrase = normalisedQuestion.replace(/[^a-z0-9\s]/g, " ").trim();
    if (questionPhrase.length > 12 && chunkText.includes(questionPhrase)) {
      score *= 1.5;
    }

    return { chunk, rawScore: score, matchedTerms };
  });

  const best = Math.max(...scored.map((entry) => entry.rawScore), 0);
  if (best <= 0) {
    return [];
  }

  return scored
    .filter((entry) => entry.rawScore > 0)
    .map((entry) => ({
      ...entry.chunk,
      // Normalised against the best chunk so the score is always 0-1 and
      // comparable across corpora of different sizes.
      score: Number((entry.rawScore / best).toFixed(4)),
    }))
    .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
    .slice(0, topK);
}

/**
 * Retrieves the best evidence for a question from one approved corpus.
 * Only approved documents are ever loaded (enforced in corpus.ts).
 */
export async function retrieveEvidence(
  question: string,
  corpusId: string,
  options: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const chunks = await loadCorpusChunks(corpusId);
  const ranked = rankChunks(question, chunks, options);
  const threshold = options.scoreThreshold ?? 0;
  return ranked.filter((chunk) => chunk.score >= threshold);
}

/**
 * Deterministic retrieval-quality score (0-100) for a single query.
 *
 * Combines three observable signals, all computed in normal code:
 *  - the strength of the best chunk relative to the trust threshold,
 *  - how much of the question's vocabulary the evidence covers,
 *  - how much agreement there is between the top chunks.
 */
export function scoreRetrievalQuality(
  question: string,
  chunks: RetrievedChunk[],
  threshold: number,
): number {
  if (chunks.length === 0) {
    return 0;
  }

  const questionTerms = Array.from(new Set(stemAll(tokenize(question))));
  if (questionTerms.length === 0) {
    return 0;
  }

  const evidenceTerms = new Set(stemAll(tokenize(chunks.map((chunk) => chunk.text).join(" "))));
  const covered = questionTerms.filter((term) => evidenceTerms.has(term)).length;
  const coverage = covered / questionTerms.length;

  const topScore = chunks[0].score;
  const headroom = Math.min(1, Math.max(0, (topScore - threshold) / Math.max(1 - threshold, 0.01)));

  const agreement =
    chunks.length === 1
      ? 0.5
      : chunks.slice(1).reduce((total, chunk) => total + chunk.score, 0) / (chunks.length - 1);

  const combined = 0.5 * coverage + 0.35 * headroom + 0.15 * agreement;
  return Math.max(0, Math.min(100, Math.round(combined * 100)));
}
