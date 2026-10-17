import { getConfig } from "@/lib/securerag/config";
import {
  ConfigurationError,
  InvalidProviderResponseError,
  ProviderError,
  ProviderTimeoutError,
} from "@/lib/securerag/errors";
import { logger } from "@/lib/securerag/logger";
import { buildGroundedPrompt } from "./prompt-builder";
import type {
  AIProvider,
  GenerateAnswerInput,
  GeneratedAnswer,
} from "./providers";

/**
 * Google Gemini implementation of the AIProvider abstraction.
 *
 * Owner: Monica Nabil (Platform Integration & Deployment)
 *
 * Server-only. The API key is read from configuration at call time, sent in
 * a header and never appears in log lines or response bodies.
 */

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
      }>;
    };
    finishReason?: string;
  }>;
}

/**
 * Parses and validates the model's raw output against the expected contract.
 */
export function parseModelOutput(rawText: string): GeneratedAnswer {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new InvalidProviderResponseError(
      "The AI provider response was not valid JSON.",
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new InvalidProviderResponseError(
      "The AI provider response did not match the expected shape.",
    );
  }

  const candidate = parsed as {
    answer?: unknown;
    usedEvidenceIndexes?: unknown;
  };

  if (
    typeof candidate.answer !== "string" ||
    !Array.isArray(candidate.usedEvidenceIndexes)
  ) {
    throw new InvalidProviderResponseError(
      "The AI provider response did not match the expected shape.",
    );
  }

  return {
    answer: candidate.answer,
    usedEvidenceIndexes: candidate.usedEvidenceIndexes.filter(
      (value): value is number =>
        typeof value === "number" && Number.isInteger(value),
    ),
  };
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  async generateAnswer(
    input: GenerateAnswerInput,
  ): Promise<GeneratedAnswer> {
    if (!input.question.trim()) {
      throw new ProviderError(
        "A question is required to generate an answer.",
      );
    }

    if (input.evidence.length === 0) {
      throw new ProviderError(
        "Evidence is required to generate an answer.",
      );
    }

    const config = getConfig();

    if (!config.geminiApiKey) {
      throw new ConfigurationError(
        "The AI provider is not configured. Please contact the administrator.",
      );
    }

    const prompt = buildGroundedPrompt(input);

    const url =
      `${GEMINI_API_BASE}/` +
      `${encodeURIComponent(config.geminiModel)}:generateContent`;

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      config.providerTimeoutMs,
    );

    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.geminiApiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn("Gemini request timed out", {
          model: config.geminiModel,
        });

        throw new ProviderTimeoutError();
      }

      logger.error("Gemini request failed", {
        model: config.geminiModel,
      });

      throw new ProviderError();
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorBody = await response.text();

      logger.error("Gemini returned a non-OK status", {
        statusCode: response.status,
        model: config.geminiModel,
        providerMessage: errorBody,
      });

      throw new ProviderError();
    }

    let data: GeminiGenerateContentResponse;

    try {
      data =
        (await response.json()) as GeminiGenerateContentResponse;
    } catch {
      throw new InvalidProviderResponseError(
        "The AI provider response could not be read.",
      );
    }

    const parts =
      data.candidates?.[0]?.content?.parts ?? [];

    const rawText = parts
      .filter(
        (part) =>
          !part.thought &&
          typeof part.text === "string",
      )
      .map((part) => part.text)
      .join("")
      .trim();

    if (!rawText) {
      logger.error("Gemini returned no usable text", {
        model: config.geminiModel,
        finishReason:
          data.candidates?.[0]?.finishReason,
        partCount: parts.length,
      });

      throw new InvalidProviderResponseError(
        "The AI provider returned no usable content.",
      );
    }

    try {
      return parseModelOutput(rawText);
    } catch (error) {
      logger.error("Gemini output validation failed", {
        model: config.geminiModel,
        finishReason:
          data.candidates?.[0]?.finishReason,
        outputPreview: rawText.slice(0, 500),
      });

      throw error;
    }
  }
}
