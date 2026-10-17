import { NextResponse } from "next/server";

import { getConfig, validateConfig } from "@/lib/securerag/config";
import { approvedDocuments, listCorpora } from "@/lib/securerag/corpus";
import { createRequestId } from "@/lib/securerag/logger";
import type { HealthResponse } from "@/lib/securerag/schema";

/**
 * GET /api/securerag/health
 *
 * Owner: Monica Nabil (Platform Integration & Deployment)
 *
 * Reports whether the platform is ready: provider configured, corpus
 * loadable. It reports the *names* of misconfigured variables and never
 * their values, so it is safe to expose in a deployment health check.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const requestId = createRequestId();
  const config = getConfig();
  const configIssues = validateConfig(config);

  let corpusAvailable = false;
  let corpusCount = 0;
  let approvedDocumentCount = 0;
  const issues = configIssues.map((issue) => `${issue.variable}: ${issue.message}`);

  try {
    const corpora = await listCorpora();
    corpusCount = corpora.length;
    approvedDocumentCount = corpora.reduce(
      (total, corpus) => total + approvedDocuments(corpus).length,
      0,
    );
    corpusAvailable = corpusCount > 0 && approvedDocumentCount > 0;
    if (!corpusAvailable) {
      issues.push("corpus: no approved documents are available.");
    }
  } catch {
    issues.push("corpus: the corpus manifest could not be loaded. Run npm run corpus:build.");
  }

  const providerConfigured = config.provider === "mock" || Boolean(config.geminiApiKey);
  const healthy = providerConfigured && corpusAvailable && issues.length === 0;

  const body: HealthResponse = {
    status: healthy ? "healthy" : "degraded",
    service: "SecureRAG Studio",
    environment: config.nodeEnv,
    checks: {
      api: "available",
      providerConfigured,
      provider: config.provider,
      corpusAvailable,
      corpusCount,
      approvedDocumentCount,
    },
    issues,
    timestamp: new Date().toISOString(),
    requestId,
  };

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { "x-request-id": requestId, "cache-control": "no-store" },
  });
}
