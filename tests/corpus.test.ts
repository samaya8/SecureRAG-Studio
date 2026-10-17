import { beforeEach, describe, expect, it } from "vitest";

import {
  approvedDocuments,
  getCorpus,
  listCorpora,
  loadCorpusChunks,
  resetCorpusCache,
  summariseCorpus,
} from "@/lib/securerag/corpus";
import { SecureRAGError } from "@/lib/securerag/errors";

describe("corpus manifest", () => {
  beforeEach(() => {
    resetCorpusCache();
  });

  it("loads the manifest shipped with the repository", async () => {
    const corpora = await listCorpora();
    expect(corpora.length).toBeGreaterThan(0);
    expect(corpora.map((corpus) => corpus.id)).toContain("university-policies");
  });

  it("rejects an unknown corpus id with a safe error", async () => {
    await expect(getCorpus("does-not-exist")).rejects.toBeInstanceOf(SecureRAGError);
    await expect(getCorpus("does-not-exist")).rejects.toMatchObject({
      code: "INVALID_CORPUS",
      statusCode: 404,
    });
  });

  it("only exposes approved documents", async () => {
    const corpus = await getCorpus("university-policies");
    const summary = summariseCorpus(corpus);
    expect(summary.excludedDocumentCount).toBeGreaterThan(0);
    for (const document of summary.documents) {
      expect(document.approvalStatus).toBe("approved");
    }
  });

  it("never chunks an unapproved document", async () => {
    const corpus = await getCorpus("university-policies");
    const rejected = corpus.documents.filter(
      (document) => document.approvalStatus !== "approved",
    );
    expect(rejected.length).toBeGreaterThan(0);

    const chunks = await loadCorpusChunks("university-policies");
    const chunkedSourceIds = new Set(chunks.map((chunk) => chunk.sourceId));
    for (const document of rejected) {
      expect(chunkedSourceIds.has(document.id)).toBe(false);
    }
  });

  it("does not leak rejected document content into retrievable chunks", async () => {
    const chunks = await loadCorpusChunks("university-policies");
    const allText = chunks.map((chunk) => chunk.text).join(" ");
    // The rejected draft fee policy is the only document containing this figure.
    expect(allText).not.toContain("12,500 EGP");
  });

  it("produces chunks with complete citation metadata", async () => {
    const chunks = await loadCorpusChunks("university-policies");
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.chunkId).toMatch(/-chunk-\d+$/);
      expect(chunk.sourceId).toBeTruthy();
      expect(chunk.sourceTitle).toBeTruthy();
      expect(chunk.corpusId).toBe("university-policies");
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("counts every approved document across the whole manifest", async () => {
    const corpora = await listCorpora();
    const total = corpora.reduce(
      (sum, corpus) => sum + approvedDocuments(corpus).length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(20);
  });
});
