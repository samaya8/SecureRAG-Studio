import type { ErrorCode, ErrorResponse } from "./schema";

/**
 * Typed platform errors.
 *
 * Owner: Monica Nabil (Platform Integration & Deployment)
 *
 * API routes catch SecureRAGError and use `.statusCode`, `.code` and
 * `.safeMessage` to build an ErrorResponse. A raw provider, filesystem or
 * network error is never forwarded to the client -- it is wrapped here
 * first so no stack trace, path or credential can leak.
 */

export class SecureRAGError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "SecureRAGError";
  }

  /** The only message that may be shown to a user. */
  get safeMessage(): string {
    return this.message;
  }
}

export class ValidationError extends SecureRAGError {
  constructor(message = "The request was not valid.", code: ErrorCode = "INVALID_QUERY") {
    super(code, message, 400, true);
    this.name = "ValidationError";
  }
}

export class CorpusError extends SecureRAGError {
  constructor(message = "The requested corpus is not available.", statusCode = 400) {
    super("INVALID_CORPUS", message, statusCode, false);
    this.name = "CorpusError";
  }
}

export class UnapprovedDocumentError extends SecureRAGError {
  constructor(message = "The requested document is not approved for retrieval.") {
    super("UNAPPROVED_DOCUMENT", message, 403, false);
    this.name = "UnapprovedDocumentError";
  }
}

export class RetrievalError extends SecureRAGError {
  constructor(message = "The retrieval process could not be completed.") {
    super("RETRIEVAL_FAILED", message, 500, true);
    this.name = "RetrievalError";
  }
}

export class SafetyRejectionError extends SecureRAGError {
  constructor(message = "The request was blocked by the security layer.") {
    super("SAFETY_REJECTION", message, 400, false);
    this.name = "SafetyRejectionError";
  }
}

export class ConfigurationError extends SecureRAGError {
  constructor(message = "The application is not configured correctly.") {
    super("CONFIGURATION_ERROR", message, 503, false);
    this.name = "ConfigurationError";
  }
}

export class ProviderError extends SecureRAGError {
  constructor(message = "The AI provider could not complete the request.") {
    super("MODEL_FAILED", message, 502, true);
    this.name = "ProviderError";
  }
}

export class ProviderTimeoutError extends SecureRAGError {
  constructor(message = "The AI provider request timed out.") {
    super("MODEL_FAILED", message, 504, true);
    this.name = "ProviderTimeoutError";
  }
}

export class InvalidProviderResponseError extends SecureRAGError {
  constructor(message = "The AI provider returned an invalid response.") {
    super("INVALID_MODEL_OUTPUT", message, 502, true);
    this.name = "InvalidProviderResponseError";
  }
}

/**
 * Converts any thrown value into a safe ErrorResponse.
 * Unknown errors collapse to INTERNAL_ERROR with a generic message so that
 * stack traces, file paths and provider details never reach the client.
 */
export function toErrorResponse(
  error: unknown,
  requestId: string,
): { body: ErrorResponse; statusCode: number } {
  if (error instanceof SecureRAGError) {
    return {
      body: {
        errorCode: error.code,
        message: error.safeMessage,
        retryable: error.retryable,
        requestId,
      },
      statusCode: error.statusCode,
    };
  }

  return {
    body: {
      errorCode: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again.",
      retryable: true,
      requestId,
    },
    statusCode: 500,
  };
}
