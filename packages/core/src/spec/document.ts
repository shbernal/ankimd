import { atLine, type Diagnostic, diagnostic } from "../diagnostics.js";
import { CARD_DEPTH, type ScannedLine, TITLE_DEPTH, toSlice } from "./scan.js";

/*
 * The document grammar of §4, walked once.
 *
 *   [frontmatter] [# deck title] [preamble] [card]*
 *
 * A card begins at a `##` heading and ends at the next heading of depth <= 2 or at end
 * of file (§5.1). Nothing else ends one: not a blank line, not a thematic break, not
 * the end of a list.
 *
 * Both conformance classes need this walk. The consumer turns the regions into cards,
 * the producer checks them against canonical form, and neither has any business
 * disagreeing with the other about where a card starts.
 */

export interface CardRegion {
  readonly heading: ScannedLine;
  readonly headingText: string;
  /** The lines below the heading, untrimmed, so the blank line §5.4 wants is visible. */
  readonly body: readonly ScannedLine[];
}

export interface Document {
  readonly title: string | null;
  /** Content between the title and the first card; belongs to no card (§4.3). */
  readonly preambleLines: readonly ScannedLine[];
  readonly preamble: string | null;
  readonly regions: readonly CardRegion[];
  readonly diagnostics: readonly Diagnostic[];
}

interface OpenRegion {
  readonly heading: ScannedLine;
  readonly headingText: string;
  readonly body: ScannedLine[];
}

/** Everything the walk accumulates, so the per-line step takes one of them. */
interface Walk {
  title: string | null;
  region: "preamble" | "card" | "orphan";
  open: OpenRegion | null;
  readonly regions: CardRegion[];
  readonly preambleLines: ScannedLine[];
  readonly diagnostics: Diagnostic[];
}

const strayH1 = (text: string, line: number): Diagnostic =>
  atLine(
    diagnostic(
      "stray-h1",
      `a second "# ${text}" heading has no meaning in version 1 of the format; it ends ` +
        "the card above it and the content below it belongs to no card.",
    ),
    line,
  );

const closeRegion = (walk: Walk): void => {
  if (walk.open !== null) {
    walk.regions.push(walk.open);
    walk.open = null;
  }
};

/** Version 1 gives the first `#` one meaning and every later one none (§4.2, §5.1). */
const takeTitle = (walk: Walk, text: string, line: number): void => {
  if (walk.title === null && walk.regions.length === 0 && walk.region === "preamble") {
    walk.title = text;
    return;
  }

  walk.diagnostics.push(strayH1(text, line));
  walk.region = "orphan";
};

const step = (walk: Walk, line: ScannedLine): void => {
  const depth = line.heading?.depth ?? 0;
  const text = line.heading?.text ?? "";

  if (depth === TITLE_DEPTH) {
    closeRegion(walk);
    takeTitle(walk, text, line.number);
  } else if (depth === CARD_DEPTH) {
    closeRegion(walk);
    walk.open = { body: [], heading: line, headingText: text };
    walk.region = "card";
  } else if (walk.open !== null) {
    walk.open.body.push(line);
  } else if (walk.region === "preamble") {
    walk.preambleLines.push(line);
  }
};

export const splitDocument = (lines: readonly ScannedLine[]): Document => {
  const walk: Walk = {
    diagnostics: [],
    open: null,
    preambleLines: [],
    region: "preamble",
    regions: [],
    title: null,
  };

  for (const line of lines) {
    step(walk, line);
  }
  closeRegion(walk);

  const preamble = toSlice(walk.preambleLines.map((line) => line.text));

  return {
    diagnostics: walk.diagnostics,
    preamble: preamble || null,
    preambleLines: walk.preambleLines,
    regions: walk.regions,
    title: walk.title,
  };
};
