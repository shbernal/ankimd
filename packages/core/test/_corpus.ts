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

/** True when a case is invalid only for a reason no reader of the source can see. */
export const isInvalidOffPage = (testCase: Readonly<ManifestCase>): boolean =>
  testCase.diagnostics.length > 0 &&
  testCase.diagnostics.every((code) => PARSE_CANNOT_RAISE.has(code));
