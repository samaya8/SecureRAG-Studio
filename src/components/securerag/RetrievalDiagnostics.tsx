"use client";

import type { QueryResponse } from "@/lib/securerag/schema";

/**
 * Deterministic diagnostics panel: retrieval quality and citation coverage.
 * Owner: Mohab Ahmed (Product UI) with Yara Samir (metric definitions)
 */

export interface RetrievalDiagnosticsProps {
  result: QueryResponse | null;
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      <div className="meter" role="presentation">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export default function RetrievalDiagnostics({ result }: RetrievalDiagnosticsProps) {
  if (!result) {
    return (
      <section className="card">
        <h2>Diagnostics</h2>
        <p className="muted">
          Retrieval quality and citation coverage appear here after a question is asked.
        </p>
      </section>
    );
  }

  return (
    <section className="card" data-testid="diagnostics">
      <h2>Diagnostics</h2>
      <div className="metric-grid">
        <Meter label="Retrieval quality" value={result.retrievalQualityScore} />
        <Meter label="Citation coverage" value={result.citationCoverage} />
      </div>

      <div className="metric-grid" style={{ marginTop: 12 }}>
        <div className="metric">
          <span className="metric-label">Citations</span>
          <span className="metric-value">{result.citations.length}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Confidence</span>
          <span className="metric-value" style={{ fontSize: "1rem" }}>
            {result.confidence}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Safety flag</span>
          <span className="metric-value" style={{ fontSize: "1rem" }}>
            {result.safetyFlag ? "raised" : "clear"}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">State</span>
          <span className="metric-value" style={{ fontSize: "1rem" }}>
            {result.notFound ? "not found" : "supported"}
          </span>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 12 }}>
        Scores are calculated deterministically in application code, not by the AI model.
        Confidence is an indicator, not a guarantee.
      </p>
    </section>
  );
}
