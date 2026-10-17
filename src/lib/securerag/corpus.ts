import { readFile } from "node:fs/promises";
import path from "node:path";

import { chunkDocument } from "./chunking";
import { CorpusError, RetrievalError } from "./errors";
import { logger } from "./logger";
import type {
  ApprovedDocument,
  CorpusDefinition,
  CorpusDocumentEntry,
  CorpusManifest,
  CorpusSummary,
  DocumentChunk,
} from "./schema";
import { APPROVAL_STATUSES, SOURCE_TYPES } from "./schema";

/**
 * Corpus manifest handling and document loading.
 *
 * Owner: Somaya Osama (Backend & Retrieval) with Yara Samir (curation).
 *
 * Security rule enforced here (docs/security-boundaries.md section 4):
 * only documents whose approvalStatus is exactly "approved" are ever read
 * from disk or turned into retrievable chunks. Everything else stays
 * registered for audit purposes and is invisible to retrieval.
 *
 * This module is server-only. The corpus directory lives outside `public/`
 * so that unapproved documents are never served over HTTP.
 */

const CORPUS_DIRECTORY = "corpus";
const MANIFEST_FILE = "corpus-manifest.json";

function projectRoot(): string {
  return process.env.SECURERAG_PROJECT_ROOT ?? process.cwd();
}

function isApprovalStatus(value: unknown): boolean {
  return typeof value === "string" && (APPROVAL_STATUSES as readonly string[]).includes(value);
}

function isSourceType(value: unknown): boolean {
  return typeof value === "string" && (SOURCE_TYPES as readonly string[]).includes(value);
}

/** Rejects any manifest path that tries to escape the corpus directory. */
function resolveCorpusFile(relativePath: string): string {
  const root = path.resolve(projectRoot());
  const corpusRoot = path.join(root, CORPUS_DIRECTORY);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== corpusRoot && !resolved.startsWith(`${corpusRoot}${path.sep}`)) {
    throw new CorpusError("A corpus document path is outside the corpus directory.");
  }
  return resolved;
}

function validateManifest(raw: unknown): CorpusManifest {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as CorpusManifest).corpora)) {
    throw new CorpusError("The corpus manifest is malformed.");
  }

  const manifest = raw as CorpusManifest;

  for (const corpus of manifest.corpora) {
    if (!corpus.id || !Array.isArray(corpus.documents)) {
      throw new CorpusError("The corpus manifest contains an invalid corpus entry.");
    }
    const seenIds = new Set<string>();
    for (const document of corpus.documents) {
      if (!document.id || seenIds.has(document.id)) {
        throw new CorpusError(`Duplicate or missing document id in corpus ${corpus.id}.`);
      }
      seenIds.add(document.id);
      if (!isApprovalStatus(document.approvalStatus)) {
        throw new CorpusError(`Document ${document.id} has an invalid approval status.`);
      }
      if (!isSourceType(document.sourceType)) {
        throw new CorpusError(`Document ${document.id} has an invalid source type.`);
      }
    }
  }

  return manifest;
}

let manifestCache: CorpusManifest | null = null;
const chunkCache = new Map<string, DocumentChunk[]>();

/** Clears in-memory caches. Used by tests and by a document reload. */
export function resetCorpusCache(): void {
  manifestCache = null;
  chunkCache.clear();
}

export async function loadManifest(): Promise<CorpusManifest> {
  if (manifestCache) {
    return manifestCache;
  }

  const manifestPath = path.join(projectRoot(), CORPUS_DIRECTORY, MANIFEST_FILE);
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    throw new CorpusError(
      "The corpus manifest could not be loaded. Run: npm run corpus:build",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CorpusError("The corpus manifest is not valid JSON.");
  }

  manifestCache = validateManifest(parsed);
  return manifestCache;
}

export async function listCorpora(): Promise<CorpusDefinition[]> {
  const manifest = await loadManifest();
  return manifest.corpora;
}

export async function getCorpus(corpusId: string): Promise<CorpusDefinition> {
  const manifest = await loadManifest();
  const corpus = manifest.corpora.find((entry) => entry.id === corpusId);
  if (!corpus) {
    throw new CorpusError(`The corpus "${corpusId}" does not exist.`, 404);
  }
  return corpus;
}

/** The approved-document filter. Nothing else may decide what is searchable. */
export function approvedDocuments(corpus: CorpusDefinition): CorpusDocumentEntry[] {
  return corpus.documents.filter((document) => document.approvalStatus === "approved");
}

function toPublicDocument(document: CorpusDocumentEntry): ApprovedDocument {
  const publicDocument: ApprovedDocument = {
    id: document.id,
    title: document.title,
    version: document.version,
    category: document.category,
    approvalStatus: document.approvalStatus,
    uploadedAt: document.uploadedAt,
    sourceType: document.sourceType,
  };
  if (document.approvedBy) {
    publicDocument.approvedBy = document.approvedBy;
  }
  return publicDocument;
}

export function summariseCorpus(corpus: CorpusDefinition): CorpusSummary {
  const approved = approvedDocuments(corpus);
  return {
    corpusId: corpus.id,
    title: corpus.title,
    description: corpus.description,
    approvedDocumentCount: approved.length,
    excludedDocumentCount: corpus.documents.length - approved.length,
    // Only approved documents are exposed: the UI must never reveal the
    // titles of rejected or pending material.
    documents: approved.map(toPublicDocument),
  };
}

/**
 * Loads and chunks every approved document of a corpus.
 * Results are cached per corpus for the lifetime of the server process.
 */
export async function loadCorpusChunks(corpusId: string): Promise<DocumentChunk[]> {
  const cached = chunkCache.get(corpusId);
  if (cached) {
    return cached;
  }

  const corpus = await getCorpus(corpusId);
  const documents = approvedDocuments(corpus);

  if (documents.length === 0) {
    throw new CorpusError(`The corpus "${corpusId}" has no approved documents.`);
  }

  const chunks: DocumentChunk[] = [];
  const failed: string[] = [];

  for (const document of documents) {
    try {
      const absolutePath = resolveCorpusFile(document.file);
      const text = await readFile(absolutePath, "utf8");
      chunks.push(...chunkDocument(document, corpus.id, text));
    } catch {
      // Never surface the filesystem path or the raw error to the caller.
      failed.push(document.id);
    }
  }

  if (failed.length > 0) {
    logger.warn("Some approved documents could not be loaded", {
      corpusId,
      failedDocumentCount: failed.length,
      failedDocumentIds: failed.join(","),
    });
  }

  if (chunks.length === 0) {
    throw new RetrievalError("No approved document content could be loaded.");
  }

  chunkCache.set(corpusId, chunks);
  return chunks;
}

/** Loads (or reloads) a corpus and reports what became searchable. */
export async function registerCorpus(corpusId: string): Promise<{
  corpus: CorpusDefinition;
  summary: CorpusSummary;
  chunkCount: number;
}> {
  chunkCache.delete(corpusId);
  const corpus = await getCorpus(corpusId);
  const chunks = await loadCorpusChunks(corpusId);
  return { corpus, summary: summariseCorpus(corpus), chunkCount: chunks.length };
}
