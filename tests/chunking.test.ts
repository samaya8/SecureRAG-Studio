import { describe, expect, it } from "vitest";

import { chunkDocument, DEFAULT_CHUNK_OPTIONS } from "@/lib/securerag/chunking";
import type { CorpusDocumentEntry } from "@/lib/securerag/schema";

const document: CorpusDocumentEntry = {
  id: "DOC-TEST",
  title: "Test Document",
  version: "1.0",
  category: "Testing",
  approvalStatus: "approved",
  uploadedAt: "2026-07-20T00:00:00.000Z",
  sourceType: "markdown",
  file: "corpus/documents/test.md",
};

describe("document chunking", () => {
  it("produces at least one chunk from short text", () => {
    const chunks = chunkDocument(document, "test-corpus", "A single short paragraph.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkId).toBe("DOC-TEST-chunk-1");
    expect(chunks[0].corpusId).toBe("test-corpus");
  });

  it("splits long text into multiple chunks", () => {
    const paragraph = "Attendance rules apply to every registered student. ".repeat(20);
    const text = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
    const chunks = chunkDocument(document, "test-corpus", text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("keeps chunks close to the target size", () => {
    const text = "Sentence number one about policy. ".repeat(200);
    const chunks = chunkDocument(document, "test-corpus", text);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(DEFAULT_CHUNK_OPTIONS.targetSize * 2);
    }
  });

  it("records page numbers from extractor markers", () => {
    const text = "[[page:1]]\nFirst page content.\n\n[[page:7]]\nSeventh page content.";
    const chunks = chunkDocument(document, "test-corpus", text, { targetSize: 30, overlap: 0 });
    const pages = chunks.map((chunk) => chunk.page);
    expect(pages).toContain(1);
    expect(pages).toContain(7);
  });

  it("never emits a page marker into chunk text", () => {
    const text = "[[page:3]]\nSome content about attendance.";
    const chunks = chunkDocument(document, "test-corpus", text);
    expect(chunks[0].text).not.toContain("[[page:");
  });

  it("returns no chunks for empty input", () => {
    expect(chunkDocument(document, "test-corpus", "   \n\n  ")).toHaveLength(0);
  });

  it("numbers chunks sequentially", () => {
    const text = "Policy sentence about attendance and examinations. ".repeat(120);
    const chunks = chunkDocument(document, "test-corpus", text);
    chunks.forEach((chunk, index) => {
      expect(chunk.chunkId).toBe(`DOC-TEST-chunk-${index + 1}`);
    });
  });
});
