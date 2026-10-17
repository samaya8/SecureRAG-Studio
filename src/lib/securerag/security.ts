/**
 * Security layer: prompt-injection detection and evidence hygiene.
 *
 * Owner: Mohab Ahmed (Product UI & Security) with Monica (platform).
 *
 * Two separate concerns live here:
 *
 *  1. DIRECT injection -- the user's own question tries to override the
 *     system rules ("ignore the documents", "reveal your API key").
 *     These requests are rejected before any retrieval or provider call.
 *
 *  2. INDIRECT injection -- an instruction embedded inside an approved
 *     document. The document is not removed (it may still be legitimate
 *     evidence); instead the instruction is neutralised in the prompt and
 *     the response is flagged, because a document must never be able to
 *     change the system's behaviour.
 *
 * This is defence in depth, not a guarantee -- see docs/known-limitations.md.
 */

export interface InjectionScan {
  detected: boolean;
  /** Stable rule identifiers, safe to log (they contain no user content). */
  matchedRules: string[];
}

interface Rule {
  id: string;
  pattern: RegExp;
}

const DIRECT_RULES: Rule[] = [
  {
    id: "override-instructions",
    pattern:
      /\bignore\s+(?:all\s+|any\s+|the\s+)?(?:previous\s+|prior\s+|above\s+|earlier\s+|system\s+)?(?:instructions?|rules?|prompts?|documents?|context|evidence)\b/i,
  },
  {
    id: "disregard-instructions",
    pattern:
      /\b(?:disregard|forget|bypass|override)\s+(?:all\s+|any\s+|the\s+)?(?:previous\s+|prior\s+|above\s+|system\s+|safety\s+)?(?:instructions?|rules?|guidelines?|documents?|restrictions?)\b/i,
  },
  {
    id: "reveal-secret",
    pattern:
      /\b(?:reveal|show|print|display|give|tell|leak|expose)\b[^.?!]{0,40}\b(?:api[\s_-]?key|secret|token|credential|password|env(?:ironment)?\s+variable)/i,
  },
  {
    id: "reveal-system-prompt",
    pattern:
      /\b(?:system\s+prompt|initial\s+instructions?|developer\s+message|your\s+instructions)\b/i,
  },
  {
    id: "role-escalation",
    pattern:
      /\b(?:pretend|act|behave|roleplay)\b[^.?!]{0,40}\b(?:you\s+are|as)\b[^.?!]{0,40}\b(?:admin(?:istrator)?|root|developer|system)\b/i,
  },
  {
    id: "approval-escalation",
    pattern:
      /\b(?:approve|reject|archive|unlock|grant\s+access\s+to)\b[^.?!]{0,30}\b(?:document|corpus|file|permission)/i,
  },
  {
    id: "answer-from-general-knowledge",
    pattern:
      /\b(?:answer|respond|reply)\b[^.?!]{0,40}\b(?:from|using|with)\b[^.?!]{0,25}\b(?:your\s+own\s+|general\s+|training\s+|internal\s+)(?:knowledge|memory|data)\b/i,
  },
  {
    id: "answer-without-evidence",
    pattern:
      /\b(?:without|no)\s+(?:using\s+)?(?:the\s+)?(?:documents?|evidence|sources?|citations?)\b/i,
  },
];

const INDIRECT_RULES: Rule[] = [
  {
    id: "embedded-override",
    pattern:
      /\bignore\s+(?:all\s+)?(?:previous|prior|above|the)\s+(?:instructions?|rules?|prompts?)\b/i,
  },
  {
    id: "embedded-secret-request",
    pattern:
      /\b(?:reveal|print|output|show)\b[^.\n]{0,40}\b(?:system\s+prompt|api[\s_-]?key|secret)\b/i,
  },
  { id: "embedded-role-change", pattern: /\byou\s+are\s+now\b/i },
  { id: "embedded-role-prefix", pattern: /^\s*(?:system|assistant|user)\s*:/im },
];

function scan(text: string, rules: Rule[]): InjectionScan {
  const matchedRules = rules.filter((rule) => rule.pattern.test(text)).map((rule) => rule.id);
  return { detected: matchedRules.length > 0, matchedRules };
}

/** Scans a user question for direct prompt-injection attempts. */
export function detectDirectInjection(question: string): InjectionScan {
  return scan(question, DIRECT_RULES);
}

/** Scans retrieved evidence for embedded (indirect) instructions. */
export function detectIndirectInjection(evidenceText: string): InjectionScan {
  return scan(evidenceText, INDIRECT_RULES);
}

/**
 * Control characters (tab, newline and carriage return excluded) that could
 * be used to break out of the evidence block in the prompt.
 */
const CONTROL_CHARACTERS = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);

/**
 * Neutralises control characters and instruction-looking role prefixes in
 * evidence before it is placed in the prompt. The text stays readable so the
 * citation still matches the document, but it can no longer imitate a
 * conversation turn or close the evidence block.
 */
export function neutraliseEvidence(text: string): string {
  return text
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/^(\s*)(system|assistant|user)(\s*):/gim, "$1[$2]$3:")
    .replace(/-{3,}\s*END OF EVIDENCE\s*-{3,}/gi, "[redacted marker]")
    .trim();
}

/** Human-readable, non-sensitive reason attached to a blocked response. */
export const SAFETY_REJECTION_MESSAGE =
  "This request was blocked because it tried to change the system's rules. " +
  "Please ask a question about the approved documents instead.";

/** Limitation text attached to answers built on flagged evidence. */
export const INDIRECT_INJECTION_LIMITATION =
  "One or more retrieved documents contain embedded instructions. " +
  "Those instructions were treated as plain text and were not followed.";
