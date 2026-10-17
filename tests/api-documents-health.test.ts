import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as documentsGet, POST as documentsPost } from "@/app/api/securerag/documents/route";
import { GET as healthGet } from "@/app/api/securerag/health/route";
import { resetCorpusCache } from "@/lib/securerag/corpus";

function post(body: unknown, raw?: string): Request {
  return new Request("http://localhost/api/securerag/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

describe("GET /api/securerag/documents", () => {
  beforeEach(() => {
    resetCorpusCache();
  });

  it("lists every corpus with approved documents only", async () => {
    const response = await documentsGet();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.corpora)).toBe(true);
    expect(body.corpora.length).toBeGreaterThan(0);

    for (const corpus of body.corpora) {
      expect(corpus.approvedDocumentCount).toBe(corpus.documents.length);
      for (const document of corpus.documents) {
        expect(document.approvalStatus).toBe("approved");
      }
    }
  });

  it("never exposes a filesystem path", async () => {
    const text = await (await documentsGet()).text();
    expect(text).not.toContain("corpus/documents/");
    expect(text).not.toContain("/tmp/");
  });

  it("does not expose the title of a rejected document", async () => {
    const body = await (await documentsGet()).json();
    const text = JSON.stringify(body);
    expect(text).not.toContain("Draft Tuition Fee Policy");
  });
});

describe("POST /api/securerag/documents", () => {
  beforeEach(() => {
    resetCorpusCache();
  });

  it("registers a corpus and reports the indexed chunk count", async () => {
    const response = await documentsPost(post({ corpusId: "university-policies" }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.corpusId).toBe("university-policies");
    expect(body.approvedDocumentCount).toBeGreaterThan(0);
    expect(body.excludedDocumentCount).toBeGreaterThan(0);
    expect(body.chunkCount).toBeGreaterThan(0);
    expect(body.requestId).toMatch(/^req_/);
  });

  it("indexes the research corpus built from PDF text", async () => {
    const response = await documentsPost(post({ corpusId: "rag-research" }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.approvedDocumentCount).toBeGreaterThanOrEqual(17);
    expect(body.chunkCount).toBeGreaterThan(100);
  });

  it("rejects an unknown corpus", async () => {
    const response = await documentsPost(post({ corpusId: "not-a-corpus" }));
    expect(response.status).toBe(404);
    expect((await response.json()).errorCode).toBe("INVALID_CORPUS");
  });

  it("rejects a missing corpusId", async () => {
    const response = await documentsPost(post({}));
    expect(response.status).toBe(400);
    expect((await response.json()).errorCode).toBe("INVALID_CORPUS");
  });

  it("rejects a path traversal attempt", async () => {
    const response = await documentsPost(post({ corpusId: "../../etc/passwd" }));
    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const response = await documentsPost(post(undefined, "{ nope"));
    expect(response.status).toBe(400);
  });
});

describe("GET /api/securerag/health", () => {
  beforeEach(() => {
    resetCorpusCache();
    vi.resetModules();
  });

  it("reports healthy with the mock provider and a loadable corpus", async () => {
    const response = await healthGet();
    const body = await response.json();

    expect(body.service).toBe("SecureRAG Studio");
    expect(body.checks.api).toBe("available");
    expect(body.checks.corpusAvailable).toBe(true);
    expect(body.checks.approvedDocumentCount).toBeGreaterThan(0);
    expect(body.status).toBe("healthy");
    expect(response.status).toBe(200);
  });

  it("reports degraded and names the missing variable when the key is absent", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");

    const { GET } = await import("@/app/api/securerag/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.providerConfigured).toBe(false);
    expect(body.issues.join(" ")).toContain("GEMINI_API_KEY");
    vi.unstubAllEnvs();
  });

  it("never returns the API key value", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "super-secret-value-12345");

    const { GET } = await import("@/app/api/securerag/health/route");
    const text = await (await GET()).text();

    expect(text).not.toContain("super-secret-value-12345");
    vi.unstubAllEnvs();
  });
});
