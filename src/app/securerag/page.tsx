import SecureRAGClient from "@/components/securerag/SecureRAGClient";
import { getConfig, validateConfig } from "@/lib/securerag/config";
import { approvedDocuments, listCorpora, summariseCorpus } from "@/lib/securerag/corpus";
import { createRequestId } from "@/lib/securerag/logger";
import type { CorpusSummary, HealthResponse } from "@/lib/securerag/schema";

/**
 * SecureRAG Studio main page (server component).
 * Owner: Mohab Ahmed (Product UI & Security)
 *
 * The corpus list and the platform health snapshot are read on the server so
 * the first paint already shows real data. Everything the user then does
 * (asking a question, reloading documents) goes through the public API
 * routes, which keeps the client/server boundary explicit and keeps every
 * secret on the server.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SecureRAG Studio | Grounded answers from approved documents",
};

async function readCorpora(): Promise<CorpusSummary[]> {
  try {
    const corpora = await listCorpora();
    return corpora.map(summariseCorpus);
  } catch {
    return [];
  }
}

async function readHealth(): Promise<HealthResponse | null> {
  const config = getConfig();
  const issues = validateConfig(config).map((issue) => `${issue.variable}: ${issue.message}`);

  let corpusCount = 0;
  let approvedDocumentCount = 0;
  try {
    const corpora = await listCorpora();
    corpusCount = corpora.length;
    approvedDocumentCount = corpora.reduce(
      (total, corpus) => total + approvedDocuments(corpus).length,
      0,
    );
  } catch {
    issues.push("corpus: the corpus manifest could not be loaded.");
  }

  const corpusAvailable = corpusCount > 0 && approvedDocumentCount > 0;
  const providerConfigured = config.provider === "mock" || Boolean(config.geminiApiKey);
  const healthy = providerConfigured && corpusAvailable && issues.length === 0;

  return {
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
    requestId: createRequestId(),
  };
}

export default async function SecureRAGPage() {
  const [corpora, health] = await Promise.all([readCorpora(), readHealth()]);

  return (
    <main className="page">
      <header className="page-header">
        <h1>SecureRAG Studio</h1>
        <p>
          Answers come only from approved documents. When there is no evidence, the system
          says so instead of inventing an answer.
        </p>
      </header>
      <SecureRAGClient initialCorpora={corpora} initialHealth={health} />
    </main>
  );
}
