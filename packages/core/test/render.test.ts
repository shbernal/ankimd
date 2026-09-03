import { describe, expect, it } from "vitest";

import { deckOf } from "../src/deck.js";
import { parseMarkdown } from "../src/spec/parse.js";
import { renderMarkdown } from "../src/spec/render.js";

const roundTrip = (source: string) => renderMarkdown(parseMarkdown(source).deck);

describe("the canonical serializer", () => {
  it("keeps a card with a separator and an empty front body distinct from one without", () => {
    expect.hasAssertions();

    expect(roundTrip("## Card\n\n***\n\nback\n")).toBe("## Card\n\n***\n\nback\n");
    expect(roundTrip("## Card\n\nback\n")).toBe("## Card\n\nback\n");
  });

  it("preserves frontmatter keys it does not understand (§4.1)", () => {
    expect.hasAssertions();

    const rendered = roundTrip("---\ntype: flashcards\nsource: notes.pdf\n---\n\n## Card\n\n- a\n");

    expect(rendered).toContain("type: flashcards");
    expect(rendered).toContain("source: notes.pdf");
  });

  it("writes frontmatter tags without the leading hash §6.4 accepts on read", () => {
    expect.hasAssertions();

    expect(roundTrip("---\ntags:\n  - '#french'\n---\n\n## Card\n\n- a\n")).toBe(
      "---\ntags:\n  - french\n---\n\n## Card\n\n- a\n",
    );
  });

  it("emits no frontmatter block for a deck that has none", () => {
    expect.hasAssertions();
    expect(roundTrip("## Card\n\n- a\n")).toBe("## Card\n\n- a\n");
  });

  it("moves a tags-only line to the end and leaves an inline tag in place", () => {
    expect.hasAssertions();

    expect(roundTrip("## Card\n\n#topic\n\nThe #verbs group.\n")).toBe(
      "## Card\n\nThe #verbs group.\n\n#topic\n",
    );
  });

  it("merges tags from the front and back regions into one line at the end", () => {
    expect.hasAssertions();

    expect(roundTrip("## Card\n\n#front-tag\n\nfront\n\n***\n\nback\n\n#back-tag\n")).toBe(
      "## Card\n\nfront\n\n***\n\nback\n\n#front-tag #back-tag\n",
    );
  });

  it("leaves a tag inside a code fence alone", () => {
    expect.hasAssertions();

    const source = "## Card\n\n```\n#not-a-tag\n```\n";

    expect(roundTrip(source)).toBe(source);
  });

  it("renders an empty deck as an empty string rather than a stray newline", () => {
    expect.hasAssertions();
    expect(renderMarkdown(parseMarkdown("").deck)).toBe("");
  });

  it("does not leave a double blank where a tags line was lifted out of the middle", () => {
    expect.hasAssertions();

    expect(roundTrip("## Card\n\nabove\n\n#topic\n\nbelow\n")).toBe(
      "## Card\n\nabove\n\nbelow\n\n#topic\n",
    );
  });

  /* The deck that claims a heading and carries no title has no spelling any more:
     `Deck` pairs the two, so `renderMarkdown` has no fourth state to hedge against.
     What is left to check is that the factory pairs them the way the type says. */
  it("writes the title a hand-built deck was given, and none when it has null", () => {
    expect.hasAssertions();

    expect(renderMarkdown(deckOf({ cards: [], title: "Deck" }))).toBe("# Deck\n");
    expect(renderMarkdown(deckOf({ cards: [], title: null }))).toBe("");
  });

  it("keeps a card with no body on one line", () => {
    expect.hasAssertions();
    expect(roundTrip("## Card\n")).toBe("## Card\n");
  });
});
