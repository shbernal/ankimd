import { describe, expect, it } from "vitest";

import { checkCanonical, NotCanonicalError, parseCanonical } from "../src/spec/canonical.js";

/*
 * The spec names exactly four places where canonical and valid differ, one test each
 * naming which check fired. What the gate accepts and rejects across whole files is the
 * conformance corpus's job, in `conformance.test.ts`.
 */

const messagesFor = (source: string) => checkCanonical(source).map((issue) => issue.message);

describe("the four canonical departures", () => {
  it("wants a blank line after the ## heading (§5.4)", () => {
    expect.hasAssertions();

    expect(messagesFor("## Card\n- a bullet\n")).toStrictEqual([
      'A "##" heading needs a blank line after it, before the body',
    ]);
  });

  it("wants a blank line either side of the separator (§5.3)", () => {
    expect.hasAssertions();

    expect(messagesFor("## Card\n\nfront\n***\nback\n")).toStrictEqual([
      'A "***" front/back separator needs a blank line either side',
    ]);
  });

  it("wants the tags-only line last in the card body (§6.3)", () => {
    expect.hasAssertions();

    expect(messagesFor("## Card\n\n#topic\n\n- a bullet\n")).toStrictEqual([
      "A tags-only line belongs at the end of the card body",
    ]);
  });

  it("wants one tags-only line rather than several", () => {
    expect.hasAssertions();

    expect(messagesFor("## Card\n\n- a bullet\n\n#one\n\n#two\n")).toStrictEqual([
      "A card carries at most one tags-only line, holding all of its tags",
    ]);
  });

  it("wants a frontmatter tag written bare (§6.4)", () => {
    expect.hasAssertions();

    expect(messagesFor('---\ntags:\n  - "#verbs"\n---\n\n## Card\n\n- a\n')).toStrictEqual([
      'A frontmatter tag carries no leading "#": write "verbs" rather than "#verbs"',
    ]);
  });

  it("names the line the hashed tag sits on", () => {
    expect.hasAssertions();

    const source = '---\ntags:\n  - ok\n  - "#verbs"\n---\n\n## Card\n\n- a\n';

    expect(checkCanonical(source).map((issue) => issue.lines)).toStrictEqual([[4]]);
  });
});

describe("the failing entry point", () => {
  it("returns the deck when the source is canonical", () => {
    expect.hasAssertions();
    expect(parseCanonical("# T\n\n## Card\n\n- a\n").cards).toHaveLength(1);
  });

  it("throws with the issues attached, not just a message", () => {
    expect.hasAssertions();

    let thrown: unknown;
    try {
      parseCanonical("## Card\n- a\n");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(NotCanonicalError);
    expect((thrown as NotCanonicalError).issues).toHaveLength(1);
  });

  it("names the line of a tier-3 signal, which carries one of its own", () => {
    expect.hasAssertions();

    expect(() => parseCanonical("# One\n\n## Card\n\n- a\n\n# Two\n")).toThrow(/stray-h1/u);
    expect(() => parseCanonical("# One\n\n## Card\n\n- a\n\n# Two\n")).toThrow(/lines 7/u);
  });

  it("reports an issue with no line when the defect is not tied to one", () => {
    expect.hasAssertions();

    const scalarTags = "---\ntags: astronomy, orbits\n---\n\n## Card\n\n- a\n";

    expect(() => parseCanonical(scalarTags)).toThrow(/frontmatter-tags-not-a-sequence/u);
    expect(() => parseCanonical(scalarTags)).not.toThrow(/lines/u);
  });

  it("names separate lines separately rather than collapsing them into a range", () => {
    expect.hasAssertions();
    expect(() => parseCanonical("## Card\n\n- a\n\n#one\n\n- b\n\n#two\n")).toThrow(/lines 5, 9/u);
  });

  it("names the line in the message, and collapses a run into a range", () => {
    expect.hasAssertions();

    expect(() => parseCanonical("## Card\n- a\n")).toThrow(/lines 2/u);
    expect(() => parseCanonical("## Card\n\n- a\n\n#one\n#two\n")).toThrow(/lines 5-6/u);
  });
});
