import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../src/spec/parse.js";

/*
 * §8 leaves `line` optional, so the value of having it is that the three signals a
 * Markdown file can raise on its own all carry one. The rest of the closed list fires
 * at a conversion boundary and has no line to give.
 */

const linesFor = (source: string) =>
  parseMarkdown(source).diagnostics.map(({ code, line }) => [code, line]);

describe("where a diagnostic points", () => {
  it("points at the second # heading", () => {
    expect.hasAssertions();
    expect(linesFor("# One\n\n## Card\n\n- a\n\n# Two\n")).toStrictEqual([["stray-h1", 7]]);
  });

  it("points at the ## heading of the card it skipped", () => {
    expect.hasAssertions();

    expect(linesFor("# Deck\n\n## \n\n- a\n\n## Real\n\n- b\n")).toStrictEqual([
      ["malformed-card-skipped", 3],
    ]);
  });

  it("points at the first stray tag rather than at the preamble", () => {
    expect.hasAssertions();

    expect(linesFor("# Deck\n\nProse.\n\n#one\n\n#two\n\n## Card\n\n- a\n")).toStrictEqual([
      ["preamble-tag", 5],
    ]);
  });

  it("counts from the first line of the file, frontmatter included", () => {
    expect.hasAssertions();

    expect(linesFor("---\ntitle: Deck\n---\n\n# One\n\n## Card\n\n- a\n\n# Two\n")).toStrictEqual([
      ["stray-h1", 11],
    ]);
  });

  it("leaves the line off a diagnostic that is about a value, not a place", () => {
    expect.hasAssertions();

    expect(linesFor("---\ntags: astronomy, orbits\n---\n\n## Card\n\n- a\n")).toStrictEqual([
      ["frontmatter-tags-not-a-sequence", undefined],
    ]);
  });
});
