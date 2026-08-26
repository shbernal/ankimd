import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Deck } from "../src/deck.js";
import type { DiagnosticCode } from "../src/diagnostics.js";
import { checkCanonical } from "../src/spec/canonical.js";
import { parseMarkdown } from "../src/spec/parse.js";
import { renderMarkdown } from "../src/spec/render.js";

/*
 * The Flashcard Markdown conformance corpus, run in both directions.
 *
 * `@ankimd/core` conforms as both classes (§3.1), so both obligations are asserted
 * here. The consumer must parse anything canonical or valid correctly and must not
 * refuse a file over one malformed card. The producer must reproduce a canonical file
 * byte for byte, must reject everything in the invalid tier, and must render a merely
 * valid file as canonical rather than as it was written.
 *
 * The corpus is a set of verbatim source slices rather than an AST or rendered HTML,
 * which is what lets a line scanner and an HTML emitter assert against one thing. The
 * adapter below is the whole of the mapping, and nothing in src/ knows the corpus
 * exists.
 */

const require = createRequire(import.meta.url);
const FIXTURES = path.dirname(require.resolve("flashcard-md-spec/manifest.json"));

/** The spec version this suite conforms to, pinned rather than tracked. */
const SPEC_VERSION = "1.0";

interface ManifestCase {
  readonly id: string;
  readonly tier: "canonical" | "valid" | "invalid";
  readonly description: string;
  readonly diagnostics: readonly DiagnosticCode[];
}

interface ExpectedDiagnostic {
  readonly code: DiagnosticCode;
  readonly cardIndex: number | null;
}

interface Expected {
  readonly deck: unknown;
  readonly cards: readonly unknown[];
  readonly diagnostics: readonly ExpectedDiagnostic[];
}

const readJson = async <Shape>(file: string): Promise<Shape> =>
  JSON.parse(await fs.readFile(file, "utf8")) as Shape;

const readInput = (id: string): Promise<string> =>
  fs.readFile(path.join(FIXTURES, id, "input.md"), "utf8");

const readExpected = (id: string): Promise<Expected> =>
  readJson<Expected>(path.join(FIXTURES, id, "expected.json"));

const manifest = await readJson<{ specVersion: string; cases: ManifestCase[] }>(
  path.join(FIXTURES, "manifest.json"),
);

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

/*
 * `unresolved-image` is the one code in the corpus that nothing reading Markdown can
 * raise: whether an image resolves is a fact about the filesystem, not about the file.
 * Both directions hold it out rather than demand it from a function that cannot know
 * it. Whatever resolves an image is what raises it.
 */
const PARSE_CANNOT_RAISE = new Set<DiagnosticCode>(["unresolved-image"]);

/** True when a case is invalid only for a reason no reader of the source can see. */
const isInvalidOffPage = (testCase: ManifestCase): boolean =>
  testCase.diagnostics.length > 0 &&
  testCase.diagnostics.every((code) => PARSE_CANNOT_RAISE.has(code));

const casesIn = (tier: ManifestCase["tier"]): ManifestCase[] =>
  manifest.cases.filter((item) => item.tier === tier);

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
