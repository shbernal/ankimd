import { stringify as stringifyYaml } from "yaml";

import type { Card, Deck } from "../deck.js";
import { isBlank, scanLines, splitSourceLines, toSlice } from "./scan.js";
import { isTagsOnlyLine, tagsInLine, uniqueTags } from "./tags.js";

/*
 * The canonical serializer, and the producer half of §3.1: it emits canonical form
 * only. A deck parsed from a canonical file renders back to that file byte for byte,
 * and a deck parsed from a merely valid one renders to the canonical spelling instead.
 *
 * The spec states exactly three places where canonical and valid differ, and this
 * module is where all three are decided:
 *
 *   §5.3  a blank line either side of the `***`
 *   §5.4  a blank line after the `##` heading, before the body
 *   §6.3  tags on their own line at the end of the card body
 *
 * Everything else is written back as it was read. Bodies are verbatim slices, so
 * nothing here re-wraps a paragraph, renumbers a list or touches a code fence.
 */

/** Canonical form separates every block with one blank line. */
const BLOCK_GAP = "\n\n";

/**
 * Pulls the tags-only lines out of a body slice.
 *
 * §6.3 is line-based rather than token-based: a line that is nothing but tags is
 * metadata and moves to the end of the card, while a tag inside a sentence is part of
 * the sentence and stays exactly where it was. Hiding every recognized token instead
 * would render "The #verbs group of motion" as "The group of motion".
 */
export const extractTagLines = (slice: string): { body: string; tags: string[] } => {
  const kept: string[] = [];
  const tags: string[] = [];

  for (const line of scanLines(splitSourceLines(slice))) {
    const isMetadata = !line.inCode && isTagsOnlyLine(line.text);
    /* Removing a tags line can leave two blank lines where the author wrote one. */
    const collapses = !line.inCode && isBlank(line.text) && isBlank(kept.at(-1)) && kept.length > 0;

    if (isMetadata) {
      tags.push(...tagsInLine(line.text));
    } else if (!collapses) {
      kept.push(line.text);
    }
  }

  return { body: toSlice(kept), tags: uniqueTags(tags) };
};

export const renderCard = (card: Card): string => {
  const front = extractTagLines(card.frontBody);
  const back = extractTagLines(card.back);
  const tags = uniqueTags([...front.tags, ...back.tags]);

  const blocks = [`## ${card.headingText}`];

  if (front.body !== "") {
    blocks.push(front.body);
  }
  if (card.hasSeparator) {
    blocks.push("***");
  }
  if (back.body !== "") {
    blocks.push(back.body);
  }
  if (tags.length > 0) {
    blocks.push(tags.map((tag) => `#${tag}`).join(" "));
  }

  return blocks.join(BLOCK_GAP);
};

/**
 * The frontmatter block, or `null` when the deck has none.
 *
 * §4.1 requires that a tool rewriting a deck preserve keys it does not understand, so
 * the whole record is written back. Only `tags` is normalized, to the stripped form
 * §6.4 calls canonical, because a leading `#` there is accepted on read.
 */
const renderFrontmatter = (deck: Deck): string | null => {
  const rest: Record<string, unknown> = { ...deck.frontmatter };
  delete rest.tags;

  const data: Record<string, unknown> =
    deck.fileTags.length > 0 ? { ...rest, tags: [...deck.fileTags] } : rest;

  if (Object.keys(data).length === 0) {
    return null;
  }

  return `---\n${stringifyYaml(data).trimEnd()}\n---`;
};

export const renderMarkdown = (deck: Deck): string => {
  const blocks: string[] = [];
  const frontmatter = renderFrontmatter(deck);

  if (frontmatter !== null) {
    blocks.push(frontmatter);
  }
  if (deck.titleSource === "heading") {
    blocks.push(`# ${deck.title ?? ""}`);
  }
  if (deck.preamble !== null) {
    blocks.push(deck.preamble);
  }

  blocks.push(...deck.cards.map((card) => renderCard(card)));

  return blocks.length > 0 ? `${blocks.join(BLOCK_GAP)}\n` : "";
};
