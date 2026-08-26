import { describe, expect, it } from "vitest";

import { isTagsOnlyLine, isTagToken, tagsInLine, toAnkiTags } from "../src/spec/tags.js";

describe("the tag grammar (§6.2)", () => {
  it("requires at least one non-numeric character", () => {
    expect.hasAssertions();
    expect(isTagToken("42")).toBe(false);
    expect(isTagToken("1st-declension")).toBe(true);
  });

  it("accepts Unicode letters, underscore, hyphen and slash", () => {
    expect.hasAssertions();
    expect(isTagToken("grammaire/participe_passé-1")).toBe(true);
  });

  it("does not read C# as a tag, because the # must open the token", () => {
    expect.hasAssertions();
    expect(tagsInLine("Written in C# rather than Java")).toStrictEqual([]);
  });

  it("does not read a URL fragment as a tag", () => {
    expect.hasAssertions();
    expect(tagsInLine("See https://example.com/page#section")).toStrictEqual([]);
  });

  it("does not read a tag inside a code span", () => {
    expect.hasAssertions();
    expect(tagsInLine("Use `#include <stdio.h>` first")).toStrictEqual([]);
    expect(tagsInLine("Use `#one` but count #two")).toStrictEqual(["two"]);
  });

  it("reads an inline tag written in a sentence", () => {
    expect.hasAssertions();
    expect(tagsInLine("The #verbs group of motion")).toStrictEqual(["verbs"]);
  });
});

describe("tags-only lines (§6.3)", () => {
  it("is true for a line of nothing but tags", () => {
    expect.hasAssertions();
    expect(isTagsOnlyLine("  #one  #two/three ")).toBe(true);
  });

  it("is false for a tag inside prose, which stays visible", () => {
    expect.hasAssertions();
    expect(isTagsOnlyLine("The #verbs group")).toBe(false);
  });

  it("is false for a blank line", () => {
    expect.hasAssertions();
    expect(isTagsOnlyLine("   ")).toBe(false);
  });
});

describe("the Anki mapping (§6.5)", () => {
  it("nests with :: where the file nests with /", () => {
    expect.hasAssertions();
    expect(toAnkiTags(["grammar/mood"]).tags).toStrictEqual(["grammar::mood"]);
  });

  it("sanitizes whitespace and says so rather than splitting a tag in two", () => {
    expect.hasAssertions();

    const { diagnostics, tags } = toAnkiTags(["two words"]);

    expect(tags).toStrictEqual(["two_words"]);
    expect(diagnostics.map(({ code }) => code)).toStrictEqual(["tag-sanitized"]);
  });

  it("deduplicates tags that collide only after mapping", () => {
    expect.hasAssertions();
    expect(toAnkiTags(["a b", "a_b"]).tags).toStrictEqual(["a_b"]);
  });
});
