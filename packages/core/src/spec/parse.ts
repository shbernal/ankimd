import { type Card, type Deck, deckOf, type DeckImage } from "../deck.js";
import { type Diagnostic, diagnostic } from "../diagnostics.js";
import { type CardRegion, type Document, splitDocument } from "./document.js";
import { type FrontmatterResult, splitFrontmatter } from "./frontmatter.js";
import { type ScannedLine, scanLines, splitSourceLines, toSlice } from "./scan.js";
import { isTagsOnlyLine, tagsInLine, uniqueTags } from "./tags.js";

/*
 * The consumer half of Flashcard Markdown (§3.1): it MUST parse anything valid
 * correctly, and it MUST NOT refuse a file because one card in it is malformed. So
 * nothing here throws. Everything that departs from the grammar becomes a diagnostic
 * and the rest of the file still loads.
 */

/** Alt text is SHOULD, not MUST (§7), so the alt group matches empty. */
const IMAGE = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/gu;

const imagesIn = (lines: readonly ScannedLine[]): DeckImage[] =>
  lines
    .filter((line) => !line.inCode)
    .flatMap((line) =>
      [...line.text.matchAll(IMAGE)].map(([, alt = "", src = ""]) => ({ alt, src })),
    );

const tagsIn = (lines: readonly ScannedLine[]): string[] =>
  uniqueTags(lines.filter((line) => !line.inCode).flatMap((line) => tagsInLine(line.text)));

/**
 * Splits a card body at the first top-level `***`. Later ones are ordinary back
 * content: the first divides, and only the first (§5.3).
 */
const sliceOf = (lines: readonly ScannedLine[]): string => toSlice(lines.map((line) => line.text));

const splitAtSeparator = (
  lines: readonly ScannedLine[],
): { frontBody: string; back: string; hasSeparator: boolean } => {
  const at = lines.findIndex((line) => line.isSeparator && !line.inCode);

  if (at === -1) {
    return { back: sliceOf(lines), frontBody: "", hasSeparator: false };
  }

  return {
    back: sliceOf(lines.slice(at + 1)),
    frontBody: sliceOf(lines.slice(0, at)),
    hasSeparator: true,
  };
};

const emptyHeading = (): Diagnostic =>
  diagnostic(
    "malformed-card-skipped",
    "a card has an empty ## heading, which is its only identity, so it was skipped.",
  );

const preambleTag = (): Diagnostic =>
  diagnostic(
    "preamble-tag",
    "a tag appears above the first card, where version 1 of the format gives it no " +
      "meaning: it is neither a file tag nor a card tag. Move it into the frontmatter " +
      'under "tags" or into a card.',
  );

const toCard = (region: CardRegion, fileTags: readonly string[]): Card => {
  const cardTags = tagsIn(region.body);

  return {
    cardTags,
    headingText: region.headingText,
    images: imagesIn(region.body),
    tags: uniqueTags([...fileTags, ...cardTags]),
    ...splitAtSeparator(region.body),
  };
};

export interface ParseResult {
  readonly deck: Deck;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * One walk of the source: frontmatter split, line scan, document regions.
 *
 * Not exported from the package. It exists so `canonical.ts` can check a source and
 * parse it off the same walk, rather than running this three times for one deck.
 */
export interface Walk {
  readonly document: Document;
  readonly front: FrontmatterResult;
}

export const walkSource = (source: string): Walk => {
  const front = splitFrontmatter(splitSourceLines(source));

  return { document: splitDocument(scanLines(front.body, front.bodyStartLine)), front };
};

export const parseWalk = ({ document, front }: Walk): ParseResult => {
  const cards: Card[] = [];
  const diagnostics: Diagnostic[] = [...front.diagnostics, ...document.diagnostics];

  for (const region of document.regions) {
    /* The heading is mandatory and is the card's whole identity, so a card without one
       cannot be kept. The file still loads and every other card survives, which is
       what §3.1 obliges a consumer to do. */
    if (region.headingText === "") {
      diagnostics.push(emptyHeading());
    } else {
      cards.push(toCard(region, front.fileTags));
    }
  }

  /* A bare tag above the first card is neither a file tag nor a card tag in version 1.
     Dropping the preamble is conformant (§4.3); dropping a tag the user clearly meant
     as one, without a word, is what this names. */
  if (document.preambleLines.some((line) => !line.inCode && isTagsOnlyLine(line.text))) {
    diagnostics.push(preambleTag());
  }

  return {
    deck: deckOf({
      cards,
      fileTags: front.fileTags,
      frontmatter: front.data,
      preamble: document.preamble,
      title: document.title,
    }),
    diagnostics,
  };
};

export const parseMarkdown = (source: string): ParseResult => parseWalk(walkSource(source));
