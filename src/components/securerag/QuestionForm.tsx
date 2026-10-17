"use client";

import type { FormEvent } from "react";

import type { CorpusSummary } from "@/lib/securerag/schema";
import { QUESTION_MAX_LENGTH, QUESTION_MIN_LENGTH } from "@/lib/securerag/schema";

/**
 * Question form with corpus selection and client-side validation.
 * Owner: Mohab Ahmed (Product UI & Security)
 *
 * Client-side validation is a convenience only. The backend re-validates
 * everything; this component never decides what is safe.
 */

export interface QuestionFormProps {
  question: string;
  corpusId: string;
  corpora: CorpusSummary[];
  loading: boolean;
  validationMessage: string | null;
  onQuestionChange: (question: string) => void;
  onCorpusChange: (corpusId: string) => void;
  onSubmit: () => void;
}

export default function QuestionForm({
  question,
  corpusId,
  corpora,
  loading,
  validationMessage,
  onQuestionChange,
  onCorpusChange,
  onSubmit,
}: QuestionFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <h2>Ask a question</h2>

      <div className="field">
        <label htmlFor="corpusId">Approved corpus</label>
        <select
          id="corpusId"
          name="corpusId"
          value={corpusId}
          onChange={(event) => onCorpusChange(event.target.value)}
          disabled={loading || corpora.length === 0}
        >
          {corpora.length === 0 ? <option value="">No corpus available</option> : null}
          {corpora.map((corpus) => (
            <option key={corpus.corpusId} value={corpus.corpusId}>
              {corpus.title} ({corpus.approvedDocumentCount} approved)
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="question">Your question</label>
        <textarea
          id="question"
          name="question"
          rows={4}
          value={question}
          maxLength={QUESTION_MAX_LENGTH}
          placeholder="For example: What is the minimum attendance requirement?"
          onChange={(event) => onQuestionChange(event.target.value)}
          disabled={loading}
          aria-describedby="question-hint"
          aria-invalid={validationMessage ? "true" : "false"}
        />
        <div className="field-hint" id="question-hint">
          <span>
            {QUESTION_MIN_LENGTH}-{QUESTION_MAX_LENGTH} characters. Answers come only from
            approved documents.
          </span>
          <span>
            {question.trim().length}/{QUESTION_MAX_LENGTH}
          </span>
        </div>
      </div>

      {validationMessage ? (
        <div className="alert danger" role="alert">
          <p>{validationMessage}</p>
        </div>
      ) : null}

      <div className="form-actions">
        <button type="submit" disabled={loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : null}
          {loading ? "Searching approved documents..." : "Ask SecureRAG"}
        </button>
        <span className="muted">No evidence means no answer.</span>
      </div>
    </form>
  );
}
