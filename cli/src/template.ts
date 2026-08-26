import { readFile } from "node:fs/promises";
import path from "node:path";

import { type CodeTheme, themeCss } from "./highlight.js";

/*
 * The note type's look, which the library refuses on purpose.
 *
 * `@ankimd/core` passes a template through and never goes looking for one; finding
 * a directory of HTML on disk is this program's job.
 */

export interface Template {
  readonly answerFormat: string;
  readonly css: string;
  readonly questionFormat: string;
}

const QUESTION = "{{Front}}";
const ANSWER = '{{FrontSide}}\n\n<hr id="answer">\n\n{{Back}}';

/** Enough to read a card by, and to keep a code block from setting its own size. */
const CARD_CSS = `.card {
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
  font-size: 16px;
  text-align: left;
}

pre[class*="language-"] {
  font-size: 0.9em;
  text-align: left;
}
`;

/** The three files a template directory holds, and the field each one fills. */
const TEMPLATE_FILES = {
  answerFormat: "back.html",
  css: "style.css",
  questionFormat: "front.html",
} as const;

/**
 * The default note type, with the code theme's stylesheet folded into its CSS.
 *
 * Anki serves a note type's CSS to every card, so the highlighting styles ride
 * along with no media file and no `<link>` for the card to resolve.
 */
export const defaultTemplate = async (theme: CodeTheme): Promise<Template> => ({
  answerFormat: ANSWER,
  css: `${CARD_CSS}\n${await themeCss(theme)}`,
  questionFormat: QUESTION,
});

/** One of the three files, read or missing, and which field it fills. */
interface TemplateFile {
  readonly contents: string | null;
  readonly field: string;
  readonly file: string;
}

/**
 * A template read from a directory, which must hold all three files.
 *
 * All or nothing: a directory with `front.html` and no `style.css` would give a
 * card the caller's question format and somebody else's colours, which is not a
 * mixture anyone asked for.
 */
export const readTemplate = async (directory: string): Promise<Template> => {
  const read = await Promise.all(
    Object.entries(TEMPLATE_FILES).map(
      async ([field, file]: readonly [string, string]): Promise<TemplateFile> => ({
        contents: await readFile(path.join(directory, file), "utf8").catch(() => null),
        field,
        file,
      }),
    ),
  );
  const missing = read
    .filter((entry: Readonly<TemplateFile>) => entry.contents === null)
    .map((entry: Readonly<TemplateFile>) => entry.file);

  if (missing.length > 0) {
    throw new Error(`Template directory ${directory} has no ${missing.toSorted().join(", no ")}`);
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keys are the ones above.
  return Object.fromEntries(
    read.map((entry: Readonly<TemplateFile>) => [entry.field, entry.contents]),
  ) as unknown as Template;
};
