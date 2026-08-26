import { describe, expect, it } from "vitest";

import { toApkg } from "../src/anki/export.js";
import type { Deck } from "../src/deck.js";
import { parseMarkdown } from "../src/spec/parse.js";
import { casesIn, readInput } from "./_corpus.js";
import { readApkg } from "./_read-apkg.js";

/** Pinned, so a package built from a fixture is the same bytes on every run. */
const CORPUS_NOW = 1_482_680_798_652;

/** The corpus has files with no title, and Anki needs a name for the deck regardless. */
const nameOf = (deck: Readonly<Deck>, id: string): string => deck.title ?? id;

/*
 * §3.3 from the far end of the pipeline. A canonical file is a file with nothing wrong
 * in it, so converting one has nothing to report: any diagnostic here is content that
 * reached the package boundary and could not cross it.
 *
 * No media resolver is given, which is why `canonical/images` is quiet too. Its two
 * references are left exactly as written, and whether a reference resolves is a fact
 * about a filesystem rather than about the deck.
 */
describe("the corpus converted to Anki packages", () => {
  it.each(casesIn("canonical"))("$id converts with nothing to report", async ({ id }) => {
    expect.hasAssertions();

    const { deck } = parseMarkdown(await readInput(id));
    const { data, diagnostics } = await toApkg(deck, {
      deckName: nameOf(deck, id),
      now: CORPUS_NOW,
    });

    const { notes } = await readApkg(data);

    expect(diagnostics).toStrictEqual([]);
    expect(notes).toHaveLength(deck.cards.length);
  });
});
