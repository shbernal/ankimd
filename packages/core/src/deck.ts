/*
 * The deck model every conversion in this package goes through.
 *
 * Markdown, Anki packages and whatever comes next each convert to and from this one
 * type rather than to each other, so a new format costs two functions instead of one
 * per existing format.
 *
 * Every text field is a verbatim slice of the source it came from, normalized only by
 * trimming leading and trailing blank lines. §5.4 makes a card body arbitrary Markdown,
 * and keeping it verbatim is what lets `renderMarkdown` reproduce a deck byte for byte.
 * The implementations this replaces both had scanners that rebuilt bodies from what
 * they recognized, which silently dropped nested list items and `###` headings.
 *
 * Every field is `readonly`, deeply. Nothing in this package mutates a deck: each
 * converter reads one and returns a new one, so saying so in the type costs nothing and
 * lets a caller pass the same deck to two of them without wondering.
 */

/**
 * An image as the card declares it, which is the level §7 defines images at.
 *
 * Inline form only. A reference-style image (`![alt][ref]`) is resolved by the Markdown
 * renderer downstream and reaches the media pipeline as an `<img>` like any other, so
 * nothing is lost by it. It is just not visible this early.
 */
export interface DeckImage {
  readonly alt: string;
  readonly src: string;
}

export interface Card {
  /** The heading's text, without the `## ` marker. A card's whole identity (§5.2). */
  readonly headingText: string;
  /** Body before the first `***`; `""` when there is none. */
  readonly frontBody: string;
  /** Body after the separator, or the whole body without one; `""` when there is none. */
  readonly back: string;
  /**
   * Whether the card body carried a `***`.
   *
   * A card can have a separator and an empty front body, which §5.3 allows and two
   * cases in the conformance corpus rely on. Without this, that card and one written
   * with no separator at all collapse to the same value, and re-rendering the deck
   * produces a different file.
   */
  readonly hasSeparator: boolean;
  /** Tags found in this card. */
  readonly cardTags: readonly string[];
  /** The effective set: file tags union card tags, deduplicated (§6.1). */
  readonly tags: readonly string[];
  readonly images: readonly DeckImage[];
}

export interface Deck {
  readonly title: string | null;
  readonly titleSource: "heading" | "none";
  /** The parsed frontmatter block, `{}` when there is none. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly fileTags: readonly string[];
  /** Content between the title and the first card; belongs to no card (§4.3). */
  readonly preamble: string | null;
  readonly cards: readonly Card[];
}
