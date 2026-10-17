import { describe, expect, it } from "vitest";

import {
  buildCitations,
  citationCoverage,
  selectEvidenceSnippet,
  verifyCitations,
} from "@/lib/securerag/citations";
import { asRetrieved, fixtureChunks } from "./fixtures";

const retrieved = [
  asRetrieved(fixtureChunks[0], 1),
  asRetrieved(fixtureChunks[1], 0.6),
];

describe("citation generation", () => {
  it("builds a citation for each used evidence index", () => {
    const citations = buildCitations("attendance requirement", retrieved, [1]);
    expect(citations).toHaveLength(1);
    expect(citations[0].sourceId).toBe("DOC-001");
    expect(citations[0].chunkId).toBe("DOC-001-chunk-1");
    expect(citations[0].page).toBe(1);
    expect(citations[0].relevanceScore).toBe(1);
  });

  it("ignores out-of-range, duplicate and non-integer indexes", () => {
    const citations = buildCitations("attendance", retrieved, [1, 1, 0, 9, 1.5, -2]);
    expect(citations).toHaveLength(1);
  });

  it("produces no citation when the model used no evidence", () => {
    expect(buildCitations("attendance", retrieved, [])).toHaveLength(0);
  });

  it("takes the snippet verbatim from the chunk", () => {
    const citations = buildCitations("attendance requirement", retrieved, [1]);
    expect(fixtureChunks[0].text).toContain(citations[0].evidenceSnippet);
  });

  it("keeps a long snippet within the display limit", () => {
    const longText = `${"Sentence about attendance rules. ".repeat(60)}`;
    const snippet = selectEvidenceSnippet("attendance", longText);
    expect(snippet.length).toBeLessThanOrEqual(400);
  });
});

describe("citation verification", () => {
  it("accepts citations that match retrieved evidence", () => {
    const citations = buildCitations("attendance", retrieved, [1, 2]);
    const { valid, invalid } = verifyCitations(citations, retrieved);
    expect(valid).toHaveLength(2);
    expect(invalid).toHaveLength(0);
  });

  it("rejects a citation whose chunk was never retrieved", () => {
    const { valid, invalid } = verifyCitations(
      [
        {
          sourceId: "DOC-999",
          sourceTitle: "Fabricated Source",
          evidenceSnippet: "The fee is 12,500 EGP.",
          chunkId: "DOC-999-chunk-1",
          relevanceScore: 0.9,
        },
      ],
      retrieved,
    );
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it("rejects a citation whose snippet is not present in its chunk", () => {
    const citations = buildCitations("attendance", retrieved, [1]);
    citations[0].evidenceSnippet = "Students must attend at least 10% of sessions.";
    const { valid, invalid } = verifyCitations(citations, retrieved);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it("rejects a citation whose sourceId was tampered with", () => {
    const citations = buildCitations("attendance", retrieved, [1]);
    citations[0].sourceId = "DOC-002";
    const { valid } = verifyCitations(citations, retrieved);
    expect(valid).toHaveLength(0);
  });
});

describe("citation coverage", () => {
  it("is 0 without citations", () => {
    expect(citationCoverage("Students must attend 75% of sessions.", [])).toBe(0);
  });

  it("is 0 for an empty answer", () => {
    const citations = buildCitations("attendance", retrieved, [1]);
    expect(citationCoverage("", citations)).toBe(0);
  });

  it("is high when the answer is taken from the evidence", () => {
    const citations = buildCitations("attendance requirement", retrieved, [1]);
    const coverage = citationCoverage(
      "Students must attend at least 75% of scheduled sessions.",
      citations,
    );
    expect(coverage).toBeGreaterThanOrEqual(90);
  });

  it("is low when the answer introduces unsupported terms", () => {
    const citations = buildCitations("attendance requirement", retrieved, [1]);
    const coverage = citationCoverage(
      "Tuition costs twelve thousand pounds and parking permits expire annually.",
      citations,
    );
    expect(coverage).toBeLessThan(30);
  });

  it("always stays within 0-100", () => {
    const citations = buildCitations("attendance", retrieved, [1, 2]);
    const coverage = citationCoverage("Students attendance examination sessions.", citations);
    expect(coverage).toBeGreaterThanOrEqual(0);
    expect(coverage).toBeLessThanOrEqual(100);
  });
});
