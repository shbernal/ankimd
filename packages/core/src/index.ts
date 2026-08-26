/**
 * `@ankimd/core`: Flashcard Markdown decks to and from Anki packages.
 *
 * Both conformance classes of the format live here, and §3.1 is the difference between
 * them. `parseMarkdown` is the consumer: it never throws and reports what it could not
 * read as diagnostics. `parseCanonical` is the producer: it refuses anything that is
 * not canonical form. `renderMarkdown` emits canonical form only.
 */

export type { Card, Deck, DeckImage } from "./deck.js";
export {
  DIAGNOSTIC_CODES,
  type Diagnostic,
  type DiagnosticCode,
  diagnostic,
} from "./diagnostics.js";
export {
  type CanonicalIssue,
  checkCanonical,
  formatIssues,
  NotCanonicalError,
  parseCanonical,
} from "./spec/canonical.js";
export { type ParseResult, parseMarkdown } from "./spec/parse.js";
export { renderCard, renderMarkdown } from "./spec/render.js";
export { isTagsOnlyLine, isTagToken, tagsInLine, toAnkiTags, uniqueTags } from "./spec/tags.js";
