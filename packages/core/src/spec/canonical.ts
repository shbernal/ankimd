import type { Deck } from "../deck.js";
import { type CardRegion, splitDocument } from "./document.js";
import { splitFrontmatter } from "./frontmatter.js";
import { parseMarkdown } from "./parse.js";
import { isBlank, type ScannedLine, scanLines, splitSourceLines, trimBlankEnds } from "./scan.js";
import { isTagsOnlyLine } from "./tags.js";

/*
 * The producer gate of §3.1: a producer MUST emit canonical form only and SHOULD fail
 * loudly rather than emit something that is merely valid.
 *
 * Two kinds of departure land here, and they come from different places:
 *
 *   Tier 3, everything the grammar rejects. `parseMarkdown` already finds these and
 *   reports them as diagnostics, because a consumer has to salvage them. §3.2 says a
 *   producer rejects the same set, so every diagnostic becomes an issue here.
 *
 *   Tier 2, valid but not canonical. A consumer must read these correctly and says
 *   nothing about them, so they are checked only here. The spec names exactly three,
 *   and all three are below.
 *
 * What is deliberately absent is policy. §5.4 says a bullet-list back is an authoring
 * convention and not a grammar rule, and §5.5 says a producer MAY refuse an empty body
 * or a duplicate front. May, not must. A caller that wants those rules adds them to its
 * own output; putting them here would make this package refuse decks the format calls
 * conformant.
 */

export interface CanonicalIssue {
  readonly message: string;
  /** 1-based source lines, empty when the departure is not tied to one. */
  readonly lines: readonly number[];
}

/** Collapses a sorted run of line numbers into `4, 7-9` for a message. */
const formatLineRanges = (lineNumbers: readonly number[]): string => {
  const [head, ...tail] = [...new Set(lineNumbers)].toSorted((left, right) => left - right);

  if (head === undefined) {
    return "";
  }

  const ranges: string[] = [];
  let start = head;
  let previous = head;

  const flush = (): void => {
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  };

  for (const current of tail) {
    if (current !== previous + 1) {
      flush();
      start = current;
    }
    previous = current;
  }
  flush();

  return ranges.join(", ");
};

export const formatIssues = (issues: readonly CanonicalIssue[]): string =>
  issues
    .map((issue, index) => {
      const where = formatLineRanges(issue.lines);
      const head = `${index + 1}. ${issue.message}`;

      return where === "" ? head : `${head}\n   lines ${where}`;
    })
    .join("\n");

export class NotCanonicalError extends Error {
  readonly issues: readonly CanonicalIssue[];

  constructor(issues: readonly CanonicalIssue[]) {
    super(`Markdown is not canonical Flashcard Markdown:\n${formatIssues(issues)}`);
    this.name = "NotCanonicalError";
    this.issues = [...issues];
  }
}

/**
 * §5.4: a blank line after the `##` heading, before the body.
 *
 * markdownlint's MD022 wants that blank line, and a deck that is lint-dirty inside the
 * user's own vault is exactly what the canonical spelling avoids.
 */
const checkHeadingGap = (region: CardRegion): CanonicalIssue[] => {
  const [underHeading] = region.body;

  if (underHeading === undefined || isBlank(underHeading.text)) {
    return [];
  }

  return [
    {
      lines: [underHeading.number],
      message: 'A "##" heading needs a blank line after it, before the body',
    },
  ];
};

/**
 * §5.3: a blank line either side of the `***`.
 *
 * The body's own edges count as blank. The blank line after the heading and the one
 * before the next card are both there, so a separator at either end is canonical.
 */
const checkSeparatorGaps = (body: readonly ScannedLine[]): CanonicalIssue[] =>
  body
    .filter((line, index) => {
      if (!line.isSeparator || line.inCode) {
        return false;
      }

      const before = index === 0 || isBlank(body[index - 1]?.text);
      const after = index === body.length - 1 || isBlank(body[index + 1]?.text);

      return !before || !after;
    })
    .map((line) => ({
      lines: [line.number],
      message: 'A "***" front/back separator needs a blank line either side',
    }));

/**
 * §6.3: one tags-only line, last in the card body.
 *
 * A tag inside a sentence is not counted here. §6.3 keeps it visible and renders it as
 * written, so moving it would edit the text rather than normalize it.
 */
const checkTagPlacement = (body: readonly ScannedLine[]): CanonicalIssue[] => {
  const tagLines = body.filter((line) => !line.inCode && isTagsOnlyLine(line.text));
  const [first] = tagLines;

  if (tagLines.length > 1) {
    return [
      {
        lines: tagLines.map((line) => line.number),
        message: "A card carries at most one tags-only line, holding all of its tags",
      },
    ];
  }

  if (first === undefined || first === body.at(-1)) {
    return [];
  }

  return [
    { lines: [first.number], message: "A tags-only line belongs at the end of the card body" },
  ];
};

const checkCard = (region: CardRegion): CanonicalIssue[] => {
  const body = trimBlankEnds(region.body);

  if (body.length === 0) {
    return [];
  }

  return [...checkHeadingGap(region), ...checkSeparatorGaps(body), ...checkTagPlacement(body)];
};

/**
 * Every way `source` departs from canonical form. Empty means it is canonical.
 *
 * This does not throw, so a caller that wants to report rather than fail can.
 * `parseCanonical` is the failing entry point.
 */
export const checkCanonical = (source: string): CanonicalIssue[] => {
  const { diagnostics } = parseMarkdown(source);
  const front = splitFrontmatter(splitSourceLines(source));
  const { regions } = splitDocument(scanLines(front.body, front.bodyStartLine));

  return [
    ...diagnostics.map((item) => ({ lines: [], message: `${item.code}: ${item.message}` })),
    ...regions.flatMap((region) => checkCard(region)),
  ];
};

/**
 * Parses `source` and refuses anything that is not canonical.
 *
 * The consumer entry point is `parseMarkdown`, which never throws. The difference is
 * §3.1 rather than an inconsistency: a producer's input is usually something it just
 * generated, and a failure there means "generate it again", not "hand the user a
 * broken deck".
 */
export const parseCanonical = (source: string): Deck => {
  const issues = checkCanonical(source);

  if (issues.length > 0) {
    throw new NotCanonicalError(issues);
  }

  return parseMarkdown(source).deck;
};
