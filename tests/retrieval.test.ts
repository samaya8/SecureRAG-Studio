import { describe, expect, it } from "vitest";

import { rankChunks, scoreRetrievalQuality, tokenize } from "@/lib/securerag/retrieval";
import { fixtureChunks } from "./fixtures";

describe("retrieval ranking", () => {
  it("ranks the attendance chunk first for an attendance question", () => {
    const ranked = rankChunks("What is the minimum attendance requirement?", fixtureChunks);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].sourceId).toBe("DOC-001");
  });

  it("ranks the examination chunk first for an examination question", () => {
    const ranked = rankChunks("When may a student repeat an examination?", fixtureChunks);
    expect(ranked[0].sourceId).toBe("DOC-002");
  });

  it("returns nothing for a question with no lexical overlap", () => {
    const ranked = rankChunks("What will the weather be tomorrow?", fixtureChunks);
    expect(ranked).toHaveLength(0);
  });

  it("produces normalised scores between 0 and 1", () => {
    const ranked = rankChunks("attendance sessions", fixtureChunks);
    for (const chunk of ranked) {
      expect(chunk.score).toBeGreaterThan(0);
      expect(chunk.score).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic: the same input always produces the same ranking", () => {
    const first = rankChunks("attendance requirement", fixtureChunks);
    const second = rankChunks("attendance requirement", fixtureChunks);
    expect(second).toEqual(first);
  });

  it("respects the topK limit", () => {
    const ranked = rankChunks("students examination attendance library", fixtureChunks, {
      topK: 1,
    });
    expect(ranked).toHaveLength(1);
  });

  it("removes stop words when tokenizing", () => {
    expect(tokenize("What is the attendance rule?")).toEqual(["attendance", "rule"]);
  });
});

describe("retrieval quality scoring", () => {
  it("returns 0 when there is no evidence", () => {
    expect(scoreRetrievalQuality("anything", [], 0.35)).toBe(0);
  });

  it("returns a score within 0-100 for real evidence", () => {
    const ranked = rankChunks("What is the minimum attendance requirement?", fixtureChunks);
    const score = scoreRetrievalQuality(
      "What is the minimum attendance requirement?",
      ranked,
      0.35,
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("is deterministic", () => {
    const ranked = rankChunks("attendance", fixtureChunks);
    expect(scoreRetrievalQuality("attendance", ranked, 0.35)).toBe(
      scoreRetrievalQuality("attendance", ranked, 0.35),
    );
  });
});
