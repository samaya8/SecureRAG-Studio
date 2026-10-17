import { NextResponse } from "next/server";

import {
  listCorpora,
  registerCorpus,
  summariseCorpus,
} from "@/lib/securerag/corpus";
import { toErrorResponse, ValidationError } from "@/lib/securerag/errors";
import { createRequestId, logger } from "@/lib/securerag/logger";
import type { DocumentsResponse, LoadDocumentsResponse } from "@/lib/securerag/schema";
import { validateLoadDocumentsRequest } from "@/lib/securerag/schema";

/**
 * GET  /api/securerag/documents  - list approved corpora and documents.
 * POST /api/securerag/documents  - register (load and index) one corpus.
 *
 * Owner: Somaya Osama (Backend & Retrieval) with Yara Samir (curation).
 *
 * Only approved documents are ever exposed or indexed. Approval itself is a
 * governance action performed in the corpus register and re-generated with
 * `npm run corpus:build`; neither this route nor the AI model can change a
 * document's approval status (docs/security-boundaries.md section 4).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

export async function GET(): Promise<NextResponse> {
  const requestId = createRequestId();

  try {
    const corpora = await listCorpora();
    const body: DocumentsResponse = {
      corpora: corpora.map(summariseCorpus),
      requestId,
    };
    return NextResponse.json(body, {
      status: 200,
      headers: { "x-request-id": requestId },
    });
  } catch (error) {
    const { body, statusCode } = toErrorResponse(error, requestId);
    logger.error("Document listing failed", {
      requestId,
      route: "/api/securerag/documents",
      code: body.errorCode,
      statusCode,
    });
    return NextResponse.json(body, { status: statusCode });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = createRequestId();
  const startedAt = Date.now();

  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      throw new ValidationError("The request body is too large.", "INVALID_CORPUS");
    }

    let parsedBody: unknown;
    try {
      parsedBody = rawBody.trim().length === 0 ? {} : JSON.parse(rawBody);
    } catch {
      throw new ValidationError("The request body must be valid JSON.", "INVALID_CORPUS");
    }

    const validation = validateLoadDocumentsRequest(parsedBody);
    if (!validation.ok) {
      throw new ValidationError(validation.message, validation.errorCode);
    }

    const { corpus, summary, chunkCount } = await registerCorpus(validation.value.corpusId);

    const body: LoadDocumentsResponse = {
      corpusId: corpus.id,
      title: corpus.title,
      approvedDocumentCount: summary.approvedDocumentCount,
      excludedDocumentCount: summary.excludedDocumentCount,
      chunkCount,
      documents: summary.documents,
      requestId,
    };

    logger.info("Corpus registered", {
      requestId,
      route: "/api/securerag/documents",
      corpusId: corpus.id,
      approvedDocumentCount: summary.approvedDocumentCount,
      chunkCount,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(body, {
      status: 200,
      headers: { "x-request-id": requestId },
    });
  } catch (error) {
    const { body, statusCode } = toErrorResponse(error, requestId);
    logger.error("Corpus registration failed", {
      requestId,
      route: "/api/securerag/documents",
      code: body.errorCode,
      statusCode,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(body, {
      status: statusCode,
      headers: { "x-request-id": requestId },
    });
  }
}
