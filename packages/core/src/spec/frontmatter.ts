import { parse as parseYaml } from "yaml";

import { type Diagnostic, diagnostic, reasonOf } from "../diagnostics.js";

/*
 * Flashcard Markdown §4.1. The block is optional, must be first in the file, and
 * defines exactly one key, `tags` (§6.4). Every other key is a user extension: legal,
 * ignored, and never an error. Real decks carry a `type:` that version 1 of the format
 * deliberately does not define, so treating an unknown key as a failure would break
 * files that are conformant.
 */

const DELIMITER = /^---[ \t]*$/u;
const CLOSING = /^(?:---|\.\.\.)[ \t]*$/u;

/** The opening delimiter, the closing one, and then the body. */
const LINES_BEFORE_BODY = 2;

export interface FrontmatterResult {
  /** The parsed block, `{}` when there is none. */
  readonly data: Record<string, unknown>;
  /** Tags from `tags`, with a leading `#` stripped. */
  readonly fileTags: string[];
  readonly diagnostics: readonly Diagnostic[];
  /** The lines below the block; the whole file when there is no block. */
  readonly body: readonly string[];
  /** 1-based line number of the first body line, so diagnostics point at the file. */
  readonly bodyStartLine: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * §6.4: a leading `#` on a frontmatter tag is accepted and stripped, because Obsidian's
 * property editor writes them both ways and a user should not have to know which.
 */
const stripLeadingHash = (tag: string): string => tag.replace(/^#/u, "");

/* Obsidian removed the singular alias in 1.9. Reading it here would mean the vault and
   the flashcard tools disagree about the same file, with the vault showing no tags at
   all, so it is named rather than quietly honoured or quietly dropped. */
const aliasUsed = (): Diagnostic =>
  diagnostic(
    "frontmatter-tags-not-a-sequence",
    'the frontmatter key "tag" is not read as tags: Obsidian removed the singular ' +
      'alias in 1.9. Write a "tags" sequence instead.',
  );

const notASequence = (): Diagnostic =>
  diagnostic(
    "frontmatter-tags-not-a-sequence",
    'the frontmatter key "tags" is not a sequence, so it is not read as tags. ' +
      'Obsidian stopped accepting a scalar in 1.9; write one tag per line under "tags:".',
  );

const readFileTags = (
  data: Readonly<Record<string, unknown>>,
): { fileTags: string[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];

  if (data.tag !== undefined && data.tag !== null) {
    diagnostics.push(aliasUsed());
  }

  const value = data.tags;

  if (value === undefined || value === null) {
    return { diagnostics, fileTags: [] };
  }

  if (!Array.isArray(value)) {
    diagnostics.push(notASequence());
    return { diagnostics, fileTags: [] };
  }

  const fileTags = (value as unknown[])
    .filter((tag): tag is string | number => typeof tag !== "object")
    .map((tag) => stripLeadingHash(String(tag)))
    .filter((tag) => tag !== "");

  return { diagnostics, fileTags };
};

type YamlBlock = { readonly parsed: unknown } | { readonly reason: string };

const parseBlock = (block: string): YamlBlock => {
  try {
    return { parsed: parseYaml(block) as unknown };
  } catch (error) {
    return { reason: reasonOf(error) };
  }
};

/** The index of the closing delimiter, or -1 when the file opens no block at all. */
const findBlockEnd = (lines: readonly string[]): number => {
  const [first] = lines;

  if (first === undefined || !DELIMITER.test(first)) {
    return -1;
  }

  return lines.findIndex((line, index) => index > 0 && CLOSING.test(line));
};

export const splitFrontmatter = (lines: readonly string[]): FrontmatterResult => {
  const closing = findBlockEnd(lines);

  if (closing === -1) {
    return { body: lines, bodyStartLine: 1, data: {}, diagnostics: [], fileTags: [] };
  }

  const body = lines.slice(closing + 1);
  const bodyStartLine = closing + LINES_BEFORE_BODY;
  const block = parseBlock(lines.slice(1, closing).join("\n"));
  const bare = { body, bodyStartLine, data: {}, fileTags: [] };

  if ("reason" in block) {
    const message = `the frontmatter block is not valid YAML and was skipped: ${block.reason}`;

    return { ...bare, diagnostics: [diagnostic("unrepresentable-content", message)] };
  }

  if (!isRecord(block.parsed)) {
    return { ...bare, diagnostics: [] };
  }

  const { diagnostics, fileTags } = readFileTags(block.parsed);

  return { body, bodyStartLine, data: block.parsed, diagnostics, fileTags };
};
