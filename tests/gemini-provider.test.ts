import { afterEach, describe, expect, it, vi } from "vitest";

import { GeminiProvider, parseModelOutput } from "@/lib/ai/gemini-provider";
import {
  ConfigurationError,
  InvalidProviderResponseError,
  ProviderError,
  ProviderTimeoutError,
} from "@/lib/securerag/errors";

const input = {
  question: "What is the minimum attendance requirement?",
  evidence: [{ index: 1, text: "The minimum attendance requirement is 75%." }],
};

function geminiResponse(text: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("model output parsing", () => {
  it("parses a valid JSON object", () => {
    expect(parseModelOutput('{"answer":"Yes","usedEvidenceIndexes":[1]}')).toEqual({
      answer: "Yes",
      usedEvidenceIndexes: [1],
    });
  });

  it("tolerates markdown code fences", () => {
    expect(
      parseModelOutput('```json\n{"answer":"Yes","usedEvidenceIndexes":[1]}\n```'),
    ).toMatchObject({ answer: "Yes" });
  });

  it("rejects non-JSON output", () => {
    expect(() => parseModelOutput("I think the answer is 75%.")).toThrow(
      InvalidProviderResponseError,
    );
  });

  it("rejects output with a missing field", () => {
    expect(() => parseModelOutput('{"answer":"Yes"}')).toThrow(InvalidProviderResponseError);
  });

  it("rejects a JSON array", () => {
    expect(() => parseModelOutput("[1,2,3]")).toThrow(InvalidProviderResponseError);
  });

  it("drops non-integer evidence indexes", () => {
    expect(
      parseModelOutput('{"answer":"Yes","usedEvidenceIndexes":[1,"2",2.5,null,3]}'),
    ).toEqual({ answer: "Yes", usedEvidenceIndexes: [1, 3] });
  });
});

describe("GeminiProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fails with a configuration error when no API key is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(new GeminiProvider().generateAnswer(input)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });

  it("treats the .env.example placeholder as not configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "replace_with_your_api_key");
    await expect(new GeminiProvider().generateAnswer(input)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });

  it("sends the key in a header and never in the URL", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(geminiResponse('{"answer":"75%","usedEvidenceIndexes":[1]}'));

    await new GeminiProvider().generateAnswer(input);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("test-key-not-real");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key-not-real");
  });

  it("never puts the API key into the prompt", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(geminiResponse('{"answer":"75%","usedEvidenceIndexes":[1]}'));

    await new GeminiProvider().generateAnswer(input);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).not.toContain("test-key-not-real");
  });

  it("does not send unsupported thinking configuration", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(geminiResponse('{"answer":"75%","usedEvidenceIndexes":[1]}'));

    await new GeminiProvider().generateAnswer(input);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
    expect(String(init.body)).not.toContain("thinkingConfig");
  });

  it("maps a network failure onto a safe provider error", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    await expect(new GeminiProvider().generateAnswer(input)).rejects.toBeInstanceOf(ProviderError);
  });

  it("maps an aborted request onto a timeout error", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(new GeminiProvider().generateAnswer(input)).rejects.toBeInstanceOf(
      ProviderTimeoutError,
    );
  });

  it("maps a non-OK status onto a safe provider error", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"error":{"message":"quota exceeded for project 123"}}', { status: 429 }),
    );

    const error = await new GeminiProvider()
      .generateAnswer(input)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).message).not.toContain("project 123");
  });

  it("rejects an empty candidate list", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
    );

    await expect(new GeminiProvider().generateAnswer(input)).rejects.toBeInstanceOf(
      InvalidProviderResponseError,
    );
  });

  it("returns the parsed answer on success", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiResponse('{"answer":"The minimum attendance requirement is 75%.","usedEvidenceIndexes":[1]}'),
    );

    const result = await new GeminiProvider().generateAnswer(input);
    expect(result.answer).toContain("75%");
    expect(result.usedEvidenceIndexes).toEqual([1]);
  });
});
