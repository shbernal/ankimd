import TurndownService from "turndown";

/*
 * The HTML an Anki field holds, back to Markdown.
 *
 * This is the direction with something to lose, and the losses are the point of
 * the module. A field is arbitrary HTML written by Anki's editor, by RemNote's
 * exporter or by hand, and Flashcard Markdown has no syntax for most of what
 * that can carry.
 *
 * Two rules keep the result readable and the losses honest. Nothing is dropped in
 * silence: an element with no Markdown spelling contributes its text, and one with
 * no Markdown spelling at all is kept as the HTML it was, which is valid Markdown.
 * And nothing produced here may open a card: `##` is the card boundary (§5.1), so
 * a heading inside a field is demoted rather than emitted as written.
 */

/**
 * The little of a DOM node the list rule needs.
 *
 * `lib.dom` is deliberately not in this package's `types`: it is a Node library,
 * and turndown parses with its own bundled DOM rather than the browser's. This
 * restates what the rule reads instead of pulling every browser global in for it.
 */
interface ListNode {
  readonly childNodes: readonly ListNode[];
  readonly nextSibling: ListNode | null;
  readonly nodeName: string;
  /** Never null here: turndown walks a tree it built, so every item is in one. */
  readonly parentNode: ListNode;
}

/** Canonical form nests a list by two spaces, which is the width of `- `. */
const INDENT = "  ";

/** The shallowest heading a card body may carry: `#` and `##` are the document's. */
const BODY_HEADING = "###";

const ORDERED_LIST = "OL";

/**
 * Turndown's own list rule writes `-   item` and indents four spaces. Canonical form
 * writes `- item` and indents two, and a deck extracted from Anki has to be canonical
 * rather than merely valid.
 */
const listItem = (content: string, node: unknown): string => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see ListNode.
  const item = node as ListNode;
  const body = content.replace(/^\n+/u, "").replace(/\n+$/u, "\n").replaceAll("\n", `\n${INDENT}`);

  return `${orderedMarker(item)}${body}${item.nextSibling === null ? "" : "\n"}`;
};

const createService = (): TurndownService => {
  const service = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    headingStyle: "atx",
    /* Never `***`, which is the front/back separator (§5.3). A thematic break
       inside a card body is content, and writing it the other way keeps the two
       from being confused for each other. */
    hr: "---",
    strongDelimiter: "**",
  });

  service.addRule("listItem", { filter: "li", replacement: listItem });

  /*
   * A `#` or `##` inside a field would open a card when the file is read back
   * (§5.1). Anki fields do carry them: its editor offers headings, and a pasted
   * page brings whatever it had. Demoting is the one transformation here that
   * changes structure, and it is the alternative to producing a file that means
   * something different from the deck it came from.
   */
  service.addRule("demotedHeading", {
    filter: ["h1", "h2"],
    replacement: (content: string) => `\n\n${BODY_HEADING} ${content.trim()}\n\n`,
  });

  /*
   * Markdown has no superscript or subscript, and Anki's editor writes both. The
   * HTML is valid Markdown as it stands, so keeping it loses nothing at all.
   */
  service.keep(["sup", "sub"]);

  return service;
};

/** `1. `, `2. ` and so on inside an ordered list, `- ` everywhere else. */
const orderedMarker = (item: Readonly<ListNode>): string => {
  const parent = item.parentNode;

  if (parent.nodeName !== ORDERED_LIST) {
    return "- ";
  }

  const index = parent.childNodes
    .filter((child: Readonly<ListNode>) => child.nodeName === "LI")
    .indexOf(item);

  return `${index + 1}. `;
};

/**
 * One service per conversion is wasteful, and one per process is a shared mutable
 * object. One per module is neither: the service holds only its rules, and every
 * call passes its own string through.
 */
const service = createService();

/** One field's HTML as Markdown, with leading and trailing blank lines trimmed. */
export const htmlToMarkdown = (html: string): string => service.turndown(html).trim();

/** A leading `<h2>`, which is what this package's own writer puts a heading in. */
const LEADING_HEADING = /^\s*<h2\b[^>]*>([\s\S]*?)<\/h2>/iu;

/** Markers that open a line but are not part of the text on it. */
const LINE_MARKERS = /^(?:[-*+]\s+|\d+\.\s+|>\s*|#{1,6}\s+)+/u;

/** A closing sequence, which §5.2 strips from a heading, so it cannot be written. */
const CLOSING_SEQUENCE = /\s+#+$/u;

/**
 * A single line of heading text, out of a block of Markdown.
 *
 * §5.2 makes the heading a card's whole identity, and it has to be one line. The
 * last non-empty line is what that is: a field written by RemNote is the path to
 * the card rather than the card, and its leaf is the question being asked. Across
 * the decks this was measured on, the first line gives 24 distinct headings for
 * 1351 notes and the last gives 1343.
 */
export const headingTextOf = (markdown: string): string =>
  (markdown.split("\n").findLast((line) => line.trim() !== "") ?? "")
    .trim()
    .replace(LINE_MARKERS, "")
    .replace(CLOSING_SEQUENCE, "")
    .trim();

/** The front field split into the heading it opens with, if any, and the rest. */
export interface SplitFront {
  readonly body: string;
  readonly heading: string;
}

/**
 * Split a front field into a heading and a body.
 *
 * A field this package wrote opens with the `<h2>` it rendered the heading into,
 * and taking it back out is what makes a deck survive Markdown to package to
 * Markdown unchanged. A field written by anything else has no heading in it, so
 * one is read off the body and the body is kept whole: the heading repeats its
 * last line rather than removing it, which keeps a nested list intact.
 */
export const splitFront = (html: string): SplitFront => {
  const found = LEADING_HEADING.exec(html);

  if (found === null) {
    const body = htmlToMarkdown(html);

    /* A front that is one line *is* the heading, and repeating it as a body
       would give every such card an empty front region and a `***` with nothing
       on either side of it. */
    if (body.split("\n").filter((line) => line.trim() !== "").length === 1) {
      return { body: "", heading: headingTextOf(body) };
    }

    return { body, heading: headingTextOf(body) };
  }

  return {
    body: htmlToMarkdown(html.slice(found[0].length)),
    heading: headingTextOf(htmlToMarkdown(found[1] ?? "")),
  };
};
