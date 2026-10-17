"use client";

import { useEffect, useRef, useState } from "react";

import AnswerEvidence from "./AnswerEvidence";
import CorpusPanel from "./CorpusPanel";
import QuestionForm from "./QuestionForm";
import RetrievalDiagnostics from "./RetrievalDiagnostics";

import type {
  CorpusSummary,
  DocumentsResponse,
  ErrorResponse,
  HealthResponse,
  LoadDocumentsResponse,
  QueryResponse,
} from "@/lib/securerag/schema";

import {
  QUESTION_MAX_LENGTH,
  QUESTION_MIN_LENGTH,
} from "@/lib/securerag/schema";

type RequestState = "idle" | "loading" | "success" | "error";

export interface SecureRAGClientProps {
  initialCorpora: CorpusSummary[];
  initialHealth: HealthResponse | null;
  apiBasePath?: string;
}

interface ErrorState {
  message: string;
  code: string;
  retryable: boolean;
  requestId?: string;
}

function isErrorResponse(body: unknown): body is ErrorResponse {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as ErrorResponse).errorCode === "string" &&
    typeof (body as ErrorResponse).message === "string"
  );
}

export default function SecureRAGClient({
  initialCorpora,
  initialHealth,
  apiBasePath = "/api/securerag",
}: SecureRAGClientProps) {
  const [corpora, setCorpora] =
    useState<CorpusSummary[]>(initialCorpora);

  const [corpusId, setCorpusId] = useState(
    initialCorpora[0]?.corpusId ?? "",
  );

  const [reloading, setReloading] = useState(false);
  const [reloadMessage, setReloadMessage] =
    useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [validationMessage, setValidationMessage] =
    useState<string | null>(null);

  const [queryState, setQueryState] =
    useState<RequestState>("idle");

  const [result, setResult] =
    useState<QueryResponse | null>(null);

  const [error, setError] =
    useState<ErrorState | null>(null);

  const health = initialHealth;

  const responseRegionRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (
      queryState !== "success" &&
      queryState !== "error"
    ) {
      return;
    }

    const responseRegion =
      responseRegionRef.current;

    if (
      typeof responseRegion?.scrollIntoView !==
      "function"
    ) {
      return;
    }

    responseRegion.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [queryState, result, error]);

  async function refreshCorpora() {
    try {
      const response = await fetch(
        `${apiBasePath}/documents`,
        {
          cache: "no-store",
        },
      );

      const body: unknown =
        await response.json();

      if (
        !response.ok ||
        isErrorResponse(body)
      ) {
        return;
      }

      setCorpora(
        (body as DocumentsResponse).corpora,
      );
    } catch {
      // Keep the existing corpus list.
    }
  }

  async function reloadDocuments() {
    if (!corpusId) {
      return;
    }

    setReloading(true);
    setReloadMessage(null);

    try {
      const response = await fetch(
        `${apiBasePath}/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            corpusId,
          }),
        },
      );

      const responseText =
        await response.text();

      let body: unknown;

      try {
        body = JSON.parse(responseText);
      } catch {
        setReloadMessage(
          "The server returned an invalid response.",
        );
        return;
      }

      if (
        !response.ok ||
        isErrorResponse(body)
      ) {
        setReloadMessage(
          isErrorResponse(body)
            ? body.message
            : "The documents could not be loaded.",
        );
        return;
      }

      const loaded =
        body as LoadDocumentsResponse;

      setReloadMessage(
        `Indexed ${loaded.approvedDocumentCount} approved documents into ${loaded.chunkCount} searchable chunks.`,
      );

      await refreshCorpora();
    } catch {
      setReloadMessage(
        "The documents could not be loaded.",
      );
    } finally {
      setReloading(false);
    }
  }

  async function submitQuestion() {
    const trimmed = question.trim();

    if (trimmed.length === 0) {
      setValidationMessage(
        "Please enter a question before submitting.",
      );
      return;
    }

    if (trimmed.length < QUESTION_MIN_LENGTH) {
      setValidationMessage(
        `The question must contain at least ${QUESTION_MIN_LENGTH} characters.`,
      );
      return;
    }

    if (trimmed.length > QUESTION_MAX_LENGTH) {
      setValidationMessage(
        `The question must not exceed ${QUESTION_MAX_LENGTH} characters.`,
      );
      return;
    }

    if (!corpusId) {
      setValidationMessage(
        "Please select an approved corpus.",
      );
      return;
    }

    setValidationMessage(null);
    setError(null);
    setResult(null);
    setQueryState("loading");

    if (
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }

    try {
      const response = await fetch(
        `${apiBasePath}/query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            question: trimmed,
            corpusId,
          }),
        },
      );

      console.log(
        "SecureRAG response status:",
        response.status,
      );

      console.log(
        "SecureRAG response ok:",
        response.ok,
      );

      /*
       * Read the response as text first.
       *
       * This is more useful for debugging than calling
       * response.json() directly because we can see exactly
       * what the browser received.
       */
      const responseText =
        await response.text();

      console.log(
        "SecureRAG raw response:",
        responseText,
      );

      let body: unknown;

      try {
        body = JSON.parse(responseText);
      } catch (parseError) {
        console.error(
          "SecureRAG returned invalid JSON:",
          parseError,
        );

        setQueryState("error");

        setError({
          message:
            "The SecureRAG API returned an invalid response.",
          code: "INVALID_RESPONSE",
          retryable: true,
        });

        return;
      }

      console.log(
        "SecureRAG parsed response:",
        body,
      );

      if (!response.ok) {
        setQueryState("error");

        setError({
          message: isErrorResponse(body)
            ? body.message
            : "The request could not be completed. Please try again.",

          code: isErrorResponse(body)
            ? body.errorCode
            : "INTERNAL_ERROR",

          retryable: isErrorResponse(body)
            ? body.retryable
            : true,

          ...(isErrorResponse(body)
            ? {
                requestId: body.requestId,
              }
            : {}),
        });

        return;
      }

      /*
       * The API returned a successful response.
       * Store it in React state so AnswerEvidence
       * and RetrievalDiagnostics can render it.
       */
      setResult(body as QueryResponse);
      setQueryState("success");
    } catch (requestError) {
      console.error(
        "SecureRAG request failed:",
        requestError,
      );

      setQueryState("error");

      setError({
        message:
          "The application could not reach the SecureRAG API. Please try again.",
        code: "INTERNAL_ERROR",
        retryable: true,
      });
    }
  }

  const selectedCorpus =
    corpora.find(
      (corpus) =>
        corpus.corpusId === corpusId,
    ) ?? null;

  const loading =
    queryState === "loading";

  return (
    <div className="secure-rag-layout">
      <main>
        {health &&
        health.status !== "healthy" ? (
          <div className="alert warning">
            <h2>Platform degraded</h2>

            <p>
              {health.checks.providerConfigured
                ? "Some platform checks are failing."
                : "The AI provider is not configured. Questions will fail safely until the server environment is completed."}
            </p>
          </div>
        ) : null}

        <QuestionForm
          question={question}
          corpusId={corpusId}
          corpora={corpora}
          loading={loading}
          validationMessage={validationMessage}
          onQuestionChange={setQuestion}
          onCorpusChange={setCorpusId}
          onSubmit={() =>
            void submitQuestion()
          }
        />

        <div ref={responseRegionRef}>
          {error ? (
            <div
              className="alert danger"
              role="alert"
              data-testid="error-banner"
            >
              <h2>
                {error.code ===
                  "MODEL_FAILED" ||
                error.code ===
                  "INVALID_MODEL_OUTPUT"
                  ? "AI provider error"
                  : error.code ===
                      "CONFIGURATION_ERROR"
                    ? "Configuration problem"
                    : "Something went wrong"}
              </h2>

              <p>{error.message}</p>

              {error.requestId ? (
                <p className="muted">
                  Request ID:{" "}
                  {error.requestId}
                </p>
              ) : null}
            </div>
          ) : null}

          <AnswerEvidence
            result={result}
            loading={loading}
          />
        </div>
      </main>

      <aside>
        <CorpusPanel
          corpus={selectedCorpus}
          loading={false}
          onReload={() =>
            void reloadDocuments()
          }
          reloading={reloading}
          reloadMessage={reloadMessage}
        />

        <RetrievalDiagnostics
          result={result}
        />
      </aside>
    </div>
  );
}