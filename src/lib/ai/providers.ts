import { getConfig } from "@/lib/securerag/config";

/**
 * AI provider abstraction.
 *
 * Owner: Monica Nabil (Platform Integration & Deployment)
 *
 * Any AI provider (Gemini today, something else later) implements this
 * interface. Nothing outside src/lib/ai may import a concrete provider
 * directly -- always depend on AIProvider and obtain one from getProvider().
 */

export interface EvidenceItem {
  /** 1-based index shown to the model as [Evidence N]. */
  index: number;
  text: string;
}

export interface GenerateAnswerInput {
  question: string;
  evidence: EvidenceItem[];
}

export interface GeneratedAnswer {
  /** The grounded answer, or the literal string "NOT_FOUND". */
  answer: string;
  /** 1-based indexes into `evidence` that the answer actually used. */
  usedEvidenceIndexes: number[];
}

export interface AIProvider {
  readonly name: string;
  generateAnswer(input: GenerateAnswerInput): Promise<GeneratedAnswer>;
}

/**
 * Returns the provider selected by configuration.
 * The mock provider is opt-in via AI_PROVIDER=mock and exists so the team
 * can run the full flow, the test suite and the evaluation dataset without
 * a real API key. It is never selected by default.
 */
export async function getProvider(): Promise<AIProvider> {
  const { provider } = getConfig();

  if (provider === "mock") {
    const { MockProvider } = await import("./mock-provider");
    return new MockProvider();
  }

  const { GeminiProvider } = await import("./gemini-provider");
  return new GeminiProvider();
}
