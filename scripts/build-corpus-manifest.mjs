#!/usr/bin/env node
/**
 * Builds corpus/corpus-manifest.json from the human-maintained registers.
 *
 * Owner: Yara Samir (Knowledge Curation) -- run this after changing a register.
 *
 *   node scripts/build-corpus-manifest.mjs
 *
 * The manifest is the single machine-readable source the retrieval layer
 * loads. Keeping it generated (instead of hand-written) means the registers
 * that governance actually reviews stay authoritative.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusRoot = join(projectRoot, "corpus");

/** Minimal CSV reader: handles quoted fields and embedded commas. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift().map((name) => name.replace(/^﻿/, "").trim());
  return rows
    .filter((current) => current.some((value) => value.trim() !== ""))
    .map((current) => Object.fromEntries(header.map((name, index) => [name, (current[index] ?? "").trim()])));
}

function normaliseStatus(value) {
  const status = value.toLowerCase();
  return ["pending", "approved", "rejected", "archived"].includes(status) ? status : "pending";
}

function requireFile(relativePath) {
  const absolute = join(projectRoot, relativePath);
  if (!existsSync(absolute) || statSync(absolute).size === 0) {
    throw new Error(`Corpus file missing or empty: ${relativePath}`);
  }
  return relativePath;
}

/* --------------------------- university policies -------------------- */

const policyRegister = JSON.parse(readFileSync(join(corpusRoot, "corpus-register.json"), "utf8"));

const universityPolicies = {
  id: "university-policies",
  title: "University Policies",
  description: "Approved academic regulations used by the SecureRAG Studio demo.",
  documents: policyRegister
    .filter((entry) => entry.id !== "SEC-001" && entry.id !== "SEC-002")
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      version: entry.version,
      category: entry.category,
      approvalStatus: normaliseStatus(entry.approvalStatus),
      uploadedAt: entry.uploadedAt,
      approvedBy: entry.approvedBy,
      sourceType: entry.sourceType,
      file: requireFile(`corpus/documents/${entry.fileName}`),
    })),
};

/* ------------------------------ rag research ------------------------ */

const researchRegister = parseCsv(readFileSync(join(corpusRoot, "corpus-register.csv"), "utf8"));

const ragResearch = {
  id: "rag-research",
  title: "RAG Research Library",
  description:
    "Peer-reviewed and preprint literature curated for the SecureRAG Studio knowledge base.",
  documents: researchRegister.map((entry) => {
    const status = normaliseStatus(entry.approval_status);
    // Only approved documents get extracted text; rejected ones stay
    // registered (for auditability) but unreadable by the retrieval layer.
    const extracted = `corpus/extracted/${entry.document_id}.txt`;
    const hasExtract = existsSync(join(projectRoot, extracted));
    return {
      id: entry.document_id,
      title: entry.title,
      version: entry.version,
      category: entry.topic,
      approvalStatus: status,
      uploadedAt: new Date(`${entry.date_added}T00:00:00.000Z`).toISOString(),
      approvedBy: entry.approved_by,
      sourceType: "pdf",
      file: hasExtract ? extracted : `corpus/${status === "approved" ? "approved" : "rejected"}/${entry.file_name}`,
    };
  }),
};

/* ------------------------------ security lab ------------------------ */

const securityLab = {
  id: "security-lab",
  title: "Security Lab",
  description:
    "Test-only corpus containing a document with an embedded instruction, used to prove indirect prompt-injection handling.",
  documents: [
    {
      id: "SEC-001",
      title: "Security Lab Note: Embedded Instruction Sample",
      version: "1.0",
      category: "Security Testing",
      approvalStatus: "approved",
      uploadedAt: "2026-07-24T00:00:00.000Z",
      approvedBy: "Mohab Ahmed",
      sourceType: "markdown",
      file: requireFile("corpus/documents/injection-test-note.md"),
    },
    {
      id: "SEC-002",
      title: "Security Lab Overview",
      version: "1.0",
      category: "Security Testing",
      approvalStatus: "approved",
      uploadedAt: "2026-07-24T00:00:00.000Z",
      approvedBy: "Mohab Ahmed",
      sourceType: "markdown",
      file: requireFile("corpus/documents/security-lab-overview.md"),
    },
  ],
};

// The checked-in manifest must be reproducible: a wall-clock timestamp would
// make the CI verification fail every time it regenerates the same corpus.
// The latest document metadata date changes whenever curated corpus metadata
// changes, while remaining stable for identical inputs.
const generatedAt = [universityPolicies, ragResearch, securityLab]
  .flatMap((corpus) => corpus.documents.map((document) => document.uploadedAt))
  .sort()
  .at(-1);

const manifest = {
  version: "1.0.0",
  generatedAt,
  corpora: [universityPolicies, ragResearch, securityLab],
};

/* ------------------------------ validation -------------------------- */

const problems = [];
for (const corpus of manifest.corpora) {
  const seen = new Set();
  for (const document of corpus.documents) {
    if (seen.has(document.id)) {
      problems.push(`Duplicate document id ${document.id} in corpus ${corpus.id}`);
    }
    seen.add(document.id);
    if (document.approvalStatus === "approved" && !existsSync(join(projectRoot, document.file))) {
      problems.push(`Approved document ${document.id} points at a missing file: ${document.file}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Corpus manifest validation failed:");
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

writeFileSync(
  join(corpusRoot, "corpus-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

for (const corpus of manifest.corpora) {
  const approved = corpus.documents.filter((d) => d.approvalStatus === "approved").length;
  console.log(
    `${corpus.id}: ${approved} approved / ${corpus.documents.length} registered documents`,
  );
}
console.log("Wrote corpus/corpus-manifest.json");
