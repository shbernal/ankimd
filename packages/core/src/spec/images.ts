import type { DeckImage } from "../deck.js";
import { type ScannedLine, scanLines, splitSourceLines } from "./scan.js";

/*
 * How §7's images are spelled in the source, read and rewritten from one place.
 *
 * §7 leaves the destination unrestricted, so the syntax is CommonMark's and all of
 * it: a bare destination, an angle-bracketed one, and either with a title. A reader
 * that knows only the bare form packages fewer images than the deck names, and a
 * writer that knows only the bare form relocates fewer, both in silence.
 */

/**
 * An inline image. Alt text is SHOULD, not MUST (§7), so the alt group matches empty.
 *
 * The destination is either `<...>` or a bare run, and exactly one of those two groups
 * is set on a match. The title is captured with its quotes so it can be written back
 * as it was; nothing here reads inside it.
 */
const IMAGE =
  /!\[(?<alt>[^\]]*)\]\(\s*(?:<(?<angle>[^\n<>]*)>|(?<bare>[^\s()]+))(?:\s+(?<title>"[^"]*"|'[^']*'))?\s*\)/gu;

/** Whatever forces the angle form: a destination CommonMark cannot read bare. */
const NEEDS_ANGLES = /[\s()<>]/u;

/** The groups of one match, with the two destination forms already collapsed. */
interface Image {
  readonly alt: string;
  readonly src: string;
  readonly title: string | undefined;
}

const imageOf = ({ groups }: RegExpExecArray): Image => ({
  alt: groups?.alt ?? "",
  src: groups?.angle ?? groups?.bare ?? "",
  title: groups?.title,
});

export const imagesIn = (lines: readonly ScannedLine[]): DeckImage[] =>
  lines
    .filter((line) => !line.inCode)
    .flatMap((line) =>
      [...line.text.matchAll(IMAGE)].map((match) => {
        const { alt, src } = imageOf(match);

        return { alt, src };
      }),
    );

const write = ({ alt, title }: Readonly<Image>, src: string): string => {
  const destination = NEEDS_ANGLES.test(src) ? `<${src}>` : src;

  return `![${alt}](${destination}${title === undefined ? "" : ` ${title}`})`;
};

const rewrite = (text: string, moves: ReadonlyMap<string, string>): string => {
  let out = "";
  let read = 0;

  for (const match of text.matchAll(IMAGE)) {
    const image = imageOf(match);
    const moved = moves.get(image.src);

    if (moved !== undefined) {
      out += text.slice(read, match.index) + write(image, moved);
      read = match.index + match[0].length;
    }
  }

  return out + text.slice(read);
};

/**
 * Points image references named by `moves` at their new destinations.
 *
 * By the image, not by the text: a `](name)` written in prose is not a reference and
 * is left alone, one inside a code fence is code, and a destination carrying a title
 * or angle brackets is still that destination. A substring replacement gets all three
 * wrong, which is what this exists to stop.
 *
 * A reference `moves` does not name is untouched, which is what a caller that could
 * not write one of the files needs.
 *
 * Takes canonical Markdown, whose line endings are `\n`, and keeps them.
 */
export const relocateImages = (markdown: string, moves: ReadonlyMap<string, string>): string => {
  if (moves.size === 0) {
    return markdown;
  }

  return scanLines(splitSourceLines(markdown))
    .map((line) => (line.inCode ? line.text : rewrite(line.text, moves)))
    .join("\n");
};
