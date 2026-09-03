import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  type Card,
  type Deck,
  deckOf,
  type Diagnostic,
  parseMarkdown,
  writeApkg,
} from "@ankimd/core";

import { highlight, type CodeTheme } from "./highlight.js";
import { createMediaResolver } from "./media.js";
import { report, type Reporter } from "./report.js";
import { callerCwd, markdownFiles, mediaDirectories, targetPath } from "./sources.js";
import { defaultTemplate, readTemplate, type Template } from "./template.js";

/*
 * `ankimd build`: Markdown to a package Anki imports.
 *
 * Everything here is a decision `@ankimd/core` refused to make. Which files a path
 * names, what the deck is called when nothing says, where an image lives, whether a
 * download is allowed, what a card looks like.
 */

export interface BuildOptions {
  readonly codeTheme: CodeTheme;
  readonly deck: string | undefined;
  readonly remoteMedia: boolean;
  readonly remoteTimeoutMs: number;
  readonly source: string;
  readonly target: string | undefined;
  readonly template: string | undefined;
}

/** Every card in every file, in the order the files were read. */
const collect = async (
  files: readonly string[],
  reporter: Readonly<Reporter>,
): Promise<{ cards: Card[]; title: string | null }> => {
  const cards: Card[] = [];
  let title: string | null = null;

  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop -- card order is the deck's order.
    const { deck, diagnostics } = parseMarkdown(await readFile(file, "utf8"));

    report(reporter, file, diagnostics);
    cards.push(...deck.cards);
    title ??= deck.title;
  }

  return { cards, title };
};

const templateFor = (options: Readonly<BuildOptions>): Promise<Template> => {
  if (options.template === undefined) {
    return defaultTemplate(options.codeTheme);
  }

  return readTemplate(path.resolve(callerCwd(), options.template));
};

/**
 * The name Anki files the deck under.
 *
 * `--deck` first, then the title the file itself carries (§4.2), then the source's
 * own name. A deck must have a name and the library refuses to invent one, which is
 * the right refusal for a library and the wrong answer for a command.
 */
const deckName = (options: Readonly<BuildOptions>, title: string | null): string => {
  const stem = path.basename(options.source, path.extname(options.source));

  return options.deck ?? title ?? stem;
};

export const build = async (
  options: Readonly<BuildOptions>,
  reporter: Readonly<Reporter>,
): Promise<void> => {
  const source = path.resolve(callerCwd(), options.source);
  const files = await markdownFiles(source);
  const { cards, title } = await collect(files, reporter);

  if (cards.length === 0) {
    throw new Error(`${options.source} holds no cards`);
  }

  const deck: Deck = deckOf({ cards, title });

  const target = targetPath(source, options.target, ".apkg");
  const diagnostics: readonly Diagnostic[] = await writeApkg(deck, target, {
    deckName: deckName(options, title),
    highlight,
    resolveMedia: createMediaResolver({
      directories: mediaDirectories(files),
      remote: options.remoteMedia,
      timeoutMs: options.remoteTimeoutMs,
    }),
    template: await templateFor(options),
  });

  report(reporter, path.basename(target), diagnostics);
  reporter.line(`ankimd: wrote ${cards.length} card(s) to ${target}`);
};
