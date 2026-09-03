/*
 * A line scan of a deck, with just enough CommonMark to know what is code.
 *
 * Every construct Flashcard Markdown adds is line-anchored, an ATX heading or a line of
 * exactly `***`, so a scanner reports byte-exact source slices without reconstructing
 * them from an abstract syntax tree. The one thing a scanner cannot do unaided is know
 * it is inside a fence, which is what this module adds; §5.3 makes that mandatory,
 * since a `***` inside a fenced block is content and splitting there would cut the card
 * mid-fence.
 *
 * The converse trap is worth stating too: a parser working from an AST sees a
 * thematic-break node and cannot tell whether `***`, `---` or `___` produced it, so it
 * must go back to the source anyway.
 *
 * Indented code blocks need no tracking. They begin at four spaces of indentation,
 * and every construct here is anchored at column zero or close to it, so nothing
 * inside one can be mistaken for a heading or a separator.
 *
 * That anchoring is a deliberate narrowing of CommonMark, which lets an ATX heading
 * and a thematic break carry up to three spaces of indentation. `  ## Card` is an H2
 * to a CommonMark parser and body content here, and `  ***` is a thematic break there
 * and body content here. The narrowing is the safe half of the two: an indented `##`
 * leaves a card whole, where honouring it would cut one in two, and §5.3 already
 * requires the separator to be at the top level of the body. `FENCE` is the one
 * pattern that takes CommonMark's `^ {0,3}`, for the same reason read the other way:
 * it decides what is code, and recognizing more code splits fewer cards.
 *
 * Capture groups are destructured with empty defaults throughout. None of the patterns
 * below has an optional group that can go missing once the pattern has matched, but
 * `noUncheckedIndexedAccess` types every group as possibly absent and there is no way
 * to tell it otherwise short of an assertion.
 */

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/u;

/* `#` must be followed by a space or end the line; `#tag` is a paragraph, not a
   heading, in CommonMark and therefore here. */
const HEADING = /^(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/u;

/* The closing sequence of an ATX heading: `## Title ##` has the text `Title`. */
const CLOSING_SEQUENCE = /[ \t]+#+$/u;

/** A line of exactly `***`. Indentation, a list marker or a `>` all fail this. */
const SEPARATOR = "***";

/** Line numbers are 1-based, which is what an editor shows and a producer reports. */
const FIRST_LINE = 1;

/** The deck title, the only `#` heading version 1 gives a meaning (§4.2). */
export const TITLE_DEPTH = 1;

/** The card boundary (§5.1). */
export const CARD_DEPTH = 2;

export interface ScannedLine {
  readonly text: string;
  /** 1-based and counted from the start of the file, frontmatter included. */
  readonly number: number;
  /** Inside a fenced code block, delimiters included. */
  readonly inCode: boolean;
  readonly heading: { readonly depth: number; readonly text: string } | null;
  readonly isSeparator: boolean;
}

/**
 * Whether a line holds nothing but whitespace.
 *
 * Takes `undefined` because every caller reaches for a neighbour that may be off the
 * end of the array, and "there is no line there" is the same answer as "that line is
 * blank" for every one of them.
 */
export const isBlank = (text: string | undefined): boolean => (text ?? "").trim() === "";

/**
 * Splits a source file into lines.
 *
 * `\r\n` is normalized because a deck written on Windows would otherwise leave a `\r`
 * on every line, and `***\r` is not a separator. Nothing else is trimmed: two trailing
 * spaces are a hard line break in CommonMark, so stripping them would edit the card.
 * The two implementations this replaces each got one of those halves wrong.
 */
export const splitSourceLines = (source: string): string[] => source.split(/\r?\n/u);

interface OpenFence {
  readonly marker: string;
  readonly length: number;
}

/** A fence closes on a delimiter of the same character, at least as long, with no info. */
const closesFence = (open: OpenFence, delimiter: string, info: string): boolean =>
  delimiter.startsWith(open.marker) && delimiter.length >= open.length && info.trim() === "";

const readHeading = (text: string): ScannedLine["heading"] => {
  const match = HEADING.exec(text);

  if (match === null) {
    return null;
  }

  const [, hashes = "", heading = ""] = match;

  return { depth: hashes.length, text: heading.replace(CLOSING_SEQUENCE, "").trim() };
};

export const scanLines = (
  lines: readonly string[],
  firstLineNumber = FIRST_LINE,
): ScannedLine[] => {
  let fence: OpenFence | null = null;

  return lines.map((text, index) => {
    const number = firstLineNumber + index;
    const fenceMatch = FENCE.exec(text);
    const [, delimiter = "", info = ""] = fenceMatch ?? [];
    const code = { heading: null, inCode: true, isSeparator: false, number, text };

    if (fence !== null) {
      if (fenceMatch !== null && closesFence(fence, delimiter, info)) {
        fence = null;
      }
      return code;
    }

    if (fenceMatch !== null) {
      fence = { length: delimiter.length, marker: delimiter.slice(0, 1) };
      return code;
    }

    return {
      heading: readHeading(text),
      inCode: false,
      isSeparator: text === SEPARATOR,
      number,
      text,
    };
  });
};

/** The bounds of `lines` with its blank leading and trailing entries excluded. */
const contentBounds = (blankAt: (index: number) => boolean, length: number) => {
  let start = 0;
  let end = length;

  while (start < end && blankAt(start)) {
    start += 1;
  }
  while (end > start && blankAt(end - 1)) {
    end -= 1;
  }

  return { end, start };
};

/**
 * Joins lines back into a source slice, dropping only leading and trailing blank
 * lines, the single normalization the conformance corpus allows.
 */
export const toSlice = (lines: readonly string[]): string => {
  const { end, start } = contentBounds((index) => isBlank(lines[index]), lines.length);

  return lines.slice(start, end).join("\n");
};

/** The same trim, over scanned lines, keeping their numbers. */
export const trimBlankEnds = (lines: readonly ScannedLine[]): ScannedLine[] => {
  const { end, start } = contentBounds((index) => isBlank(lines[index]?.text), lines.length);

  return lines.slice(start, end);
};
