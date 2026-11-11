import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../src/spec/parse.js";
import { scanLines } from "../src/spec/scan.js";

/*
 * The scanner is the piece two implementations each hand-rolled, and where they
 * disagreed one of them was wrong. Both disagreements are pinned here.
 */

describe("line splitting", () => {
  it("normalizes CRLF so a Windows deck still has separators", () => {
    expect.hasAssertions();

    const { deck } = parseMarkdown("# T\r\n\r\n## Card\r\n\r\nfront\r\n\r\n***\r\n\r\nback\r\n");

    expect(deck.cards[0]?.frontBody).toBe("front");
    expect(deck.cards[0]?.back).toBe("back");
  });

  it("keeps trailing spaces, which are a hard line break in CommonMark", () => {
    expect.hasAssertions();

    const { deck } = parseMarkdown("## Card\n\nfirst  \nsecond\n");

    expect(deck.cards[0]?.back).toBe("first  \nsecond");
  });
});

describe("fence tracking", () => {
  it("does not open a card from a heading inside a fence", () => {
    expect.hasAssertions();

    const { deck } = parseMarkdown("## Real\n\n```\n## Not a card\n```\n");

    expect(deck.cards).toHaveLength(1);
    expect(deck.cards[0]?.back).toBe("```\n## Not a card\n```");
  });

  it("closes a fence only on a delimiter of the same kind and at least as long", () => {
    expect.hasAssertions();

    const scanned = scanLines(["````", "```", "still code", "````", "out"]);

    expect(scanned.map((line) => line.inCode)).toStrictEqual([true, true, true, true, false]);
  });

  it("treats a tilde fence as a fence", () => {
    expect.hasAssertions();

    const scanned = scanLines(["~~~", "***", "~~~", "***"]);

    expect(scanned.map((line) => line.isSeparator)).toStrictEqual([false, false, false, true]);
  });

  it("does not let a fence be closed by the other delimiter character", () => {
    expect.hasAssertions();

    const scanned = scanLines(["```", "~~~", "***"]);

    expect(scanned.every((line) => line.inCode)).toBe(true);
  });
});

describe("headings", () => {
  it("reads a closing sequence as decoration rather than as text", () => {
    expect.hasAssertions();
    expect(scanLines(["## Title ##"])[0]?.heading?.text).toBe("Title");
  });
});

/*
 * The bug both replaced implementations had. Each rebuilt a card body from the lines it
 * recognized, `## ` and `- `, and dropped every other line on the floor: a nested list
 * item and a `###` heading disappeared between the deck being written and the deck
 * being built, with nothing to report because what came out still looked like a deck.
 */
describe("a card body is a source slice, not a reconstruction", () => {
  it("keeps nested items, deeper headings and prose that no rule names", () => {
    expect.hasAssertions();

    const body = [
      "- outer",
      "  - nested",
      "    1. deeper still",
      "",
      "### A heading inside the card",
      "",
      "A paragraph, which is neither a heading nor a list item.",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");

    const { deck } = parseMarkdown(`## Front\n\n${body}\n`);

    expect(deck.cards[0]?.back).toBe(body);
  });
});
