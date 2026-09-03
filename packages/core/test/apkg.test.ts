import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Deck, deckOf } from "../src/deck.js";
import { localMedia, toApkg, writeApkg } from "../src/index.js";
import { parseMarkdown } from "../src/spec/parse.js";
import { FIXTURE_DIR, FIXTURE_NOW, readFixtureDeck } from "./_fixture-deck.js";
import { readApkg } from "./_read-apkg.js";

const fixturePath = path.join(FIXTURE_DIR, "deck.apkg");

/**
 * `pnpm run fixture:regen` adopts an intended change by rerunning this file with
 * UPDATE_FIXTURE set, which writes the package just built back over the fixture.
 * Regenerating through the same definition the assertion uses is what stops the two
 * from drifting apart.
 */
const matchesFixture = async (data: Buffer): Promise<boolean> => {
  if (process.env.UPDATE_FIXTURE !== undefined) {
    await writeFile(fixturePath, data);

    return true;
  }

  return data.equals(await readFile(fixturePath));
};

const deckFrom = (source: string): Deck => parseMarkdown(source).deck;

/** The stylesheet the caller supplies, plus the one image the fixture deck carries. */
const EXTRA_PLUS_IMAGE = 2;

/** Two fronts that read the same, kept apart because their backs do not. */
const BOTH_CARDS = 2;

describe("a deck converted to an Anki package", () => {
  let fixture: Deck;

  beforeAll(async () => {
    fixture = await readFixtureDeck();
  });

  it("is byte-identical to the committed fixture", async () => {
    expect.hasAssertions();

    const { data } = await toApkg(fixture, {
      now: FIXTURE_NOW,
      resolveMedia: localMedia(FIXTURE_DIR),
    });

    await expect(matchesFixture(data)).resolves.toBe(true);
  });

  it("produces the same bytes twice for the same instant", async () => {
    expect.hasAssertions();

    const first = await toApkg(fixture, { now: FIXTURE_NOW });
    const second = await toApkg(fixture, { now: FIXTURE_NOW });

    expect(first.data.equals(second.data)).toBe(true);
  });

  it("puts the heading in the front field and what follows the separator in the back", async () => {
    expect.hasAssertions();

    const { data } = await toApkg(fixture, { now: FIXTURE_NOW });
    const { notes } = await readApkg(data);

    expect(notes[0]?.front).toContain("<h2>Leaf venation patterns</h2>");
    expect(notes[0]?.back).toContain("Parallel venation is typical of monocots");
    /* The back of a card written without a `***` is its whole body. */
    expect(notes[1]?.front).toContain("<h2>Which pigment absorbs red light?</h2>");
    expect(notes[1]?.back).toContain("Chlorophyll <em>a</em>");
  });

  it("names the deck after its title, and takes an override instead", async () => {
    expect.hasAssertions();

    const titled = await toApkg(fixture, { now: FIXTURE_NOW });
    const renamed = await toApkg(fixture, { deckName: "Field notes", now: FIXTURE_NOW });
    const titledPackage = await readApkg(titled.data);
    const renamedPackage = await readApkg(renamed.data);

    expect(titledPackage.name).toBe("Botany");
    expect(renamedPackage.name).toBe("Field notes");
  });

  it("refuses a deck with no title and no name, rather than inventing one", async () => {
    expect.hasAssertions();

    const untitled = deckFrom("## Kolmogorov complexity\n\n- Uncomputable in general\n");

    await expect(toApkg(untitled)).rejects.toThrow(/no name/u);
    await expect(toApkg(untitled, { deckName: "Complexity" })).resolves.toBeDefined();
  });

  it("maps nested tags to Anki's separator and hides the tags-only line", async () => {
    expect.hasAssertions();

    const { data } = await toApkg(fixture, { now: FIXTURE_NOW });
    const { notes } = await readApkg(data);

    /* `/` nests in the file, `::` in Anki (§6.5), and the file tags reach every card. */
    expect(notes[0]?.tags.split(" ").filter(Boolean)).toStrictEqual([
      "botany",
      "plants::leaves",
      "morphology",
    ]);
    /* The `#morphology` line is metadata (§6.3): it is a tag, not card content. */
    expect(notes[0]?.back).not.toContain("morphology");
  });

  it("carries non-ASCII fields and tags through unchanged", async () => {
    expect.hasAssertions();

    const { data } = await toApkg(fixture, { now: FIXTURE_NOW });
    const { notes } = await readApkg(data);
    const note = notes.at(-1);

    expect(note?.back).toContain("Grüße, Ωμέγα, 日本語");
    expect(note?.tags).toContain("tags::déjà-vu");
  });
});

describe("images", () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "ankimd-media-"));
  });

  afterAll(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("ships one file per distinct image, named by content", async () => {
    expect.hasAssertions();

    const deck = await readFixtureDeck();
    const { data, diagnostics } = await toApkg(deck, {
      now: FIXTURE_NOW,
      resolveMedia: localMedia(FIXTURE_DIR),
    });
    const { media, notes } = await readApkg(data);
    const [name] = [...media.keys()];

    expect(diagnostics).toStrictEqual([]);
    expect(media.size).toBe(1);
    expect(name).toMatch(/^[\da-f]{32}\.png$/u);
    expect(notes[0]?.front).toContain(`src="${name}"`);
  });

  it("reports an image it cannot read and keeps the card", async () => {
    expect.hasAssertions();

    const deck = deckFrom("# Atlas\n\n## Projection\n\n![](mercator.png)\n\n- Conformal\n");
    const { data, diagnostics } = await toApkg(deck, {
      now: FIXTURE_NOW,
      resolveMedia: localMedia(directory),
    });
    const { media, notes } = await readApkg(data);

    expect(diagnostics).toStrictEqual([
      expect.objectContaining({ cardIndex: 0, code: "unresolved-image" }),
    ]);
    /* §3.3: the loss is named and the reference is left exactly as it was written. */
    expect(notes[0]?.back).toContain('src="mercator.png"');
    expect(media.size).toBe(0);
    expect(notes).toHaveLength(1);
  });

  it("leaves every reference alone when no resolver is given", async () => {
    expect.hasAssertions();

    const deck = deckFrom("# Atlas\n\n## Projection\n\n![](mercator.png)\n\n- Conformal\n");
    const { data, diagnostics } = await toApkg(deck, { now: FIXTURE_NOW });
    const { media, notes } = await readApkg(data);

    expect(diagnostics).toStrictEqual([]);
    expect(media.size).toBe(0);
    expect(notes[0]?.back).toContain('src="mercator.png"');
  });

  it("leaves an image with no source alone, and asks the resolver nothing", async () => {
    expect.hasAssertions();

    const deck = deckFrom("# Atlas\n\n## Projection\n\n![]()\n\n- Conformal\n");
    const { data, diagnostics } = await toApkg(deck, {
      now: FIXTURE_NOW,
      resolveMedia: () => {
        throw new Error("the resolver should not have been called");
      },
    });

    const { media } = await readApkg(data);

    expect(diagnostics).toStrictEqual([]);
    expect(media.size).toBe(0);
  });

  /* A resolver is the caller's code, and a caller who throws a string still gets a
     sentence rather than "[object Object]" in the diagnostic. */
  it("reports a resolver that throws something other than an Error", async () => {
    expect.hasAssertions();

    const deck = deckFrom("# Atlas\n\n## Projection\n\n![](m.png)\n\n- Conformal\n");
    const { diagnostics } = await toApkg(deck, {
      now: FIXTURE_NOW,
      resolveMedia: () => {
        // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error
        throw "the disk is on fire";
      },
    });

    expect(diagnostics[0]?.message).toContain("the disk is on fire");
  });

  it("refuses a remote image rather than fetching one", async () => {
    expect.hasAssertions();

    const deck = deckFrom("# Atlas\n\n## Projection\n\n![](https://example.org/m.png)\n\n- Yes\n");
    const { diagnostics } = await toApkg(deck, {
      now: FIXTURE_NOW,
      resolveMedia: localMedia(directory),
    });

    expect(diagnostics[0]?.code).toBe("unresolved-image");
    expect(diagnostics[0]?.message).toContain("remote");
  });
});

describe("what a package cannot hold", () => {
  /*
   * §6.5: Anki separates tags with spaces, so a tag carrying one would silently
   * become two. The sanitize is reported rather than done quietly.
   *
   * The deck is built rather than parsed, because a parsed one can no longer carry
   * such a tag: §6.2 has no room for the space either, and the reader now says so
   * where it reads it. What reaches here is a deck assembled from something that is
   * not Markdown, which is the only source left that can hand this over.
   */
  it("reports a tag it had to rewrite to fit Anki's grammar", async () => {
    expect.hasAssertions();

    const deck = deckOf({
      cards: [
        {
          back: "- Body",
          cardTags: ["needs review"],
          frontBody: "",
          hasSeparator: false,
          headingText: "Card",
          images: [],
          tags: ["needs review"],
        },
      ],
      title: "Deck",
    });
    const { data, diagnostics } = await toApkg(deck, { now: FIXTURE_NOW });

    expect(diagnostics).toStrictEqual([
      expect.objectContaining({ cardIndex: 0, code: "tag-sanitized" }),
    ]);
    const { notes } = await readApkg(data);

    expect(notes[0]?.tags).toContain("needs_review");
  });

  /*
   * An empty `## ` heading never reaches here: the parser reports it and drops the card
   * (§5.2). What does reach here is a heading with text that renders to no text at all,
   * which Anki would refuse on import because a note's first field decides its identity.
   */
  it("reports a card whose front strips to nothing, and keeps the rest", async () => {
    expect.hasAssertions();

    const deck = deckFrom("# Deck\n\n## <br>\n\n- Orphaned\n\n## Real\n\n- Kept\n");
    const { data, diagnostics } = await toApkg(deck, { now: FIXTURE_NOW });
    const { notes } = await readApkg(data);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ cardIndex: 0, code: "malformed-card-skipped" }),
    );
    expect(notes).toHaveLength(1);
    /* `sfld` is the stripped front, which keeps the newline the `<h2>` block ends on. */
    expect(notes[0]?.sortField.trim()).toBe("Real");
  });

  it("reports two cards that render identically, since Anki keeps one note", async () => {
    expect.hasAssertions();

    const deck = deckFrom("# Deck\n\n## Repeat\n\n- Same\n\n## Repeat\n\n- Same\n");
    const { data, diagnostics } = await toApkg(deck, { now: FIXTURE_NOW });

    expect(diagnostics).toStrictEqual([
      expect.objectContaining({ cardIndex: 1, code: "unrepresentable-content" }),
    ]);
    const { notes } = await readApkg(data);

    expect(notes).toHaveLength(1);
  });

  it("keeps duplicate fronts apart when their backs differ", async () => {
    expect.hasAssertions();

    const deck = deckFrom("# Deck\n\n## Repeat\n\n- One\n\n## Repeat\n\n- Two\n");
    const { data, diagnostics } = await toApkg(deck, { now: FIXTURE_NOW });

    const { notes } = await readApkg(data);

    expect(diagnostics).toStrictEqual([]);
    expect(notes).toHaveLength(BOTH_CARDS);
  });
});

describe("options the caller supplies", () => {
  it("colours a fenced block with the highlighter it is given", async () => {
    expect.hasAssertions();

    const deck = await readFixtureDeck();
    const { data } = await toApkg(deck, {
      highlight: (code, language) => `<span class="lang-${String(language)}">${code}</span>`,
      now: FIXTURE_NOW,
    });
    const { notes } = await readApkg(data);

    expect(notes[2]?.front).toContain('class="lang-python"');
  });

  it("ships the extra files it is given, before any image", async () => {
    expect.hasAssertions();

    const deck = await readFixtureDeck();
    const { data } = await toApkg(deck, {
      media: [{ data: "body { color: red }", filename: "_theme.css" }],
      now: FIXTURE_NOW,
      resolveMedia: localMedia(FIXTURE_DIR),
    });
    const { media } = await readApkg(data);

    expect([...media.keys()][0]).toBe("_theme.css");
    expect([...media.keys()]).toHaveLength(EXTRA_PLUS_IMAGE);
  });

  it("uses the template it is given for the note type", async () => {
    expect.hasAssertions();

    const deck = await readFixtureDeck();
    const plain = await toApkg(deck, { now: FIXTURE_NOW });
    const themed = await toApkg(deck, {
      now: FIXTURE_NOW,
      template: { css: ".card { color: rebeccapurple }" },
    });

    expect(plain.data.equals(themed.data)).toBe(false);
  });
});

describe("a deck written straight to a path", () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "ankimd-write-"));
  });

  afterAll(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("creates the directories leading to the target", async () => {
    expect.hasAssertions();

    const deck = await readFixtureDeck();
    const target = path.join(directory, "nested", "deeper", "botany.apkg");
    const diagnostics = await writeApkg(deck, target, { now: FIXTURE_NOW });

    const written = await stat(target);

    expect(diagnostics).toStrictEqual([]);
    expect(written.size).toBeGreaterThan(0);
  });
});
