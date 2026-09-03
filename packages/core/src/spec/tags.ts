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

/** Everything §6.2 does not allow in a tag, in runs, so a swap keeps one character. */
const NOT_A_TAG_CHARACTER = /[^\p{L}\p{N}_\-/]+/gu;

/**
 * A tag rewritten to fit §6.2's grammar, or `null` when nothing of it survives.
 *
 * Both places a tag enters the deck from outside the format need this: Anki's tags
 * hold punctuation and emoji, and a frontmatter sequence holds whatever YAML parsed.
 * A tag equal to its input needed no rewriting, which is what tells a caller whether
 * it owes a `tag-sanitized`.
 */
export const asTagToken = (raw: string): string | null => {
  const sanitized = raw.replaceAll(NOT_A_TAG_CHARACTER, "_");

  return isTagToken(sanitized) ? sanitized : null;
};

/**
 * The other half of §6.5's mapping, from Anki's tags back to the file's.
 *
 * Anki nests with `::` where the file nests with `/`, and it is far more permissive
 * about the rest: a tag there may hold punctuation and emoji that §6.2's grammar has
 * no room for. Those are rewritten rather than dropped, and a tag that survives the
 * rewrite as nothing at all, or as digits only, is reported instead.
 */
export const fromAnkiTags = (
  tags: readonly string[],
): { tags: string[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const kept: string[] = [];

  for (const tag of tags) {
    const nested = tag.replaceAll("::", "/");
    const sanitized = asTagToken(nested);

    if (sanitized === null) {
      diagnostics.push(
        diagnostic(
          "unrepresentable-content",
          `the Anki tag "${tag}" has no spelling in this format and was left out of ` +
            `the deck. Tags are letters, digits, "_", "-" and "/", with at least one ` +
            `character that is not a digit.`,
        ),
      );
    } else {
      if (sanitized !== nested) {
        diagnostics.push(
          diagnostic(
            "tag-sanitized",
            `the Anki tag "${tag}" holds characters this format's tags cannot; ` +
              `it was written as "${sanitized}".`,
          ),
        );
      }

      kept.push(sanitized);
    }
  }

  return { diagnostics, tags: uniqueTags(kept) };
};
