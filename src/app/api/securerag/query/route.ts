import { NextResponse } from "next/server";

import { getProvider } from "@/lib/ai/providers";
import { answerQuestion } from "@/lib/securerag/answer-service";
import { getCorpus } from "@/lib/securerag/corpus";
import { toErrorResponse, ValidationError } from "@/lib/securerag/errors";
import { createRequestId, logger } from "@/lib/securerag/logger";
import { validateQueryRequest } from "@/lib/securerag/schema";

/**
 * POST /api/securerag/query
 *
 * Owner: Somaya Osama (Backend & Retrieval) with Monica Nabil (platform).
 *
 * Receives a user question and returns a grounded QueryResponse, or a safe
 * structured error. Every response carries a requestId that also appears in
 * the server logs, so an issue can be traced without exposing any content.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Requests larger than this are rejected before parsing. */
const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = createRequestId();
  const startedAt = Date.now();

  try {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      throw new ValidationError("The request body is too large.");
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      throw new ValidationError("The request body is too large.");
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      throw new ValidationError("The request body must be valid JSON.");
    }

    const validation = validateQueryRequest(parsedBody);
    if (!validation.ok) {
      throw new ValidationError(validation.message, validation.errorCode);
    }

    const { question, corpusId } = validation.value;

    // Corpus validation happens before any provider work so an unknown
    // corpus never reaches the AI layer.
    await getCorpus(corpusId);

    const provider = await getProvider();
    const response = await answerQuestion(provider, { question, corpusId, requestId });

    return NextResponse.json(response, {
      status: 200,
      headers: { "x-request-id": requestId },
    });
  } catch (error) {
    const { body, statusCode } = toErrorResponse(error, requestId);
    logger.error("Query request failed", {
      requestId,
      route: "/api/securerag/query",
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

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      errorCode: "INVALID_QUERY",
      message: "Use POST to submit a question.",
      retryable: false,
      requestId: createRequestId(),
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
