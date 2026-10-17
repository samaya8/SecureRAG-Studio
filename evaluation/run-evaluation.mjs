#!/usr/bin/env node
/**
 * SecureRAG Studio evaluation runner.
 *
 * Owner: Yara Samir (Knowledge Curation & Retrieval Evaluation)
 *
 * Runs every case in securerag-cases.json against a running SecureRAG API
 * and writes a deterministic report. Metrics are computed here in plain
 * code -- no model confidence is used -- so the same corpus and the same
 * cases always produce the same numbers.
 *
 * Usage:
 *   npm run dev                 # in one terminal
 *   npm run eval                # in another terminal
 *
 * Options:
 *   BASE_URL=http://localhost:3000   target application (default)
 *   node evaluation/run-evaluation.mjs --json   machine-readable output only
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");
const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const jsonOnly = process.argv.includes("--json");

const cases = JSON.parse(readFileSync(join(here, "securerag-cases.json"), "utf8"));

/* ----------------------------- metrics ------------------------------ */

function retrievalQualityScore(expected, retrieved) {
  if (expected.length === 0) {
    return retrieved.length === 0 ? 100 : 0;
  }
  const found = expected.filter((id) => retrieved.includes(id)).length;
  return Math.round((found / expected.length) * 100);
}

function retrievalPrecision(expected, retrieved) {
  if (retrieved.length === 0) {
    return expected.length === 0 ? 100 : 0;
  }
  if (expected.length === 0) {
    return 0;
  }
  const hits = retrieved.filter((id) => expected.includes(id)).length;
  return Math.round((hits / retrieved.length) * 100);
}

function citationsAreCorrect(expected, citedIds) {
  if (expected.length === 0) {
    return true;
  }
  return citedIds.length > 0 && citedIds.every((id) => expected.includes(id));
}

/** Maps an API result onto one of the expected states. */
function actualState(status, body) {
  if (status >= 400) {
    return "validation_error";
  }
  if (body.safetyFlag && body.notFound) {
    return "rejected";
  }
  if (body.notFound) {
    return "not_found";
  }
  return "supported";
}

/* ------------------------------ runner ------------------------------ */

async function runCase(testCase) {
  const started = Date.now();
  let status = 0;
  let body = {};

  try {
    const response = await fetch(`${baseUrl}/api/securerag/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: testCase.question, corpusId: testCase.corpusId }),
    });
    status = response.status;
    body = await response.json();
  } catch (error) {
    return {
      id: testCase.id,
      category: testCase.category,
      question: testCase.question,
      corpusId: testCase.corpusId,
      expectedState: testCase.expectedState,
      actualState: "error",
      passed: false,
      retrievalQualityScore: 0,
      retrievalPrecision: 0,
      citationCoverage: 0,
      citationsCorrect: false,
      safetyFlag: false,
      durationMs: Date.now() - started,
      notes: `The application could not be reached at ${baseUrl}: ${error.message}`,
    };
  }

  const citedIds = Array.from(new Set((body.citations ?? []).map((c) => c.sourceId)));
  const state = actualState(status, body);
  const notes = [];

  let passed = state === testCase.expectedState;

  if (!passed) {
    notes.push(`expected state ${testCase.expectedState}, got ${state}`);
  }

  if (state !== "validation_error") {
    if (Boolean(body.safetyFlag) !== Boolean(testCase.expectedSafetyFlag)) {
      passed = false;
      notes.push(`expected safetyFlag ${testCase.expectedSafetyFlag}, got ${body.safetyFlag}`);
    }
    if (!citationsAreCorrect(testCase.expectedSourceIds, citedIds)) {
      passed = false;
      notes.push(`unexpected citations: ${citedIds.join(", ") || "none"}`);
    }
  }

  if (testCase.forbiddenAnswerText && (body.answer ?? "").includes(testCase.forbiddenAnswerText)) {
    passed = false;
    notes.push(`answer contained forbidden text "${testCase.forbiddenAnswerText}"`);
  }

  return {
    id: testCase.id,
    category: testCase.category,
    question: testCase.question,
    corpusId: testCase.corpusId,
    expectedState: testCase.expectedState,
    actualState: state,
    passed,
    retrievalQualityScore: retrievalQualityScore(testCase.expectedSourceIds, citedIds),
    retrievalPrecision: retrievalPrecision(testCase.expectedSourceIds, citedIds),
    citationCoverage: body.citationCoverage ?? 0,
    citationsCorrect: citationsAreCorrect(testCase.expectedSourceIds, citedIds),
    safetyFlag: Boolean(body.safetyFlag),
    citedSourceIds: citedIds,
    reportedRetrievalQuality: body.retrievalQualityScore ?? 0,
    durationMs: Date.now() - started,
    notes: notes.join("; ") || "ok",
  };
}

function average(values) {
  return values.length === 0
    ? 0
    : Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function toMarkdown(report) {
  const lines = [
    "# SecureRAG Studio Retrieval Quality Report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Target: ${report.baseUrl}`,
    `- Cases: ${report.summary.totalCases}`,
    `- Passed: ${report.summary.passedCases}`,
    `- Failed: ${report.summary.failedCases}`,
    `- Pass rate: ${report.summary.passRate}%`,
    `- Average retrieval quality: ${report.summary.averageRetrievalQuality}`,
    `- Average citation coverage: ${report.summary.averageCitationCoverage}`,
    `- Release recommendation: **${report.summary.releaseRecommendation.toUpperCase()}**`,
    "",
    "| Case | Category | Expected | Actual | Retrieval | Coverage | Result | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const outcome of report.outcomes) {
    lines.push(
      `| ${outcome.id} | ${outcome.category} | ${outcome.expectedState} | ${outcome.actualState} | ` +
        `${outcome.retrievalQualityScore} | ${outcome.citationCoverage} | ` +
        `${outcome.passed ? "PASS" : "FAIL"} | ${outcome.notes} |`,
    );
  }

  const failures = report.outcomes.filter((outcome) => !outcome.passed);
  lines.push("", "## Failed cases", "");
  if (failures.length === 0) {
    lines.push("No failed cases.");
  } else {
    lines.push("| Case | Owner | Fix status | Retest result |", "| --- | --- | --- | --- |");
    for (const failure of failures) {
      const owner =
        failure.category === "prompt_injection"
          ? "Mohab (security)"
          : failure.category === "failure"
            ? "Monica (platform)"
            : "Somaya (retrieval)";
      lines.push(`| ${failure.id} | ${owner} | open | not retested |`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const outcomes = [];
  for (const testCase of cases) {
    outcomes.push(await runCase(testCase));
  }

  const passedCases = outcomes.filter((outcome) => outcome.passed).length;
  const securityPassed = outcomes
    .filter((outcome) => outcome.category === "prompt_injection")
    .every((outcome) => outcome.passed);
  const passRate = Math.round((passedCases / outcomes.length) * 100);

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    summary: {
      totalCases: outcomes.length,
      passedCases,
      failedCases: outcomes.length - passedCases,
      passRate,
      averageRetrievalQuality: average(outcomes.map((o) => o.retrievalQualityScore)),
      averageCitationCoverage: average(outcomes.map((o) => o.citationCoverage)),
      releaseRecommendation: securityPassed && passRate >= 80 ? "go" : "no-go",
    },
    outcomes,
  };

  const resultsDirectory = join(projectRoot, "evaluation", "results");
  mkdirSync(resultsDirectory, { recursive: true });
  writeFileSync(join(resultsDirectory, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(resultsDirectory, "latest.md"), toMarkdown(report));

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const outcome of report.outcomes) {
      const mark = outcome.passed ? "PASS" : "FAIL";
      console.log(`${mark}  ${outcome.id.padEnd(9)} ${outcome.category.padEnd(17)} ${outcome.notes}`);
    }
    console.log("");
    console.log(`Cases            : ${report.summary.totalCases}`);
    console.log(`Passed           : ${report.summary.passedCases}`);
    console.log(`Failed           : ${report.summary.failedCases}`);
    console.log(`Pass rate        : ${report.summary.passRate}%`);
    console.log(`Retrieval quality: ${report.summary.averageRetrievalQuality}`);
    console.log(`Citation coverage: ${report.summary.averageCitationCoverage}`);
    console.log(`Recommendation   : ${report.summary.releaseRecommendation.toUpperCase()}`);
    console.log("");
    console.log("Report written to evaluation/results/latest.json and latest.md");
  }

  process.exit(report.summary.failedCases === 0 ? 0 : 1);
}

await main();
