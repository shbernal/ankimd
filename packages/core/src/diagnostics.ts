/*
 * The diagnostic codes of Flashcard Markdown §8. The list is closed in version 1:
 * a code that is not here is not a conformance signal, and adding one is a spec
 * change made in the spec repository, not here.
 */

export const DIAGNOSTIC_CODES = [
  "stray-h1",
  "frontmatter-tags-not-a-sequence",
  "preamble-tag",
  "tag-sanitized",
  "unresolved-image",
  "malformed-card-skipped",
  "unrepresentable-content",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export interface Diagnostic {
  /** Conformance is asserted against this, never against the message. */
  readonly code: DiagnosticCode;
  /** The card it belongs to, or null when the diagnostic is file-level. */
  readonly cardIndex: number | null;
  /** Free-form and ours to word; no test anywhere may depend on it. */
  readonly message: string;
}

export const diagnostic = (
  code: DiagnosticCode,
  message: string,
  cardIndex: number | null = null,
): Diagnostic => ({ cardIndex, code, message });
