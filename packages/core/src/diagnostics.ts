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

/**
 * What a thrown value has to say.
 *
 * `catch (error: unknown)` is what TypeScript gives, and every diagnostic built from a
 * failure needs a sentence out of it. Written once so there is one arm to cover rather
 * than one per call site, none of which any test can reach on its own: the throws these
 * wrap are `Error`s, and the fallback is here for the callers that are not ours.
 */
export const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The same diagnostics, told which card they belong to.
 *
 * The checks that produce them work over one card's values and have no index to give;
 * their callers are iterating and do. Module-internal: a diagnostic that leaves this
 * package already carries its index.
 */
export const atCard = (diagnostics: readonly Diagnostic[], cardIndex: number): Diagnostic[] =>
  diagnostics.map(({ code, message }) => diagnostic(code, message, cardIndex));
