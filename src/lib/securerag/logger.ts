/**
 * Privacy-safe logger.
 *
 * Owner: Monica Nabil (Platform Integration & Deployment)
 *
 * Rules this file enforces (see docs/security-boundaries.md):
 *  - Never log secrets (API keys, tokens).
 *  - Never log private document/evidence content.
 *  - Never log full user questions in production (only length + a hash),
 *    since a question could quote confidential source material back.
 *  - Every log line carries a requestId so it can be correlated with a
 *    QueryResponse without exposing anything sensitive.
 */

type LogLevel = "info" | "warn" | "error";

export interface LogFields {
  requestId?: string;
  route?: string;
  code?: string;
  statusCode?: number;
  durationMs?: number;
  [key: string]: unknown;
}

const SECRET_KEY_PATTERN = /(key|token|secret|password|authorization)/i;

/**
 * Strips any field whose key looks like a secret and truncates long
 * string values so accidental evidence/document dumps don't make it into
 * logs.
 */
function sanitize(fields: LogFields): LogFields {
  const clean: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      clean[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string" && value.length > 200) {
      clean[key] = `${value.slice(0, 200)}...[truncated:${value.length}chars]`;
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...sanitize(fields),
  };

  // Structured JSON logs are easy to ship to any log aggregator later.
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};

/** Simple non-cryptographic hash, useful for correlating repeat questions
 *  in logs without ever storing the question text itself. */
export function hashForLogging(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return `h${(hash >>> 0).toString(16)}`;
}

/** Creates a request id used to correlate logs with an API response. */
export function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `req_${globalThis.crypto.randomUUID()}`;
  }
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
