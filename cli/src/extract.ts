import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { type Diagnostic, diagnostic, readDeck } from "@ankimd/core";

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

/**
 * Whether a media name from the package stays inside the directory being written to.
 *
 * The name is whatever the `.apkg` says it is, and nothing between there and here
 * checks it, so `../../.bashrc` is a name a crafted package can carry. Extracting a
 * deck someone sent you is what this command is for, so it is refused here rather
 * than trusted. §3.1 forbids failing the whole extraction over one file: the name
 * becomes a diagnostic and the reference stays in the card as written, which is what
 * an image the package never carried already does.
 */
const staysInside = (directory: string, name: string): boolean => {
  const relative = path.relative(directory, path.resolve(directory, name));

  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

/**
 * Writes the media into `directory`, and names the entries it would not write.
 *
 * The names come back so the Markdown can be pointed at the files that exist, and
 * the refused ones stay in the card exactly as an image the package never carried
 * already does.
 */
const writeMedia = async (
  directory: string,
  media: ReadonlyMap<string, Uint8Array>,
): Promise<{ diagnostics: Diagnostic[]; names: string[] }> => {
  const names = [...media.keys()].filter((name) => staysInside(directory, name));

  await mkdir(directory, { recursive: true });
  await Promise.all(
    names.map((name) => writeFile(path.join(directory, name), media.get(name) ?? new Uint8Array())),
  );

  return {
    diagnostics: [...media.keys()]
      .filter((name) => !staysInside(directory, name))
      .map((name) =>
        diagnostic(
          "unrepresentable-content",
          `the media file "${name}" is named outside the media directory and was not ` +
            `written. Its reference stays in the card as written.`,
        ),
      ),
    names,
  };
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
  /* Markdown link paths are "/" whatever the platform separator is. */
  const relative = path.relative(path.dirname(target), mediaDir).replaceAll(path.sep, "/");

  const written = await writeMedia(mediaDir, media);

  /* With the files beside the Markdown, the names the deck already carries resolve
     as written and nothing needs rewriting. */
  await writeFile(target, relative === "" ? markdown : relocate(markdown, written.names, relative));

  report(reporter, path.basename(source), [...diagnostics, ...written.diagnostics]);
  reporter.line(
    `ankimd: wrote ${deck.cards.length} card(s) and ${written.names.length} media file(s) to ${target}`,
  );
};
