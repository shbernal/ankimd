import { type Diagnostic, diagnostic } from "../diagnostics.js";

/*
 * Flashcard Markdown §6.2 adopts Obsidian's tag grammar verbatim: alphanumerics
 * (Unicode included), underscore, hyphen and slash, with at least one non-numeric
 * character, and slash nesting. Obsidian's is adopted rather than invented because a
 * deck usually lives in a vault, and a tag the vault does not see is a tag the user
 * did not write.
 */

const TAG_TOKEN = /^[\p{L}\p{N}_\-/]+$/u;
const ALL_NUMERIC = /^\p{N}+$/u;

/* The `#` has to open the token, so `C#` is not a tag and neither is the fragment of
   a URL. Anchoring on start-of-line or whitespace is what enforces that. */
const TAG_IN_TEXT = /(?:^|\s)#([\p{L}\p{N}_\-/]+)/gu;

/* Backtick runs, so a tag inside a code span is not a tag (§6.2, and Obsidian). */
const CODE_SPAN = /(`+)(?:(?!\1)[\s\S])*?\1/gu;

export const isTagToken = (token: string): boolean =>
  TAG_TOKEN.test(token) && !ALL_NUMERIC.test(token);

/**
 * Blanks out code spans while keeping every offset, so a scan over the result reports
 * positions that still line up with the source line.
 */
const maskCodeSpans = (line: string): string =>
  line.replace(CODE_SPAN, (match) => " ".repeat(match.length));

export const tagsInLine = (line: string): string[] =>
  [...maskCodeSpans(line).matchAll(TAG_IN_TEXT)]
    .map(([, token = ""]) => token)
    .filter((token) => isTagToken(token));

/**
 * True when the line carries nothing but tags. §6.3 makes rendering line-based rather
 * than token-based: such a line is metadata and is hidden, while a tag written inside a
 * sentence stays visible, because hiding it would render "The #verbs group" as "The
 * group".
 */
export const isTagsOnlyLine = (line: string): boolean => {
  const trimmed = line.trim();

  if (trimmed === "") {
    return false;
  }

  return trimmed
    .split(/\s+/u)
    .every((token) => token.startsWith("#") && isTagToken(token.slice(1)));
};

export const uniqueTags = (tags: readonly string[]): string[] => [...new Set(tags)];

/**
 * The Anki half of §6.5's mapping. Anki nests with `::` where the file nests with `/`,
 * and separates tags with spaces, so a tag carrying whitespace would silently become
 * two, hence the sanitize-and-say-so rather than a quiet replacement.
 */
export const toAnkiTags = (
  tags: readonly string[],
): { tags: string[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];

  const mapped = tags.map((tag) => {
    const nested = tag.replaceAll("/", "::");
    const sanitized = nested.replaceAll(/\s+/gu, "_");

    if (sanitized !== nested) {
      diagnostics.push(
        diagnostic(
          "tag-sanitized",
          `the tag "${tag}" contains whitespace, which separates tags in Anki; ` +
            `it was exported as "${sanitized}".`,
        ),
      );
    }

    return sanitized;
  });

  return { diagnostics, tags: uniqueTags(mapped) };
};
