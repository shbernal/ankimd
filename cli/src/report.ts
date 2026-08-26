import type { Diagnostic } from "@ankimd/core";

/*
 * Saying what was lost.
 *
 * §3.3 of the format forbids dropping what cannot be represented in silence, which
 * makes a quiet success on a deck with skipped notes a conformance failure rather
 * than a tidy interface. Everything goes to stderr, so `ankimd extract deck.apkg -o
 * -` would still pipe clean Markdown if it ever grows that.
 */

export interface Reporter {
  readonly warn: (line: string) => void;
}

export const consoleReporter: Reporter = {
  warn: (line: string) => {
    process.stderr.write(`${line}\n`);
  },
};

/** One diagnostic, prefixed with the file it came from and the card it belongs to. */
const format = (where: string, { cardIndex, code, message }: Readonly<Diagnostic>): string =>
  `ankimd: ${where}${cardIndex === null ? "" : ` (card ${cardIndex + 1})`}: ${code}: ${message}`;

export const report = (
  reporter: Readonly<Reporter>,
  where: string,
  diagnostics: readonly Diagnostic[],
): void => {
  for (const found of diagnostics) {
    reporter.warn(format(where, found));
  }
};
