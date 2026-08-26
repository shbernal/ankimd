import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import AnkiExport, { type MediaData, type TemplateOptions } from "@shbernal/anki-apkg-export";

import type { Card, Deck } from "../deck.js";
import { type Diagnostic, diagnostic, reasonOf } from "../diagnostics.js";
import { extractTagLines } from "../spec/render.js";
import { toAnkiTags } from "../spec/tags.js";
import { createHtmlRenderer, type Highlighter, type HtmlRenderer } from "./html.js";
import { createMediaCollector, type MediaCollector, type MediaResolver } from "./media.js";

/*
 * A deck to an Anki package.
 *
 * The mapping is narrow on purpose. Anki's basic notetype has two fields, and this
 * writes the card's front into the first and its back into the second; the `***` of
 * §5.3 is the split, and the heading is part of the front. Nothing here decides what a
 * deck is called, where its images live or how its code blocks are coloured: those are
 * the caller's, and they arrive as options rather than as configuration this package
 * goes looking for.
 */

/** A file to ship that no card refers to, such as a stylesheet the template loads. */
export interface PackagedFile {
  readonly data: MediaData;
  readonly filename: string;
}

export interface ApkgOptions {
  /** Overrides the deck's own title, which is otherwise the Anki deck's name. */
  readonly deckName?: string;
  readonly highlight?: Highlighter;
  /** Extra files to ship, added before any image so that their indices do not move. */
  readonly media?: readonly PackagedFile[];
  /**
   * The epoch-millisecond instant to build at, defaulting to now. Every timestamp in
   * the package derives from this one reading, so a fixed value makes the bytes
   * reproducible across processes.
   */
  readonly now?: number;
  /** How to turn an image reference into bytes; without one, references stay as written. */
  readonly resolveMedia?: MediaResolver;
  readonly template?: Readonly<TemplateOptions>;
}

export interface ApkgResult {
  readonly data: Buffer;
  /**
   * Everything the conversion had to say: the cards' diagnostics first, then the
   * images'. Both groups are in card order.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/** The two fields, as Markdown, with the tags-only lines of §6.3 taken out. */
const cardMarkdown = (card: Readonly<Card>): { back: string; front: string } => ({
  back: extractTagLines(card.back).body,
  /* The heading is the card's identity (§5.2) and part of what the reviewer is asked,
     so it is rendered into the field rather than only used to find the card. */
  front: [`## ${card.headingText}`, extractTagLines(card.frontBody).body]
    .filter((part) => part !== "")
    .join("\n\n"),
});

const deckNameOf = (deck: Readonly<Deck>, override?: string): string => {
  const name = override ?? deck.title ?? "";

  if (name.trim() === "") {
    throw new Error(
      "This deck has no name: it carries no title heading and no deckName option was " +
        "given. Anki needs one, and what to fall back to is a decision this package " +
        "cannot make.",
    );
  }

  return name;
};

/** Where a converted card goes. Narrower than the exporter, which owns much more. */
type AddNote = (front: string, back: string, tags: readonly string[]) => void;

/** Where a file to ship goes, under the name the cards reference it by. */
type AddFile = (filename: string, data: MediaData) => void;

/** The rendered fields of one card, in the order Anki stores them. */
interface Fields {
  readonly back: string;
  readonly front: string;
}

/**
 * Two cards identical in both fields are one note to Anki, which identifies a note by
 * its content: the second would silently replace the first rather than join it. That
 * cannot be prevented from here, so it is reported and the duplicate is left out, which
 * is what would have become of it anyway.
 */
const duplicateOf = (card: Readonly<Card>, cardIndex: number, first: number): Diagnostic =>
  diagnostic(
    "unrepresentable-content",
    `this card renders to the same front and back as card ${first + 1} ` +
      `("${card.headingText}"). Anki identifies a note by its content, so the two ` +
      `cannot be kept apart; only one of them is in the package.`,
    cardIndex,
  );

/**
 * The exporter refuses a note Anki would drop on import. That is a §5.5 degenerate card
 * meeting a format with no room for it, and §3.1 forbids refusing the rest over it.
 */
const refused = (error: unknown, cardIndex: number): Diagnostic =>
  diagnostic("malformed-card-skipped", reasonOf(error), cardIndex);

/**
 * Converts one card at a time, in deck order.
 *
 * The order is load bearing three times over: note ids and positions are claimed as
 * cards arrive, media entries are numbered as they are first referenced, and a
 * duplicate is only a duplicate of something already written. A converter that ran
 * cards concurrently would produce a different package on every run.
 */
const createCardWriter = (addNote: AddNote, html: HtmlRenderer, media: MediaCollector) => {
  const seen = new Map<string, number>();

  const render = async (card: Readonly<Card>, cardIndex: number): Promise<Fields> => {
    const source = cardMarkdown(card);
    const front = await media.rewrite(await html(source.front), cardIndex);
    const back = await media.rewrite(await html(source.back), cardIndex);

    return { back, front };
  };

  const write = (card: Readonly<Card>, cardIndex: number, fields: Readonly<Fields>) => {
    const { diagnostics, tags } = toAnkiTags(card.tags);
    const found = diagnostics.map(({ code, message }) => diagnostic(code, message, cardIndex));
    /* Both fields, so that duplicate fronts with different backs stay two cards, which
       is what §5.5 makes them and what Anki keeps them as. */
    const identity = JSON.stringify(fields);
    const first = seen.get(identity);

    if (first !== undefined) {
      found.push(duplicateOf(card, cardIndex, first));

      return found;
    }

    try {
      addNote(fields.front, fields.back, tags);
      seen.set(identity, cardIndex);
    } catch (error) {
      found.push(refused(error, cardIndex));
    }

    return found;
  };

  return async (card: Readonly<Card>, cardIndex: number): Promise<Diagnostic[]> =>
    write(card, cardIndex, await render(card, cardIndex));
};

const addFiles = (
  addFile: AddFile,
  files: ReadonlyMap<string, Uint8Array>,
  extra: readonly PackagedFile[],
): void => {
  for (const { filename, data } of extra) {
    addFile(filename, data);
  }

  for (const [filename, data] of files) {
    addFile(filename, data);
  }
};

export const toApkg = async (
  deck: Readonly<Deck>,
  options: Readonly<ApkgOptions> = {},
): Promise<ApkgResult> => {
  const exporter = await AnkiExport(
    deckNameOf(deck, options.deckName),
    options.template,
    options.now === undefined ? {} : { now: options.now },
  );

  /* The exporter holds a sql.js database, which is WASM memory no garbage collector
     reclaims, so it is released whatever happens above it. */
  try {
    const media = createMediaCollector(options.resolveMedia);
    const html = createHtmlRenderer(options.highlight);
    const addCard = createCardWriter(
      (front, back, tags) => {
        exporter.addCard(front, back, { tags });
      },
      html,
      media,
    );
    const found: Diagnostic[] = [];

    for (const [cardIndex, card] of deck.cards.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- see createCardWriter: order is output.
      found.push(...(await addCard(card, cardIndex)));
    }

    addFiles(
      (filename, data) => {
        exporter.addMedia(filename, data);
      },
      media.files,
      options.media ?? [],
    );

    return { data: await exporter.save(), diagnostics: [...found, ...media.diagnostics] };
  } finally {
    exporter.close();
  }
};

/** `toApkg`, written to `target`, whose parent directories are created if missing. */
export const writeApkg = async (
  deck: Deck,
  target: string,
  options: Readonly<ApkgOptions> = {},
): Promise<readonly Diagnostic[]> => {
  const { data, diagnostics } = await toApkg(deck, options);

  await mkdir(path.dirname(path.resolve(target)), { recursive: true });
  await writeFile(target, data);

  return diagnostics;
};
