/**
 * `@ankimd/core`: Flashcard Markdown decks to and from Anki packages.
 *
 * Both conformance classes of the format live here, and §3.1 is the difference between
 * them. `parseMarkdown` is the consumer: it never throws and reports what it could not
 * read as diagnostics. `parseCanonical` is the producer: it refuses anything that is
 * not canonical form. `renderMarkdown` emits canonical form only.
 *
 * `toApkg` and `writeApkg` take a deck the other way, to the package Anki imports,
 * and `readDeck` brings one back. That direction is lossy, and `docs/round-trip.md`
 * is the table of what does and does not survive it.
 */

export { extractDeck, type ExtractOptions, type ExtractResult, readDeck } from "./anki/extract.js";

export {
  type ApkgOptions,
  type ApkgResult,
  type PackagedFile,
  toApkg,
  writeApkg,
} from "./anki/export.js";
export { type Highlighter } from "./anki/html.js";
export { isRemote, localMedia, type MediaResolver, type ResolvedMedia } from "./anki/media.js";

export { type Card, type Deck, deckOf, type DeckImage } from "./deck.js";
export {
  DIAGNOSTIC_CODES,
  type Diagnostic,
  type DiagnosticCode,
  diagnostic,
  reasonOf,
} from "./diagnostics.js";
export {
  type CanonicalIssue,
  checkCanonical,
  formatIssues,
  NotCanonicalError,
  parseCanonical,
} from "./spec/canonical.js";
export { relocateImages } from "./spec/images.js";
export { type ParseResult, parseMarkdown } from "./spec/parse.js";
/*
 * The line scan, exported because a producer checking policy over its own output needs
 * to know what is inside a fence and nothing else does that job. `parseCanonical` covers
 * the grammar and the three canonical departures; the rules §5.5 leaves to a producer,
 * such as insisting on a bullet-list back, are the caller's and are checked over the
 * caller's own lines. Without this they would each carry a second copy of the fence
 * tracking, which is the duplication this package exists to end.
 */
export { isBlank, type ScannedLine, scanLines, splitSourceLines } from "./spec/scan.js";
export { renderCard, renderMarkdown } from "./spec/render.js";
export {
  fromAnkiTags,
  isTagsOnlyLine,
  isTagToken,
  tagsInLine,
  toAnkiTags,
  uniqueTags,
} from "./spec/tags.js";
