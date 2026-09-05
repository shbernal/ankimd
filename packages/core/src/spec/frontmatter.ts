import { parse as parseYaml } from "yaml";

import { type Diagnostic, diagnostic, reasonOf } from "../diagnostics.js";
import { asTagToken } from "./tags.js";

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

/** The opening delimiter is line 1, so the block's own first line is line 2. */
const BLOCK_FIRST_LINE = 2;

/** A tag written with a leading `#`: valid under §6.4, and not the canonical spelling. */
export interface HashedTag {
  /** As the file spells it, `#verbs`. */
  readonly written: string;
  /** 1-based source line, `undefined` when the entry cannot be traced back to one. */
  readonly line: number | undefined;
}

export interface FrontmatterResult {
  /** The parsed block, `{}` when there is none. */
  readonly data: Record<string, unknown>;
  /** Tags from `tags`, with a leading `#` stripped. */
  readonly fileTags: string[];
  /** The entries that carried that `#`, for the producer gate. Empty on a canonical file. */
  readonly hashedTags: readonly HashedTag[];
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

const notAScalar = (): Diagnostic =>
  diagnostic(
    "frontmatter-tags-not-a-sequence",
    'an entry under "tags" is not a single tag, so it was left out. §6.4 makes the ' +
      "value a flat sequence of tags.",
  );

const noSpelling = (written: string): Diagnostic =>
  diagnostic(
    "unrepresentable-content",
    `the frontmatter tag "${written}" has no spelling in this format and was left ` +
      `out of the deck. Tags are letters, digits, "_", "-" and "/", with at least ` +
      `one character that is not a digit.`,
  );

const sanitized = (written: string, tag: string): Diagnostic =>
  diagnostic(
    "tag-sanitized",
    `the frontmatter tag "${written}" holds characters §6.2 has no room for; ` +
      `it was read as "${tag}".`,
  );

/** What YAML's scalars are once parsed. A null entry is answered before this. */
const isScalar = (value: unknown): value is boolean | number | string =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

/** One entry of the sequence: the tag it names, or `null`, and what that cost. */
interface TagEntry {
  readonly tag: string | null;
  readonly diagnostics: readonly Diagnostic[];
  /** The entry as written, when it was written with a leading `#`. */
  readonly hashed: string | null;
}

/**
 * One entry of the `tags` sequence, held to §6.2.
 *
 * §3.3 is why nothing here returns quietly except a null entry, which is how YAML
 * spells a list item with nothing on it: there is no tag there to lose.
 *
 * The grammar is applied here rather than left to the export path. `toAnkiTags` would
 * catch the whitespace in one of these, but only on the way to a package, which leaves
 * every other consumer holding a tag the format's own grammar rejects.
 */
const readTagEntry = (entry: unknown): TagEntry => {
  if (entry === null || entry === undefined) {
    return { diagnostics: [], hashed: null, tag: null };
  }

  if (!isScalar(entry)) {
    return { diagnostics: [notAScalar()], hashed: null, tag: null };
  }

  const spelled = String(entry);
  const written = stripLeadingHash(spelled);
  const hashed = spelled === written ? null : spelled;
  const tag = asTagToken(written);

  if (tag === null) {
    return { diagnostics: [noSpelling(written)], hashed, tag: null };
  }

  return { diagnostics: tag === written ? [] : [sanitized(written, tag)], hashed, tag };
};

const readTagEntries = (
  entries: readonly unknown[],
): { fileTags: string[]; diagnostics: Diagnostic[]; hashed: string[] } => {
  const read = entries.map((entry) => readTagEntry(entry));

  return {
    diagnostics: read.flatMap(({ diagnostics }: Readonly<TagEntry>) => diagnostics),
    fileTags: read.map(({ tag }: Readonly<TagEntry>) => tag).filter((tag) => tag !== null),
    hashed: read.map(({ hashed }: Readonly<TagEntry>) => hashed).filter((entry) => entry !== null),
  };
};

/*
 * Where the block spells a tag, so the producer gate can point a line at it.
 *
 * Matched by text because the parse holds only the value: a bare entry, a quoted one
 * and a flow sequence all carry the written form somewhere on their own line. An entry
 * no line claims is still reported, without one.
 */
const lineOfTag = (blockLines: readonly string[], written: string): number | undefined => {
  const at = blockLines.findIndex((line) => line.includes(written));

  return at === -1 ? undefined : at + BLOCK_FIRST_LINE;
};

const readFileTags = (
  data: Readonly<Record<string, unknown>>,
  blockLines: readonly string[],
): { fileTags: string[]; diagnostics: Diagnostic[]; hashedTags: HashedTag[] } => {
  const diagnostics: Diagnostic[] = [];

  if (data.tag !== undefined && data.tag !== null) {
    diagnostics.push(aliasUsed());
  }

  const value = data.tags;

  if (value === undefined || value === null) {
    return { diagnostics, fileTags: [], hashedTags: [] };
  }

  if (!Array.isArray(value)) {
    diagnostics.push(notASequence());
    return { diagnostics, fileTags: [], hashedTags: [] };
  }

  const read = readTagEntries(value as unknown[]);

  return {
    diagnostics: [...diagnostics, ...read.diagnostics],
    fileTags: read.fileTags,
    hashedTags: [...new Set(read.hashed)].map((written) => ({
      line: lineOfTag(blockLines, written),
      written,
    })),
  };
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
    return {
      body: lines,
      bodyStartLine: 1,
      data: {},
      diagnostics: [],
      fileTags: [],
      hashedTags: [],
    };
  }

  const body = lines.slice(closing + 1);
  const bodyStartLine = closing + LINES_BEFORE_BODY;
  const blockLines = lines.slice(1, closing);
  const block = parseBlock(blockLines.join("\n"));
  const bare = { body, bodyStartLine, data: {}, diagnostics: [], fileTags: [], hashedTags: [] };

  if ("reason" in block) {
    return {
      ...bare,
      diagnostics: [
        diagnostic(
          "unrepresentable-content",
          `the frontmatter block is not valid YAML and was skipped: ${block.reason}`,
        ),
      ],
    };
  }

  if (!isRecord(block.parsed)) {
    return bare;
  }

  const { diagnostics, fileTags, hashedTags } = readFileTags(block.parsed, blockLines);

  return { body, bodyStartLine, data: block.parsed, diagnostics, fileTags, hashedTags };
};
