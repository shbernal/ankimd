import { stat } from "node:fs/promises";
import path from "node:path";

import fastGlob from "fast-glob";

/*
 * Which files a source argument names, which the library refuses on purpose.
 *
 * `@ankimd/core` takes a `Deck`. Turning a path into one, or a directory into
 * many, is this program's job.
 */

export const MARKDOWN_EXTENSIONS = [".md", ".markdown"] as const;

/**
 * Where the caller was standing when it typed the command.
 *
 * `pnpm --dir` runs the binary with the repository as its working directory, so a
 * development wrapper sets this and relative paths still mean what the user meant.
 * Unset, which is every real installation, it is just `process.cwd()`.
 */
export const callerCwd = (): string => process.env.ANKIMD_CALLER_CWD ?? process.cwd();

const isMarkdown = (file: string): boolean =>
  MARKDOWN_EXTENSIONS.some((extension) => extension === path.extname(file).toLowerCase());

/** Every Markdown file a source path names, sorted, so a deck is built the same way twice. */
export const markdownFiles = async (source: string): Promise<string[]> => {
  /* `stat`, not `lstat`: a vault reached through a symlink is an ordinary directory.
     A broken link still lands in the catch, which is the right answer for one. */
  const stats = await stat(source).catch(() => {
    throw new Error(`${source} does not exist`);
  });

  if (!stats.isDirectory()) {
    if (!isMarkdown(source)) {
      throw new Error(`${source} is not a Markdown file`);
    }

    return [source];
  }

  const extensions = MARKDOWN_EXTENSIONS.map((extension) => extension.slice(1)).join(",");
  /* The directory is a path, not a pattern. `escapePath` keeps a folder called
     `notes{a,b}` from being read as one; it leaves separators alone, so the Windows
     ones still have to be turned round by hand. */
  const base = fastGlob.escapePath(source.replaceAll("\\", "/"));
  const found = await fastGlob(`${base}/**/*.{${extensions}}`, {
    dot: false,
  });

  if (found.length === 0) {
    throw new Error(`${source} holds no Markdown files`);
  }

  return found.toSorted((left: string, right: string) => left.localeCompare(right));
};

/** The directories to look for images in: one per source file, in order, deduplicated. */
export const mediaDirectories = (files: readonly string[]): string[] => [
  ...new Set(files.map((file) => path.dirname(file))),
];

/**
 * Where the output goes.
 *
 * With no `-o`, a single source file names it: the same stem, the new extension, in
 * the directory the caller is standing in. A directory has no stem to borrow, so it
 * has to be told.
 */
export const targetPath = (
  source: string,
  target: string | undefined,
  extension: string,
): string => {
  if (target !== undefined && target !== "") {
    return path.resolve(callerCwd(), target);
  }

  const stem = path.basename(source, path.extname(source));

  return path.resolve(callerCwd(), `${stem}${extension}`);
};
