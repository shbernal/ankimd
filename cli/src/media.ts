import path from "node:path";

import {
  isRemote,
  localMedia,
  type MediaResolver,
  reasonOf,
  type ResolvedMedia,
} from "@ankimd/core";

/*
 * Media resolution over the network, which the library refuses on purpose.
 *
 * `@ankimd/core` ships `localMedia` and stops there: a library has no business
 * deciding that a conversion may open a socket. This program does decide, and
 * `--no-remote-media` is how a caller says otherwise.
 */

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The extension a URL implies, from its path alone.
 *
 * The path alone, because a host name has dots in it and a query string can have
 * anything at all: reading the extension off the whole URL turns
 * `https://example.org/image` into a file named `.org/image`.
 */
const extensionOf = (url: string): string => path.posix.extname(new URL(url).pathname);

const download = async (src: string, timeoutMs: number): Promise<ResolvedMedia> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(src, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return { data: new Uint8Array(await response.arrayBuffer()), extension: extensionOf(src) };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";

    throw new Error(
      timedOut ? `timed out after ${timeoutMs}ms` : `could not download ${src}: ${reasonOf(error)}`,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
};

export interface MediaOptions {
  /** Where to look for a local image, in order. One entry per source file's directory. */
  readonly directories: readonly string[];
  readonly remote: boolean;
  readonly timeoutMs: number;
}

/**
 * A resolver that reads local files and, unless told not to, downloads remote ones.
 *
 * Several directories rather than one because a deck built from a folder is many
 * files, each with its own images beside it, and the deck they become has no memory
 * of which file a card came from. They are tried in the order the files were read,
 * so the first match wins; for the ordinary case of one source file there is one
 * directory and no ambiguity at all.
 */
export const createMediaResolver = ({
  directories,
  remote,
  timeoutMs,
}: Readonly<MediaOptions>): MediaResolver => {
  const readers = directories.map((directory) => localMedia(directory));

  return async (src: string): Promise<ResolvedMedia> => {
    if (isRemote(src)) {
      if (!remote) {
        throw new Error(
          `remote media is off, so ${src} was not downloaded. ` +
            `Drop --no-remote-media, or save the image beside the deck.`,
        );
      }

      return download(src, timeoutMs);
    }

    const reasons: string[] = [];

    for (const read of readers) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- the first hit wins, so this stops early.
        return await read(src);
      } catch (error) {
        reasons.push(reasonOf(error));
      }
    }

    throw new Error(reasons.join("; "));
  };
};
