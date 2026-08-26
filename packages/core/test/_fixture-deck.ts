import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Deck } from "../src/deck.js";
import { parseMarkdown } from "../src/spec/parse.js";

/**
 * The one definition of the deck frozen in test/fixtures/deck.apkg.
 *
 * The byte-equality assertion and the regeneration path both build it from here, so
 * the fixture cannot drift from the test that guards it.
 */

/** Pinned so ids, guids and the archive's timestamps are reproducible. */
export const FIXTURE_NOW = 1_482_680_798_652;

export const FIXTURE_DIR = path.join(import.meta.dirname, "fixtures");

export const readFixtureDeck = async (): Promise<Deck> => {
  const source = await readFile(path.join(FIXTURE_DIR, "deck.md"), "utf8");
  const { deck, diagnostics } = parseMarkdown(source);

  if (diagnostics.length > 0) {
    throw new Error(`The fixture deck should parse cleanly: ${JSON.stringify(diagnostics)}`);
  }

  return deck;
};
