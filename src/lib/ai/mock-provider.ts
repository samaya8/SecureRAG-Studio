import type { AIProvider, GenerateAnswerInput, GeneratedAnswer } from "./providers";

/**
 * Deterministic extractive provider used for tests, CI and offline demos.
 *
 * Owner: Monica Nabil (Platform Integration & Deployment)
 *
 * It performs no network call and no generation: it selects the sentences in
 * the supplied evidence that overlap the question and returns them verbatim.
 * That keeps the grounding rule intact (nothing is invented) while making the
 * whole pipeline runnable and reproducible without an API key.
 *
 * Enabled only with AI_PROVIDER=mock. Never used in production.
 */

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for",
  "from", "how", "in", "is", "it", "its", "may", "must", "of", "on", "or",
  "should", "that", "the", "their", "them", "there", "these", "they", "this",
  "to", "was", "were", "what", "when", "where", "which", "who", "why", "will",
  "with", "would", "you", "your",
]);

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .map((token) => (token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token));
}

export class MockProvider implements AIProvider {
  readonly name = "mock";

  async generateAnswer(input: GenerateAnswerInput): Promise<GeneratedAnswer> {
    const questionTerms = new Set(terms(input.question));
    if (questionTerms.size === 0 || input.evidence.length === 0) {
      return { answer: "NOT_FOUND", usedEvidenceIndexes: [] };
    }

    const selected: Array<{ index: number; sentence: string; score: number }> = [];

    for (const item of input.evidence) {
      const sentences = item.text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]*/g) ?? [];
      let best: { sentence: string; score: number } | null = null;

      for (const sentence of sentences) {
        const sentenceTerms = terms(sentence);
        if (sentenceTerms.length === 0) {
          continue;
        }
        const overlap = sentenceTerms.filter((term) => questionTerms.has(term)).length;
        // F1 of recall (question terms covered) and precision (how much of
        // the sentence is on topic), so a short exact sentence beats a long
        // sentence that merely mentions the same words.
        const recall = overlap / questionTerms.size;
        const precision = overlap / sentenceTerms.length;
        const score = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);
        if (overlap > 0 && (!best || score > best.score)) {
          best = { sentence: sentence.trim(), score };
        }
      }

      if (best && best.score >= 0.25) {
        selected.push({ index: item.index, sentence: best.sentence, score: best.score });
      }
    }

    if (selected.length === 0) {
      return { answer: "NOT_FOUND", usedEvidenceIndexes: [] };
    }

    selected.sort((left, right) => right.score - left.score || left.index - right.index);
    const used = selected.slice(0, 2);

    return {
      answer: used.map((entry) => entry.sentence).join(" "),
      usedEvidenceIndexes: used.map((entry) => entry.index),
    };
  }
}
