"use client";

import type { QueryResponse } from "@/lib/securerag/schema";

/**
 * Answer, citations and evidence display, including the Not Found state.
 * Owner: Mohab Ahmed (Product UI & Security)
 */

export interface AnswerEvidenceProps {
  result: QueryResponse | null;
  loading: boolean;
}

export default function AnswerEvidence({ result, loading }: AnswerEvidenceProps) {
  if (loading) {
    return (
      <section className="card" aria-live="polite" aria-busy="true">
        <h2>Answer</h2>
        <p className="muted" data-testid="answer-loading">
          <span className="spinner" aria-hidden="true" />
          Searching approved documents and checking the evidence...
        </p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="card">
        <h2>Answer</h2>
        <p className="muted" data-testid="answer-empty">
          Ask a question to see a grounded answer with its supporting evidence.
        </p>
      </section>
    );
  }

  if (result.safetyFlag && result.notFound) {
    return (
      <section className="card" aria-live="polite">
        <h2>Request blocked</h2>
        <div className="alert danger" role="alert" data-testid="answer-blocked">
          <p>{result.limitation}</p>
        </div>
        <p className="muted">Request ID: {result.requestId}</p>
      </section>
    );
  }

  if (result.notFound) {
    return (
      <section className="card" aria-live="polite">
        <h2>Not found</h2>
        <div className="alert warning" data-testid="answer-not-found">
          <p>
            {result.limitation ??
              "No supporting evidence was found in the approved corpus."}
          </p>
        </div>
        <p className="muted">
          SecureRAG Studio only answers from approved documents. It will not answer from
          general knowledge.
        </p>
        <p className="muted">Request ID: {result.requestId}</p>
      </section>
    );
  }

  return (
    <section className="card" aria-live="polite">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0 }}>Answer</h2>
        <span className={`badge ${result.confidence}`} data-testid="confidence-badge">
          {result.confidence} confidence
        </span>
      </div>

      <p className="answer-text" data-testid="answer-text">
        {result.answer}
      </p>

      {result.limitation ? (
        <div className="alert warning" data-testid="answer-limitation">
          <p>{result.limitation}</p>
        </div>
      ) : null}

      <h3>Evidence and citations ({result.citations.length})</h3>
      <ul className="evidence-list" data-testid="evidence-list">
        {result.citations.map((citation) => (
          <li className="evidence-item" key={citation.chunkId}>
            <div className="evidence-meta">
              <span className="badge">{citation.sourceId}</span>
              <strong>{citation.sourceTitle}</strong>
              {citation.page !== undefined ? <span>page {citation.page}</span> : null}
              <span>chunk {citation.chunkId}</span>
              <span>relevance {(citation.relevanceScore * 100).toFixed(0)}%</span>
            </div>
            <p className="evidence-snippet">{citation.evidenceSnippet}</p>
          </li>
        ))}
      </ul>

      <p className="muted">Request ID: {result.requestId}</p>
    </section>
  );
}
