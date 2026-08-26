import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../src/spec/parse.js";

/*
 * §4.1. The block is optional, must be first in the file, and defines one key. What is
 * asserted here is mostly what happens when it is none of those things, because §3.3
 * forbids dropping any of it in silence.
 */

describe("the frontmatter block", () => {
  it("reads tags and keeps every key it does not define", () => {
    expect.hasAssertions();

    const { deck } = parseMarkdown("---\ntype: notes\ntags:\n  - a\n---\n\n## Card\n");

    expect(deck.fileTags).toStrictEqual(["a"]);
    expect(deck.frontmatter).toStrictEqual({ tags: ["a"], type: "notes" });
  });

  it("says so rather than dropping a block that is not valid YAML", () => {
    expect.hasAssertions();

    const { deck, diagnostics } = parseMarkdown("---\ntags: [unclosed\n---\n\n## Card\n\n- a\n");

    expect(diagnostics.map(({ code }) => code)).toStrictEqual(["unrepresentable-content"]);
    expect(deck.cards).toHaveLength(1);
  });

  it("ignores a block that parses to something other than a mapping", () => {
    expect.hasAssertions();

    const { deck, diagnostics } = parseMarkdown("---\n- just\n- a list\n---\n\n## Card\n\n- a\n");

    expect(deck.frontmatter).toStrictEqual({});
    expect(diagnostics).toStrictEqual([]);
    expect(deck.cards).toHaveLength(1);
  });

  it("treats an unclosed block as ordinary content rather than eating the file", () => {
    expect.hasAssertions();

    const { deck } = parseMarkdown("---\ntags:\n  - a\n\n## Card\n\n- a\n");

    expect(deck.frontmatter).toStrictEqual({});
    expect(deck.cards).toHaveLength(1);
  });

  it("closes on ... as well as on ---, which YAML allows", () => {
    expect.hasAssertions();

    const { deck } = parseMarkdown("---\ntags:\n  - a\n...\n\n## Card\n");

    expect(deck.fileTags).toStrictEqual(["a"]);
  });

  it("names the removed singular alias rather than reading or dropping it", () => {
    expect.hasAssertions();

    const { deck, diagnostics } = parseMarkdown("---\ntag: a\n---\n\n## Card\n");

    expect(diagnostics.map(({ code }) => code)).toStrictEqual(["frontmatter-tags-not-a-sequence"]);
    expect(deck.fileTags).toStrictEqual([]);
  });

  it("counts source lines from the top of the file, frontmatter included", () => {
    expect.hasAssertions();

    const { deck } = parseMarkdown("---\ntags:\n  - a\n---\n\n# T\n\n## Card\n\n- a\n");

    expect(deck.cards[0]?.tags).toStrictEqual(["a"]);
  });
});
