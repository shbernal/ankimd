import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { readDeck } from "@ankimd/core";

import { report, type Reporter } from "./report.js";
import { callerCwd, targetPath } from "./sources.js";

/*
 * `ankimd extract`: a package back to Markdown.
 *
 * This direction destroys scheduling, and the command is shaped around that. It
 * writes Markdown and refuses to write a package, because the obvious next thought
 * is to edit the file and build it back over the deck being studied, and that
 * throws away every review the user has ever done. See `docs/round-trip.md`.
 */

export interface ExtractOptions {
  readonly deck: string | undefined;
  readonly force: boolean;
  readonly mediaDir: string | undefined;
  readonly source: string;
  readonly target: string | undefined;
}

const APKG = ".apkg";

/** Point the deck's image references at wherever its files were actually written. */
const relocate = (markdown: string, names: Iterable<string>, directory: string): string => {
  let out = markdown;

  for (const name of names) {
    out = out.replaceAll(`](${name})`, `](${directory}/${name})`);
  }

  return out;
};

const exists = async (at: string): Promise<boolean> => {
  try {
    await stat(at);

    return true;
  } catch {
    return false;
  }
};

export const extract = async (
  options: Readonly<ExtractOptions>,
  reporter: Readonly<Reporter>,
): Promise<void> => {
  const source = path.resolve(callerCwd(), options.source);
  const target = targetPath(source, options.target, ".md");

  if (path.extname(target).toLowerCase() === APKG) {
    throw new Error(
      `${target} is a package, and this command only writes Markdown. Extracting to a ` +
        `package and back would drop every review you have done; edit the deck in Anki.`,
    );
  }

  if (!options.force && (await exists(target))) {
    throw new Error(`${target} already exists. Pass --force to overwrite it.`);
  }

  const { deck, diagnostics, markdown, media } = await readDeck(await readFile(source), {
    title: options.deck ?? path.basename(source, path.extname(source)),
  });

  const mediaDir = path.resolve(callerCwd(), options.mediaDir ?? path.dirname(target));
  const relative = path.relative(path.dirname(target), mediaDir);

  await mkdir(mediaDir, { recursive: true });
  await Promise.all(
    [...media].map(([name, data]: readonly [string, Uint8Array]) =>
      writeFile(path.join(mediaDir, name), data),
    ),
  );

  /* With the files beside the Markdown, the names the deck already carries resolve
     as written and nothing needs rewriting. */
  await writeFile(target, relative === "" ? markdown : relocate(markdown, media.keys(), relative));

  report(reporter, path.basename(source), diagnostics);
  reporter.warn(
    `ankimd: wrote ${deck.cards.length} card(s) and ${media.size} media file(s) to ${target}`,
  );
};
