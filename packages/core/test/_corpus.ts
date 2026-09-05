import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type { DiagnosticCode } from "../src/diagnostics.js";

/*
 * The Flashcard Markdown conformance corpus, loaded once for the suites that read it.
 *
 * The corpus is a set of verbatim source slices rather than an AST or rendered HTML,
 * which is what lets a line scanner and an HTML emitter assert against one thing.
 * Nothing in src/ knows it exists.
 */

const require = createRequire(import.meta.url);

export const FIXTURES = path.dirname(require.resolve("flashcard-md-spec/manifest.json"));

/** The spec version these suites conform to, pinned rather than tracked. */
export const SPEC_VERSION = "1.1";

export interface ManifestCase {
  readonly id: string;
  readonly tier: "canonical" | "valid" | "invalid";
  readonly description: string;
  readonly diagnostics: readonly DiagnosticCode[];
}

export interface ExpectedDiagnostic {
  readonly code: DiagnosticCode;
  readonly cardIndex: number | null;
}

export interface Expected {
  readonly deck: unknown;
  readonly cards: readonly unknown[];
  readonly diagnostics: readonly ExpectedDiagnostic[];
}

const readJson = async <Shape>(file: string): Promise<Shape> =>
  JSON.parse(await fs.readFile(file, "utf8")) as Shape;

export const readInput = (id: string): Promise<string> =>
  fs.readFile(path.join(FIXTURES, id, "input.md"), "utf8");

export const readExpected = (id: string): Promise<Expected> =>
  readJson<Expected>(path.join(FIXTURES, id, "expected.json"));

export const manifest = await readJson<{ specVersion: string; cases: ManifestCase[] }>(
  path.join(FIXTURES, "manifest.json"),
);

export const casesIn = (tier: ManifestCase["tier"]): ManifestCase[] =>
  manifest.cases.filter((item) => item.tier === tier);

/*
 * `unresolved-image` is the one code in the corpus that nothing reading Markdown can
 * raise: whether an image resolves is a fact about the filesystem, not about the file.
 * Both directions hold it out rather than demand it from a function that cannot know
 * it. Whatever resolves an image is what raises it.
 */
export const PARSE_CANNOT_RAISE = new Set<DiagnosticCode>(["unresolved-image"]);

/*
 * §3.2 scopes the tier 2 producer obligation to spellings, and these four valid cases
 * are not alternative spellings of anything: there is no canonical form to rewrite them
 * into, so the gate accepts them and the serializer writes them back as they were.
 *
 *   §4.1 obliges a tool rewriting a deck to keep an unknown frontmatter key.
 *   §5.5 lets a producer refuse an empty body or a duplicate front, rather than
 *   obliging it to, and the only canonicalization available for a duplicate front is
 *   renaming a heading, which moves card identity (§5.2).
 *   §6.3 requires a tag written inside a sentence to be rendered where the author put
 *   it. The tags-only line it also names does have a canonical position; this one has
 *   none, which is why the case sits here and its siblings do not.
 *
 * A change that made the gate refuse any of the four would be this package refusing a
 * deck the format calls conformant.
 */
export const VALID_WITHOUT_A_SPELLING = new Set<string>([
  "valid/card-with-no-body",
  "valid/duplicate-fronts",
  "valid/tag-inline-in-prose",
  "valid/unknown-frontmatter-keys",
]);

/** True when a case is invalid only for a reason no reader of the source can see. */
export const isInvalidOffPage = (testCase: Readonly<ManifestCase>): boolean =>
  testCase.diagnostics.length > 0 &&
  testCase.diagnostics.every((code) => PARSE_CANNOT_RAISE.has(code));
