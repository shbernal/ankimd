import {
  type AnkiNote,
  type AnkiNotetype,
  type AnkiPackage,
  readApkg,
} from "@shbernal/anki-apkg-export";

import { type Card, type Deck, deckOf } from "../deck.js";
import { atCard, type Diagnostic, diagnostic } from "../diagnostics.js";
import { parseMarkdown } from "../spec/parse.js";
import { renderMarkdown } from "../spec/render.js";
import { fromAnkiTags } from "../spec/tags.js";
import { htmlToMarkdown, splitFront } from "./markdown.js";
import { isRemote } from "./media.js";

/*
 * An Anki package, back to a deck.
 *
 * This direction is lossy and the losses are documented rather than hidden; see
 * `docs/round-trip.md` for the table. §3.3 is what makes that a requirement:
 * everything the format cannot express has to be reported.
 *
 * The mapping is basic notes only. Every note type in this package's model is a
 * list of field names, and only a two-field one has a front and a back; a cloze
 * note has neither. Measured across 9659 real notes, that skips one, and the one
 * it skips is an empty note rather than a note type this cannot read. Every
 * skipped note is counted and named.
 */

/** A basic note has exactly these: one field to ask with and one to answer with. */
const BASIC_FIELD_COUNT = 2;

export interface ExtractOptions {
  /**
   * The deck's title.
   *
   * Anki keeps deck names on cards rather than on notes, and a package can hold
   * several decks, so there is no one name to read off the notes. The caller
   * knows what it opened; without one the deck has no title, which §4.2 allows.
   * `null` is accepted so that a `Deck`'s own title can be passed straight in.
   */
  readonly title?: string | null;
}

export interface ExtractResult {
  readonly deck: Deck;
  readonly diagnostics: readonly Diagnostic[];
  /** The Markdown the deck was built from, which is canonical form. */
  readonly markdown: string;
  /** Only the media the extracted deck refers to, keyed by the name it uses. */
  readonly media: ReadonlyMap<string, Uint8Array>;
}

/** One note that could not be mapped, so that the report can count its kind. */
interface Skipped {
  readonly notetype: string;
  readonly why: string;
}

/** How many notes were skipped for one reason, and what that reason was. */
interface Counted {
  readonly count: number;
  readonly reason: Skipped;
}

/** A card built from a note, and everything that had to be said to build it. */
interface Mapped {
  readonly card: Card;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * One diagnostic per reason rather than one per note.
 *
 * A collection this mapping does not apply to has thousands of notes it does not
 * apply to, and a line each would be a wall rather than a report. What §3.3 asks
 * is that the loss be named, and a count with the note type on it names it better
 * than the same sentence three thousand times over.
 */
const skippedDiagnostics = (skipped: readonly Skipped[]): Diagnostic[] => {
  const counts = new Map<string, Counted>();

  for (const reason of skipped) {
    const key = `${reason.notetype}\u0000${reason.why}`;
    counts.set(key, { count: (counts.get(key)?.count ?? 0) + 1, reason });
  }

  return [...counts.values()].map(({ count, reason }: Readonly<Counted>) =>
    diagnostic(
      "unrepresentable-content",
      `${count} note(s) of type "${reason.notetype}" ${reason.why}. They are not in the deck.`,
    ),
  );
};

const cardFrom = (note: Readonly<AnkiNote>, cardIndex: number): Mapped | null => {
  const [frontHtml = "", backHtml = ""] = note.fields;
  const { body, heading } = splitFront(frontHtml);

  if (heading === "") {
    return null;
  }

  const { diagnostics, tags } = fromAnkiTags(note.tags);

  return {
    card: {
      back: htmlToMarkdown(backHtml),
      cardTags: tags,
      frontBody: body,
      hasSeparator: body !== "",
      headingText: heading,
      images: [],
      tags,
    },
    diagnostics: atCard(diagnostics, cardIndex),
  };
};

/** Why a note of this type cannot become a card, or `null` when it can. */
const refuse = (notetype: Readonly<AnkiNotetype> | undefined): string | null => {
  if (notetype === undefined) {
    return "belong to a note type that is not in the package";
  }

  if (notetype.isCloze) {
    return "are cloze deletions, which this format has no syntax for";
  }

  if (notetype.fields.length !== BASIC_FIELD_COUNT) {
    return `have ${notetype.fields.length} fields rather than a front and a back`;
  }

  return null;
};

interface Mapping {
  readonly cards: Card[];
  readonly diagnostics: Diagnostic[];
}

const mapNotes = (pkg: Readonly<AnkiPackage>): Mapping => {
  const byId = new Map(
    pkg.notetypes.map((notetype: Readonly<AnkiNotetype>) => [notetype.id, notetype]),
  );
  const cards: Card[] = [];
  const diagnostics: Diagnostic[] = [];
  const skipped: Skipped[] = [];

  for (const note of pkg.notes) {
    const notetype = byId.get(note.mid);
    const why = refuse(notetype);
    const mapped = why === null ? cardFrom(note, cards.length) : null;

    if (mapped === null) {
      skipped.push({
        notetype: notetype?.name ?? `<unknown ${note.mid}>`,
        why: why ?? "have an empty first field, which leaves nothing to ask",
      });
    } else {
      cards.push(mapped.card);
      diagnostics.push(...mapped.diagnostics);
    }
  }

  return { cards, diagnostics: [...diagnostics, ...skippedDiagnostics(skipped)] };
};

/**
 * The media the deck actually refers to, and a word about the images it names
 * that the package does not carry.
 *
 * A reference the package has no file for is ordinary rather than broken: most
 * images in a real collection are remote URLs, which need no media entry at all.
 * One that looks like a filename and is not there is a genuine loss, and says so.
 */
const usedMedia = (
  deck: Readonly<Deck>,
  available: ReadonlyMap<string, Uint8Array>,
): { diagnostics: Diagnostic[]; media: Map<string, Uint8Array> } => {
  const diagnostics: Diagnostic[] = [];
  const media = new Map<string, Uint8Array>();

  deck.cards.forEach((card: Readonly<Card>, cardIndex: number) => {
    for (const { src } of card.images) {
      const data = available.get(src);

      if (data !== undefined) {
        media.set(src, data);
      } else if (!isRemote(src)) {
        diagnostics.push(
          diagnostic(
            "unresolved-image",
            `the image "${src}" is referenced by a note and is not in the package. ` +
              `It stays in the card as written.`,
            cardIndex,
          ),
        );
      }
    }
  });

  return { diagnostics, media };
};

/**
 * Turn what a package holds into a deck.
 *
 * The deck is built by writing canonical Markdown and reading it back, rather
 * than by assembling the model directly. That is not a detour: it is what makes
 * the result a deck someone else's parser would agree with, images and tags
 * included, and it surfaces anything the conversion produced that the format
 * cannot read as a diagnostic instead of leaving it in the model.
 */
export const extractDeck = (
  pkg: Readonly<AnkiPackage>,
  options: Readonly<ExtractOptions> = {},
): ExtractResult => {
  const mapped = mapNotes(pkg);
  const draft: Deck = deckOf({ cards: mapped.cards, title: options.title ?? null });

  const markdown = renderMarkdown(draft);
  const parsed = parseMarkdown(markdown);
  const used = usedMedia(parsed.deck, pkg.media);

  return {
    deck: parsed.deck,
    diagnostics: [...mapped.diagnostics, ...parsed.diagnostics, ...used.diagnostics],
    markdown,
    media: used.media,
  };
};

/** `extractDeck`, from the bytes of a package rather than from a read one. */
export const readDeck = async (
  apkg: Uint8Array,
  options: Readonly<ExtractOptions> = {},
): Promise<ExtractResult> => extractDeck(await readApkg(apkg), options);
