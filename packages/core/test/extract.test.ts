import type { AnkiNote, AnkiNotetype, AnkiPackage } from "@shbernal/anki-apkg-export";
import { describe, expect, it } from "vitest";

import { toApkg } from "../src/anki/export.js";
import { extractDeck, readDeck } from "../src/anki/extract.js";
import { localMedia } from "../src/anki/media.js";
import { checkCanonical } from "../src/spec/canonical.js";
import { FIXTURE_DIR, FIXTURE_NOW, readFixtureDeck } from "./_fixture-deck.js";

/*
 * A package back to a deck.
 *
 * Most of this works on a hand-built `AnkiPackage` rather than on bytes, because
 * the interesting cases are note types this package cannot write: cloze notes,
 * five-field note types, tags with characters the format has no room for. The
 * round trip through real bytes is the last suite.
 */

const BASIC: AnkiNotetype = { fields: ["Front", "Back"], id: 1, isCloze: false, name: "Basic" };
const CLOZE: AnkiNotetype = { fields: ["Text", "Extra"], id: 2, isCloze: true, name: "Cloze" };
const OCCLUSION: AnkiNotetype = {
  fields: ["Occlusion", "Image", "Header", "Back Extra", "Comments"],
  id: 3,
  isCloze: false,
  name: "Image Occlusion",
};

const note = (
  fields: readonly string[],
  tags: readonly string[] = [],
  mid = BASIC.id,
): AnkiNote => ({
  fields,
  id: 100 + fields.length,
  mid,
  tags,
});

const packageOf = (
  notes: readonly AnkiNote[],
  notetypes: readonly AnkiNotetype[] = [BASIC],
  media: ReadonlyMap<string, Uint8Array> = new Map(),
): AnkiPackage => ({ media, notes, notetypes, packageVersion: 1, schemaVersion: 11 });

describe("what a note becomes", () => {
  it("puts a one-line front on the heading and the whole body on the back", () => {
    expect.hasAssertions();

    const { deck } = extractDeck(packageOf([note(["Echolalia", "<ul><li>Repetition</li></ul>"])]));

    expect(deck.cards[0]?.headingText).toBe("Echolalia");
    expect(deck.cards[0]?.frontBody).toBe("");
    /* §5.3: with no `***`, the entire body is the back. */
    expect(deck.cards[0]?.hasSeparator).toBe(false);
    expect(deck.cards[0]?.back).toBe("- Repetition");
  });

  /*
   * A field written by RemNote is the path to the card rather than the card, and
   * its leaf is the question. The whole path stays in the front region, so the
   * nesting survives; the heading repeats the leaf rather than removing it.
   */
  it("takes the last line of a multi-line front as the heading", () => {
    expect.hasAssertions();

    const front = "<ul><li>Deck<ul><li>Section<ul><li>The question</li></ul></li></ul></li></ul>";
    const { deck } = extractDeck(packageOf([note([front, "The answer"])]));

    expect(deck.cards[0]?.headingText).toBe("The question");
    expect(deck.cards[0]?.frontBody).toBe("- Deck\n  - Section\n    - The question");
    expect(deck.cards[0]?.hasSeparator).toBe(true);
    expect(deck.cards[0]?.back).toBe("The answer");
  });

  /* Which is exactly what `toApkg` writes, so a deck of ours survives unchanged. */
  it("takes a leading h2 as the heading and the rest as the front region", () => {
    expect.hasAssertions();

    const front = '<h2 id="x">Named</h2>\n<p>Some context.</p>';
    const { deck } = extractDeck(packageOf([note([front, "back"])]));

    expect(deck.cards[0]?.headingText).toBe("Named");
    expect(deck.cards[0]?.frontBody).toBe("Some context.");
  });

  it("keeps nested lists as indentation rather than flattening them", () => {
    expect.hasAssertions();

    const back = "<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li></ul>";
    const { deck } = extractDeck(packageOf([note(["Q", back])]));

    expect(deck.cards[0]?.back).toBe("- a\n  - b\n    - c\n- d");
  });

  it("numbers an ordered list rather than bulleting it", () => {
    expect.hasAssertions();

    const back = "<ol><li>first</li><li>second</li><li>third</li></ol>";
    const { deck } = extractDeck(packageOf([note(["Q", back])]));

    expect(deck.cards[0]?.back).toBe("1. first\n2. second\n3. third");
  });

  it("keeps the elements Markdown has a spelling for", () => {
    expect.hasAssertions();

    const back = '<b>bold</b> <i>it</i> <code>c</code> x<sup>2</sup> <img src="a.png">';
    const { deck } = extractDeck(packageOf([note(["Q", back])]));

    expect(deck.cards[0]?.back).toBe("**bold** *it* `c` x<sup>2</sup> ![](a.png)");
  });

  /*
   * §5.1 makes `##` the card boundary, so a heading inside a field would split
   * the card in two when the file is read back. Anki's editor writes them.
   */
  it("demotes a heading inside a field so it cannot open a card", () => {
    expect.hasAssertions();

    const { deck } = extractDeck(packageOf([note(["Q", "<h2>Inner</h2><p>text</p>"])]));

    expect(deck.cards[0]?.back).toBe("### Inner\n\ntext");
    expect(deck.cards).toHaveLength(1);
  });

  /* A thematic break in a body is content, and `***` is not available for it. */
  it("writes a thematic break as dashes, never as the separator", () => {
    expect.hasAssertions();

    const { deck } = extractDeck(packageOf([note(["Q", "<p>a</p><hr><p>b</p>"])]));

    expect(deck.cards[0]?.back).toBe("a\n\n---\n\nb");
  });
});

describe("tags", () => {
  it("maps Anki's nesting back to the file's", () => {
    expect.hasAssertions();

    const { deck, diagnostics } = extractDeck(
      packageOf([note(["Q", "A"], ["botany", "plants::leaves"])]),
    );

    expect(deck.cards[0]?.tags).toStrictEqual(["botany", "plants/leaves"]);
    expect(diagnostics).toStrictEqual([]);
  });

  it("rewrites a tag with characters the format has no room for, and says so", () => {
    expect.hasAssertions();

    const { deck, diagnostics } = extractDeck(packageOf([note(["Q", "A"], ["needs review!"])]));

    expect(deck.cards[0]?.tags).toStrictEqual(["needs_review_"]);
    expect(diagnostics).toStrictEqual([
      expect.objectContaining({ cardIndex: 0, code: "tag-sanitized" }),
    ]);
  });

  it("leaves out a tag with no spelling at all, and says so", () => {
    expect.hasAssertions();

    const { deck, diagnostics } = extractDeck(packageOf([note(["Q", "A"], ["123", "kept"])]));

    expect(deck.cards[0]?.tags).toStrictEqual(["kept"]);
    expect(diagnostics).toStrictEqual([
      expect.objectContaining({ cardIndex: 0, code: "unrepresentable-content" }),
    ]);
  });
});

describe("notes this mapping cannot take", () => {
  /*
   * Measured across 9659 real notes, this skips one, and the one it skips is an
   * empty note rather than a note type the mapping cannot read. The report is one
   * line per reason rather than one per note: a collection where the mapping does
   * not apply has thousands it does not apply to.
   */
  it("counts cloze notes by note type rather than reporting each one", () => {
    expect.hasAssertions();

    const { deck, diagnostics } = extractDeck(
      packageOf(
        [
          note(["Kept", "A"]),
          note(["The {{c1::x}} does y", ""], [], CLOZE.id),
          note(["The {{c1::p}} does q", ""], [], CLOZE.id),
        ],
        [BASIC, CLOZE],
      ),
    );

    expect(deck.cards).toHaveLength(1);
    expect(diagnostics).toStrictEqual([
      expect.objectContaining({ cardIndex: null, code: "unrepresentable-content" }),
    ]);
    expect(diagnostics[0]?.message).toContain('2 note(s) of type "Cloze"');
  });

  it("skips a note type that is not a front and a back", () => {
    expect.hasAssertions();

    const { deck, diagnostics } = extractDeck(
      packageOf([note(["a", "b", "c", "d", "e"], [], OCCLUSION.id)], [BASIC, OCCLUSION]),
    );

    expect(deck.cards).toStrictEqual([]);
    expect(diagnostics[0]?.message).toContain("5 fields");
  });

  it("skips a note whose note type is not in the package", () => {
    expect.hasAssertions();

    const { diagnostics } = extractDeck(packageOf([note(["a", "b"], [], 99)]));

    expect(diagnostics[0]?.message).toContain("unknown 99");
  });

  /* §5.5: a card with nothing to ask has no identity, and §5.2 keys on the heading. */
  it("skips a note whose first field is empty", () => {
    expect.hasAssertions();

    const { deck, diagnostics } = extractDeck(
      packageOf([note(["", "orphaned"]), note(["Q", "A"])]),
    );

    expect(deck.cards).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("empty first field");
  });

  /* §5.5 makes an empty back a valid card, so it is kept rather than skipped. */
  it("keeps a note with an empty back", () => {
    expect.hasAssertions();

    const { deck, diagnostics } = extractDeck(packageOf([note(["Q", ""])]));

    expect(deck.cards[0]?.back).toBe("");
    expect(diagnostics).toStrictEqual([]);
  });
});

describe("media", () => {
  const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  it("returns only the files the extracted deck refers to", () => {
    expect.hasAssertions();

    const available = new Map([
      ["used.png", image],
      ["unused.png", image],
    ]);
    const { diagnostics, media } = extractDeck(
      packageOf([note(["Q", '<img src="used.png">'])], [BASIC], available),
    );

    expect([...media.keys()]).toStrictEqual(["used.png"]);
    expect(diagnostics).toStrictEqual([]);
  });

  it("reports a local image the package does not carry", () => {
    expect.hasAssertions();

    const { diagnostics } = extractDeck(packageOf([note(["Q", '<img src="gone.png">'])]));

    expect(diagnostics).toStrictEqual([
      expect.objectContaining({ cardIndex: 0, code: "unresolved-image" }),
    ]);
  });

  /* Most images in a real collection are remote URLs, which need no media entry. */
  it("says nothing about a remote image", () => {
    expect.hasAssertions();

    const { deck, diagnostics } = extractDeck(
      packageOf([note(["Q", '<img src="https://example.org/a.png">'])]),
    );

    expect(diagnostics).toStrictEqual([]);
    expect(deck.cards[0]?.images).toStrictEqual([{ alt: "", src: "https://example.org/a.png" }]);
  });

  /* A `data:` URI is the image, not a name for one, so nothing is missing. */
  it("says nothing about an inline data URI", () => {
    expect.hasAssertions();

    const src = "data:image/png;base64,iVBORw0KGgo=";
    const { deck, diagnostics } = extractDeck(packageOf([note(["Q", `<img src="${src}">`])]));

    expect(diagnostics).toStrictEqual([]);
    expect(deck.cards[0]?.images).toStrictEqual([{ alt: "", src }]);
  });
});

describe("the deck a package becomes", () => {
  it("is canonical Flashcard Markdown", () => {
    expect.hasAssertions();

    const { markdown } = extractDeck(packageOf([note(["Q", "<ul><li>A</li></ul>"], ["t"])]), {
      title: "Deck",
    });

    expect(checkCanonical(markdown)).toStrictEqual([]);
    expect(markdown).toBe("# Deck\n\n## Q\n\n- A\n\n#t\n");
  });

  /* §4.2: a deck may have no title, and Anki keeps deck names on cards rather
     than on notes, so there is none to read off a package. */
  it("has no title unless the caller supplies one", () => {
    expect.hasAssertions();

    const { deck } = extractDeck(packageOf([note(["Q", "A"])]));

    expect(deck.title).toBeNull();
    expect(deck.titleSource).toBe("none");
  });
});

describe("a deck this package wrote, read back", () => {
  it("comes back with its cards, tags and images", async () => {
    expect.hasAssertions();

    const original = await readFixtureDeck();
    const { data } = await toApkg(original, {
      now: FIXTURE_NOW,
      resolveMedia: localMedia(FIXTURE_DIR),
    });
    const { deck, media } = await readDeck(data, { title: original.title });

    expect(deck.cards.map((card) => card.headingText)).toStrictEqual(
      original.cards.map((card) => card.headingText),
    );
    expect(deck.cards[0]?.tags).toStrictEqual(["botany", "plants/leaves", "morphology"]);
    expect(media.size).toBe(1);
    expect(deck.title).toBe("Botany");
  });

  /*
   * The fixpoint, which is the promise that matters: the first pass is lossy and
   * `docs/round-trip.md` says what it loses, but the second pass changes nothing.
   * A deck that kept drifting would make every re-export a diff.
   */
  it("reaches a fixpoint after one pass", async () => {
    expect.hasAssertions();

    const original = await readFixtureDeck();
    const once = await toApkg(original, { now: FIXTURE_NOW });
    const first = await readDeck(once.data, { title: original.title });
    const twice = await toApkg(first.deck, { now: FIXTURE_NOW });
    const second = await readDeck(twice.data, { title: first.deck.title });

    expect(second.markdown).toBe(first.markdown);
  });
});
