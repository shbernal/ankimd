import { describe, expect, it } from "vitest";

import { toApkg } from "../src/anki/export.js";
import { readDeck } from "../src/anki/extract.js";
import type { Deck } from "../src/deck.js";
import { checkCanonical } from "../src/spec/canonical.js";
import { parseMarkdown } from "../src/spec/parse.js";
import { casesIn, readInput } from "./_corpus.js";
import { readApkg } from "./_read-apkg.js";

/** Pinned, so a package built from a fixture is the same bytes on every run. */
const CORPUS_NOW = 1_482_680_798_652;

/** One case, and whether taking it to a package and back changed the file. */
interface RoundTripped {
  readonly id: string;
  readonly unchanged: boolean;
}

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

/*
 * The round trip, and the promise that makes it usable.
 *
 * Markdown to package and back is lossy, and `docs/round-trip.md` is the table of
 * what it loses. What must not be lossy is doing it again: the second pass has to
 * produce the file the first one did, byte for byte. A conversion that kept drifting
 * would turn every re-export into a diff and would eventually stop being the deck
 * anyone wrote.
 */
describe("the corpus taken to a package and back", () => {
  const roundTrip = async (markdown: string, id: string): Promise<string> => {
    const { deck } = parseMarkdown(markdown);
    const { data } = await toApkg(deck, { deckName: nameOf(deck, id), now: CORPUS_NOW });
    const extracted = await readDeck(data, { title: deck.title });

    return extracted.markdown;
  };

  it.each(casesIn("canonical"))("$id reaches a fixpoint after one pass", async ({ id }) => {
    expect.hasAssertions();

    const first = await roundTrip(await readInput(id), id);
    const second = await roundTrip(first, id);

    expect(second).toBe(first);
  });

  it.each(casesIn("canonical"))("$id comes back as canonical form", async ({ id }) => {
    expect.hasAssertions();

    const extracted = await roundTrip(await readInput(id), id);

    expect(checkCanonical(extracted)).toStrictEqual([]);
  });

  /*
   * Nine of the fourteen survive unchanged. The five that do not are the whole of
   * the loss table's first half, and naming them here is what keeps a sixth from
   * joining them unnoticed.
   */
  it("changes only the cases the loss table accounts for", async () => {
    expect.hasAssertions();

    const results = await Promise.all(
      casesIn("canonical").map(async ({ id }) => {
        const input = await readInput(id);

        return { id, unchanged: (await roundTrip(input, id)) === input };
      }),
    );

    const changed = results
      .filter((result: Readonly<RoundTripped>) => !result.unchanged)
      .map((result: Readonly<RoundTripped>) => result.id);

    expect(changed).toStrictEqual([
      /* Frontmatter: Anki has nowhere to put it. File tags survive as card tags,
         because §6.1 makes them apply to every card anyway. */
      "canonical/file-and-card-tags",
      /* A paragraph's soft line breaks are not in the HTML they render to. */
      "canonical/front-back-separator",
      "canonical/minimal-deck",
      /* A preamble belongs to no card, so no note carries it. */
      "canonical/preamble",
      /* A `***` with an empty front region: the note's first field is the heading
         and nothing else, so there is nothing left for the separator to divide. */
      "canonical/separator-in-code-fence",
      "canonical/thematic-break-is-content",
    ]);
  });
});
