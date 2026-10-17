"use client";

import type { CorpusSummary } from "@/lib/securerag/schema";

/**
 * Approved-corpus panel: what the system is allowed to search.
 * Owner: Mohab Ahmed (Product UI & Security)
 */

export interface CorpusPanelProps {
  corpus: CorpusSummary | null;
  loading: boolean;
  onReload: () => void;
  reloading: boolean;
  reloadMessage: string | null;
}

export default function CorpusPanel({
  corpus,
  loading,
  onReload,
  reloading,
  reloadMessage,
}: CorpusPanelProps) {
  if (loading) {
    return (
      <section className="card" aria-live="polite">
        <h2>Approved corpus</h2>
        <p className="muted">
          <span className="spinner" aria-hidden="true" />
          Loading the approved corpus...
        </p>
      </section>
    );
  }

  if (!corpus) {
    return (
      <section className="card">
        <h2>Approved corpus</h2>
        <p className="muted">No corpus information is available.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Approved corpus</h2>
      <p className="muted">{corpus.description}</p>

      <div className="metric-grid" style={{ marginTop: 12 }}>
        <div className="metric">
          <span className="metric-label">Approved</span>
          <span className="metric-value">{corpus.approvedDocumentCount}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Excluded</span>
          <span className="metric-value">{corpus.excludedDocumentCount}</span>
        </div>
      </div>

      <h3>Searchable documents</h3>
      <ul className="document-list">
        {corpus.documents.map((document) => (
          <li key={document.id}>
            <span>
              <strong>{document.id}</strong> {document.title}
            </span>
            <span className="badge success">v{document.version}</span>
          </li>
        ))}
      </ul>

      <div className="form-actions" style={{ marginTop: 16 }}>
        <button type="button" className="secondary" onClick={onReload} disabled={reloading}>
          {reloading ? <span className="spinner" aria-hidden="true" /> : null}
          {reloading ? "Loading documents..." : "Reload documents"}
        </button>
      </div>
      {reloadMessage ? <p className="muted">{reloadMessage}</p> : null}
    </section>
  );
}
