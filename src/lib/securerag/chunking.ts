import type { CorpusDocumentEntry, DocumentChunk } from "./schema";

/**
 * Document chunking.
 *
 * Owner: Somaya Osama (Backend & Retrieval)
 *
 * Chunks are built from paragraph boundaries and then packed up to a target
 * size with a small overlap, so a sentence that answers a question is rarely
 * split across two chunks. Page markers written by the corpus extractor
 * (`[[page:N]]`) are consumed here and stored on the chunk so citations can
 * report a page number.
 */

export interface ChunkOptions {
  /** Target chunk size in characters. */
  targetSize?: number;
  /** Characters of trailing context repeated at the start of the next chunk. */
  overlap?: number;
}

export const DEFAULT_CHUNK_OPTIONS: Required<ChunkOptions> = {
  targetSize: 900,
  overlap: 120,
};

const PAGE_MARKER = /^\[\[page:(\d+)\]\]$/;

interface Block {
  text: string;
  page?: number;
}

/** Splits raw document text into paragraph blocks, tracking page markers. */
function toBlocks(rawText: string): Block[] {
  const blocks: Block[] = [];
  let currentPage: number | undefined;

  for (const rawParagraph of rawText.split(/\n\s*\n/)) {
    const lines: string[] = [];
    for (const line of rawParagraph.split("\n")) {
      const marker = PAGE_MARKER.exec(line.trim());
      if (marker) {
        currentPage = Number(marker[1]);
        continue;
      }
      lines.push(line);
    }

    // Markdown headings become normal sentences: it keeps the section title
    // in the evidence (useful context) without leaving a "##" fragment that
    // breaks sentence splitting later in the pipeline.
    const text = lines
      .map((line) => line.replace(/^\s{0,3}#{1,6}\s+(.*?)\s*$/, (_match, heading: string) =>
        /[.!?:]$/.test(heading) ? heading : `${heading}.`,
      ))
      .join("\n")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text.length > 0) {
      blocks.push({ text, page: currentPage });
    }
  }

  return blocks;
}

/** Splits an oversized block on sentence boundaries. */
function splitLongBlock(text: string, targetSize: number): string[] {
  if (text.length <= targetSize) {
    return [text];
  }

  const sentences = text.match(/[^.!?\n]+[.!?]*\s*/g) ?? [text];
  const parts: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > targetSize && current.length > 0) {
      parts.push(current.trim());
      current = "";
    }
    if (sentence.length > targetSize) {
      // Hard-wrap pathological input (tables, long URLs) so no chunk is huge.
      for (let index = 0; index < sentence.length; index += targetSize) {
        parts.push(sentence.slice(index, index + targetSize).trim());
      }
      continue;
    }
    current += sentence;
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts.filter((part) => part.length > 0);
}

/**
 * Turns one approved document into retrievable chunks.
 * Never called for unapproved documents -- the corpus layer filters first.
 */
export function chunkDocument(
  document: CorpusDocumentEntry,
  corpusId: string,
  rawText: string,
  options: ChunkOptions = {},
): DocumentChunk[] {
  const { targetSize, overlap } = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const chunks: DocumentChunk[] = [];

  let buffer = "";
  let bufferPage: number | undefined;

  const flush = () => {
    const text = buffer.trim();
    if (text.length === 0) {
      return;
    }
    const chunk: DocumentChunk = {
      chunkId: `${document.id}-chunk-${chunks.length + 1}`,
      sourceId: document.id,
      sourceTitle: document.title,
      sourceVersion: document.version,
      corpusId,
      text,
    };
    if (bufferPage !== undefined) {
      chunk.page = bufferPage;
    }
    chunks.push(chunk);
    buffer = overlap > 0 ? `${text.slice(-overlap)} ` : "";
  };

  for (const block of toBlocks(rawText)) {
    for (const part of splitLongBlock(block.text, targetSize)) {
      if (buffer.trim().length === 0) {
        bufferPage = block.page;
      }
      if (buffer.length + part.length > targetSize && buffer.trim().length > 0) {
        flush();
        bufferPage = block.page;
      }
      buffer += `${part}\n\n`;
    }
  }

  buffer = buffer.trim();
  if (buffer.length > 0) {
    const text = buffer;
    const chunk: DocumentChunk = {
      chunkId: `${document.id}-chunk-${chunks.length + 1}`,
      sourceId: document.id,
      sourceTitle: document.title,
      sourceVersion: document.version,
      corpusId,
      text,
    };
    if (bufferPage !== undefined) {
      chunk.page = bufferPage;
    }
    chunks.push(chunk);
  }

  return chunks;
}
