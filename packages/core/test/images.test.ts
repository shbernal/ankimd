import { describe, expect, it } from "vitest";

import { relocateImages } from "../src/spec/images.js";
import { parseMarkdown } from "../src/spec/parse.js";

/*
 * §7 does not restrict a link destination, so every CommonMark spelling of one is an
 * image here. What is asserted is that reading and rewriting agree about which ones
 * those are: the two used to be a regular expression and a substring replacement, and
 * they disagreed about titles, angle brackets and prose.
 */

const MOVES = new Map([["a.png", "media/a.png"]]);

const imagesOf = (source: string) => parseMarkdown(source).deck.cards[0]?.images;

describe("reading an image reference", () => {
  it("reads the bare, titled and angle-bracketed forms alike", () => {
    expect.hasAssertions();

    expect(
      imagesOf('## C\n\n![a](a.png)\n\n![b](b.png "Title")\n\n![c](<c d.png>)\n'),
    ).toStrictEqual([
      { alt: "a", src: "a.png" },
      { alt: "b", src: "b.png" },
      { alt: "c", src: "c d.png" },
    ]);
  });

  it("reads nothing out of a fenced block", () => {
    expect.hasAssertions();
    expect(imagesOf("## C\n\n```md\n![a](a.png)\n```\n")).toStrictEqual([]);
  });
});

describe("relocating an image reference", () => {
  it("moves the bare form", () => {
    expect.hasAssertions();
    expect(relocateImages("![a](a.png)", MOVES)).toBe("![a](media/a.png)");
  });

  it("moves the title form, and keeps the title", () => {
    expect.hasAssertions();
    expect(relocateImages('![a](a.png "One")', MOVES)).toBe('![a](media/a.png "One")');
  });

  it("moves the angle form", () => {
    expect.hasAssertions();
    expect(relocateImages("![a](<a.png>)", MOVES)).toBe("![a](media/a.png)");
  });

  it("writes angle brackets when the destination it is given needs them", () => {
    expect.hasAssertions();

    expect(relocateImages("![a](a.png)", new Map([["a.png", "my media/a.png"]]))).toBe(
      "![a](<my media/a.png>)",
    );
  });

  it("leaves a name it was not given alone", () => {
    expect.hasAssertions();
    expect(relocateImages("![b](b.png)", MOVES)).toBe("![b](b.png)");
  });

  it("leaves the same text in prose alone, because it is not a reference", () => {
    expect.hasAssertions();
    expect(relocateImages("see [a](a.png) and ](a.png)", MOVES)).toBe(
      "see [a](a.png) and ](a.png)",
    );
  });

  it("leaves a reference inside a fenced block alone, because it is code", () => {
    expect.hasAssertions();
    expect(relocateImages("```md\n![a](a.png)\n```", MOVES)).toBe("```md\n![a](a.png)\n```");
  });

  it("moves every reference on a line, not just the first", () => {
    expect.hasAssertions();

    expect(relocateImages("![a](a.png) ![a](a.png)", MOVES)).toBe(
      "![a](media/a.png) ![a](media/a.png)",
    );
  });

  /* The substring replacement this replaces rewrote the alt text of exactly this. */
  it("moves the destination and not an alt text that reads the same", () => {
    expect.hasAssertions();
    expect(relocateImages("![a.png](a.png)", MOVES)).toBe("![a.png](media/a.png)");
  });
});
