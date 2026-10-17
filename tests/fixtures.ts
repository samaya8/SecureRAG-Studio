import type { DocumentChunk, RetrievedChunk } from "@/lib/securerag/schema";

/** Small in-memory corpus used by retrieval and citation unit tests. */
export const fixtureChunks: DocumentChunk[] = [
  {
    chunkId: "DOC-001-chunk-1",
    sourceId: "DOC-001",
    sourceTitle: "Student Attendance Policy",
    sourceVersion: "2026.1",
    corpusId: "test-corpus",
    page: 1,
    text: "The minimum attendance requirement is 75%. Students must attend at least 75% of scheduled sessions. Students who exceed the permitted absence limit may be prevented from completing the course assessment.",
  },
  {
    chunkId: "DOC-002-chunk-1",
    sourceId: "DOC-002",
    sourceTitle: "Examination Policy",
    sourceVersion: "2026.1",
    corpusId: "test-corpus",
    page: 1,
    text: "Students may repeat an examination according to the university academic regulations. Examination eligibility may depend on attendance and registration status.",
  },
  {
    chunkId: "DOC-004-chunk-1",
    sourceId: "DOC-004",
    sourceTitle: "Library Opening Hours",
    sourceVersion: "2026.1",
    corpusId: "test-corpus",
    text: "The central library opens at eight in the morning and closes at ten in the evening during term time.",
  },
];

export function asRetrieved(chunk: DocumentChunk, score: number): RetrievedChunk {
  return { ...chunk, score };
}
