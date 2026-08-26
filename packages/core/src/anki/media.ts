import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { type Diagnostic, diagnostic, reasonOf } from "../diagnostics.js";

/*
 * Images, from the reference a card carries to the bytes a package ships.
 *
 * §7 defines images at the level of the reference, and resolving one is filesystem or
 * network work that the format has nothing to say about. So resolution is a function
 * the caller supplies: this module owns the naming, the deduplication and, above all,
 * the obligation in §3.3 that nothing be lost in silence.
 *
 * An image that will not resolve is a quality loss, not a parse failure, and §3.1
 * forbids refusing a whole file over one card. So the reference is left as the author
 * wrote it and a diagnostic names it. The one outcome that is not allowed is a card
 * that quietly renders a broken image.
 */

/** One image's bytes, plus the extension its name in the package should carry. */
export interface ResolvedMedia {
  readonly data: Uint8Array;
  /** Including the leading dot, or `""` when the source names no extension. */
  readonly extension: string;
}

/**
 * Turns an image reference into bytes, or rejects.
 *
 * The rejection's message reaches the user through an `unresolved-image` diagnostic,
 * so it should say what was tried and where.
 */
export type MediaResolver = (src: string) => Promise<ResolvedMedia>;

const REMOTE = /^https?:\/\//iu;

/**
 * Reads images from a directory, refusing remote ones.
 *
 * Downloading is deliberately not here: it needs a timeout, a policy on whether it is
 * allowed at all, and a network the caller may not want touched. A resolver that wants
 * both wraps this one.
 */
export const localMedia =
  (baseDirectory: string): MediaResolver =>
  async (src: string): Promise<ResolvedMedia> => {
    if (REMOTE.test(src)) {
      throw new Error(
        `"${src}" is remote, and this resolver reads local files only. ` +
          `Download the image beside the deck, or pass a resolver that fetches.`,
      );
    }

    const file = path.resolve(baseDirectory, decodeURIComponent(src));

    try {
      return { data: await readFile(file), extension: path.extname(file) };
    } catch (error) {
      throw new Error(`could not read ${file}: ${reasonOf(error)}`, { cause: error });
    }
  };

/** The `src` of every `<img>` the Markdown renderer emitted, and of any the author wrote. */
const SRC = /src="(?<src>[^"]*)"/gu;

/** Anki names a media file by content, so two references to one image ship one file. */
const nameFor = ({ data, extension }: Readonly<ResolvedMedia>): string =>
  `${createHash("md5").update(data).digest("hex")}${extension}`;

const unresolved = (src: string, cardIndex: number, error: unknown): Diagnostic =>
  diagnostic(
    "unresolved-image",
    `the image "${src}" could not be resolved (${reasonOf(error)}). It stays in the ` +
      `card as written and is not in the package.`,
    cardIndex,
  );

export interface MediaCollector {
  /**
   * Rewrites every `src` in one field to the name its bytes ship under, collecting
   * those bytes on the way.
   *
   * @param cardIndex the card this field belongs to, so an unresolved image can say
   *   which card the reader should go and look at.
   */
  readonly rewrite: (html: string, cardIndex: number) => Promise<string>;
  /** Everything resolved so far, keyed by the name the rewritten HTML now references. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * @param resolve how to turn a reference into bytes, or `undefined` to leave every
 *   reference exactly as written. Passing nothing is not a silent loss: no image was
 *   dropped, the field says what the Markdown said, and a caller that wants the images
 *   packaged is the one that knows where they live.
 */
export const createMediaCollector = (resolve?: MediaResolver): MediaCollector => {
  const files = new Map<string, Uint8Array>();
  const diagnostics: Diagnostic[] = [];

  /** The name the bytes ship under, or `null` when the reference stays as written. */
  const resolveOne = async (src: string, cardIndex: number): Promise<string | null> => {
    if (resolve === undefined || src === "") {
      return null;
    }

    try {
      const media = await resolve(src);
      const name = nameFor(media);
      files.set(name, media.data);

      return name;
    } catch (error) {
      diagnostics.push(unresolved(src, cardIndex, error));

      return null;
    }
  };

  /*
   * One reference at a time rather than `Promise.all`. Both the media map's insertion
   * order and the diagnostic list's are output: the first decides the indices entries
   * are stored under in the package, and a deck whose bytes depend on which read
   * finished first is not reproducible. Concurrency here would buy a few milliseconds
   * of file reads and cost that.
   */
  const rewrite = async (html: string, cardIndex: number): Promise<string> => {
    let out = "";
    let copied = 0;

    for (const match of html.matchAll(SRC)) {
      // oxlint-disable-next-line no-await-in-loop -- see above: the order is output.
      const name = await resolveOne(match.groups?.src ?? "", cardIndex);
      if (name !== null) {
        out += `${html.slice(copied, match.index)}src="${name}"`;
        copied = match.index + match[0].length;
      }
    }

    return out + html.slice(copied);
  };

  return { diagnostics, files, rewrite };
};
