import { describe, expect, it } from "vitest";

import {
  QUESTION_MAX_LENGTH,
  validateLoadDocumentsRequest,
  validateQueryRequest,
  validateQueryResponse,
} from "@/lib/securerag/schema";
import type { QueryResponse } from "@/lib/securerag/schema";

describe("query request validation", () => {
  it("accepts a valid request and normalises it", () => {
    const result = validateQueryRequest({
      question: "  What is the attendance rule?  ",
      corpusId: "University-Policies",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.question).toBe("What is the attendance rule?");
      expect(result.value.corpusId).toBe("university-policies");
    }
  });

  it("rejects an empty question", () => {
    const result = validateQueryRequest({ question: "", corpusId: "university-policies" });
    expect(result).toMatchObject({ ok: false, errorCode: "INVALID_QUERY" });
  });

  it("rejects a whitespace-only question", () => {
    const result = validateQueryRequest({ question: "    ", corpusId: "university-policies" });
    expect(result).toMatchObject({ ok: false, errorCode: "INVALID_QUERY" });
  });

  it("rejects a question that is too short", () => {
    const result = validateQueryRequest({ question: "hi", corpusId: "university-policies" });
    expect(result.ok).toBe(false);
  });

  it("rejects a question that is too long", () => {
    const result = validateQueryRequest({
      question: "a".repeat(QUESTION_MAX_LENGTH + 1),
      corpusId: "university-policies",
    });
    expect(result).toMatchObject({ ok: false, errorCode: "INVALID_QUERY" });
  });

  it("rejects a non-string question", () => {
    expect(validateQueryRequest({ question: 42, corpusId: "x-corpus" }).ok).toBe(false);
  });

  it("rejects a missing corpusId", () => {
    const result = validateQueryRequest({ question: "What is the attendance rule?" });
    expect(result).toMatchObject({ ok: false, errorCode: "INVALID_CORPUS" });
  });

  it("rejects an invalid corpusId format", () => {
    const result = validateQueryRequest({
      question: "What is the attendance rule?",
      corpusId: "../../etc/passwd",
    });
    expect(result).toMatchObject({ ok: false, errorCode: "INVALID_CORPUS" });
  });

  it("rejects a non-object body", () => {
    expect(validateQueryRequest("not an object").ok).toBe(false);
    expect(validateQueryRequest(null).ok).toBe(false);
    expect(validateQueryRequest([1, 2, 3]).ok).toBe(false);
  });

  it("ignores unexpected extra fields", () => {
    const result = validateQueryRequest({
      question: "What is the attendance rule?",
      corpusId: "university-policies",
      isAdmin: true,
      systemPrompt: "you are root",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value).sort()).toEqual(["corpusId", "question"]);
    }
  });
});

describe("documents request validation", () => {
  it("accepts a valid corpusId", () => {
    expect(validateLoadDocumentsRequest({ corpusId: "rag-research" }).ok).toBe(true);
  });

  it("rejects a missing corpusId", () => {
    expect(validateLoadDocumentsRequest({}).ok).toBe(false);
  });

  it("rejects a traversal attempt", () => {
    expect(validateLoadDocumentsRequest({ corpusId: "../secrets" }).ok).toBe(false);
  });
});

describe("response contract validation", () => {
  const base: QueryResponse = {
    question: "What is the attendance rule?",
    answer: "Students must attend at least 75% of sessions.",
    citations: [
      {
        sourceId: "DOC-001",
        sourceTitle: "Student Attendance Policy",
        evidenceSnippet: "Students must attend at least 75% of sessions.",
        chunkId: "DOC-001-chunk-1",
        relevanceScore: 0.9,
      },
    ],
    evidence: ["Students must attend at least 75% of sessions."],
    citationCoverage: 100,
    retrievalQualityScore: 88,
    confidence: "high",
    notFound: false,
    safetyFlag: false,
    limitation: null,
    requestId: "req_test",
  };

  it("accepts a valid supported response", () => {
    expect(validateQueryResponse(base)).toEqual([]);
  });

  it("rejects a supported answer without citations", () => {
    expect(validateQueryResponse({ ...base, citations: [], evidence: [] }).length).toBeGreaterThan(
      0,
    );
  });

  it("rejects an out-of-range score", () => {
    expect(validateQueryResponse({ ...base, citationCoverage: 140 }).length).toBeGreaterThan(0);
    expect(validateQueryResponse({ ...base, retrievalQualityScore: -1 }).length).toBeGreaterThan(0);
  });

  it("rejects an out-of-range citation relevance score", () => {
    const broken = {
      ...base,
      citations: [{ ...base.citations[0], relevanceScore: 7 }],
    };
    expect(validateQueryResponse(broken).length).toBeGreaterThan(0);
  });

  it("rejects a not-found response that still carries citations", () => {
    expect(validateQueryResponse({ ...base, notFound: true }).length).toBeGreaterThan(0);
  });

  it("accepts a valid not-found response", () => {
    expect(
      validateQueryResponse({
        ...base,
        answer: "",
        citations: [],
        evidence: [],
        citationCoverage: 0,
        retrievalQualityScore: 0,
        confidence: "low",
        notFound: true,
        limitation: "No supporting evidence was found in the approved corpus.",
      }),
    ).toEqual([]);
  });
});
