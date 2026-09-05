import { describe, expect, it } from "vitest";

import type { Deck } from "../src/deck.js";
import { checkCanonical } from "../src/spec/canonical.js";
import { parseMarkdown } from "../src/spec/parse.js";
import { renderMarkdown } from "../src/spec/render.js";
import {
  casesIn,
  type ExpectedDiagnostic,
  isInvalidOffPage,
  manifest,
  PARSE_CANNOT_RAISE,
  readExpected,
  readInput,
  SPEC_VERSION,
  VALID_WITHOUT_A_SPELLING,
} from "./_corpus.js";

/*
 * The Flashcard Markdown conformance corpus, run in both directions.
 *
 * `@ankimd/core` conforms as both classes (§3.1), so both obligations are asserted
 * here. The consumer must parse anything canonical or valid correctly and must not
 * refuse a file over one malformed card. The producer must reproduce a canonical file
 * byte for byte, must reject everything in the invalid tier, and must render a merely
 * valid file as canonical rather than as it was written.
 *
 * The adapter below is the whole of the mapping from this package's model to the
 * corpus shape.
 */

const byCode = (left: ExpectedDiagnostic, right: ExpectedDiagnostic): number =>
  left.code.localeCompare(right.code) || (left.cardIndex ?? -1) - (right.cardIndex ?? -1);

/** The test-only adapter from this package's model to the corpus shape. */
const adapt = (deck: Deck) => ({
  cards: deck.cards.map(({ back, cardTags, frontBody, headingText, images, tags }) => ({
    back,
    cardTags,
    frontBody,
    headingText,
    images,
    tags,
  })),
  deck: {
    fileTags: deck.fileTags,
    frontmatter: deck.frontmatter,
    preamble: deck.preamble,
    title: deck.title,
    titleSource: deck.titleSource,
  },
});

describe("the conformance corpus, read as a consumer", () => {
  it("pins the spec version rather than tracking whatever is installed", () => {
    expect.hasAssertions();
    expect(manifest.specVersion).toBe(SPEC_VERSION);
  });

  it("runs every case in the manifest", () => {
    expect.hasAssertions();
    expect(manifest.cases.length).toBeGreaterThan(0);
  });

  it.each(manifest.cases)("$id: $description", async ({ id }) => {
    expect.hasAssertions();

    const expected = await readExpected(id);
    const actual = adapt(parseMarkdown(await readInput(id)).deck);

    expect(actual.deck).toStrictEqual(expected.deck);
    expect(actual.cards).toStrictEqual(expected.cards);
  });

  it.each(manifest.cases)("$id raises exactly the diagnostics listed", async ({ id }) => {
    expect.hasAssertions();

    const expected = await readExpected(id);
    const actual = parseMarkdown(await readInput(id))
      .diagnostics.map(({ cardIndex, code }) => ({ cardIndex, code }))
      .toSorted(byCode);

    expect(actual).toStrictEqual(
      expected.diagnostics.filter(({ code }) => !PARSE_CANNOT_RAISE.has(code)).toSorted(byCode),
    );
  });

  /* §3.1: a consumer MUST NOT refuse a file because one card is malformed. Every
     invalid case is a file with something wrong in it, and every one still has to come
     back with the cards around the damage. */
  it.each(casesIn("invalid"))(
    "$id still loads, with the cards around the damage",
    async ({ id }) => {
      expect.hasAssertions();

      const source = await readInput(id);

      expect(() => parseMarkdown(source)).not.toThrow();
      expect(parseMarkdown(source).deck.cards.length).toBeGreaterThan(0);
    },
  );
});

describe("the conformance corpus, written as a producer", () => {
  /* §3.2 tier 1. The strongest statement the corpus can make about a serializer. */
  it.each(casesIn("canonical"))(
    "$id survives a parse and a render byte for byte",
    async ({ id }) => {
      expect.hasAssertions();

      const source = await readInput(id);

      expect(renderMarkdown(parseMarkdown(source).deck)).toBe(source);
    },
  );

  /* §3.2 tier 1 again, from the other side: a canonical file has nothing to report. */
  it.each(casesIn("canonical"))("$id is accepted as canonical", async ({ id }) => {
    expect.hasAssertions();
    expect(checkCanonical(await readInput(id))).toStrictEqual([]);
  });

  /*
   * §3.2 tier 2, and the check neither implementation this replaces had. A valid file
   * is not canonical, so rendering what was parsed from one must produce the canonical
   * spelling rather than echo the input. Asserting that the render differs would pass
   * on any corruption, so the assertion is that the render is itself canonical and
   * survives a second round trip unchanged.
   */
  it.each(casesIn("valid"))("$id renders as canonical form", async ({ id }) => {
    expect.hasAssertions();

    const rendered = renderMarkdown(parseMarkdown(await readInput(id)).deck);

    expect(checkCanonical(rendered)).toStrictEqual([]);
    expect(renderMarkdown(parseMarkdown(rendered).deck)).toBe(rendered);
  });

  /*
   * §3.2 tier 2 from the gate's side rather than the serializer's. The render test
   * above proves the serializer picks the canonical spelling; this proves the gate can
   * see the spelling it picked away from. Without it a canonical spelling can go
   * unchecked while the corpus stays green, which is exactly what §6.4 did.
   */
  it.each(casesIn("valid").filter((item) => !VALID_WITHOUT_A_SPELLING.has(item.id)))(
    "$id is reported as not canonical",
    async ({ id }) => {
      expect.hasAssertions();
      expect(checkCanonical(await readInput(id))).not.toStrictEqual([]);
    },
  );

  it.each(casesIn("valid").filter((item) => VALID_WITHOUT_A_SPELLING.has(item.id)))(
    "$id is accepted, because §3.2 asks for a spelling and it has none",
    async ({ id }) => {
      expect.hasAssertions();
      expect(checkCanonical(await readInput(id))).toStrictEqual([]);
    },
  );

  it("names only cases the corpus still carries as valid without a spelling", () => {
    expect.hasAssertions();
    expect(
      [...VALID_WITHOUT_A_SPELLING].filter(
        (id) => !casesIn("valid").some((item) => item.id === id),
      ),
    ).toStrictEqual([]);
  });

  /* §3.2 tier 3: producers reject it. */
  it.each(casesIn("invalid").filter((item) => !isInvalidOffPage(item)))(
    "$id is rejected",
    async ({ id }) => {
      expect.hasAssertions();
      expect(checkCanonical(await readInput(id))).not.toStrictEqual([]);
    },
  );

  it("holds out only the invalid cases whose defect is not in the source", () => {
    expect.hasAssertions();
    expect(
      casesIn("invalid")
        .filter((item) => isInvalidOffPage(item))
        .map((item) => item.id),
    ).toStrictEqual(["invalid/unresolved-image"]);
  });
});
