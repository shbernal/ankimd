import type { Diagnostic } from "@ankimd/core";

/*
 * Saying what was lost.
 *
 * §3.3 of the format forbids dropping what cannot be represented in silence, which
 * makes a quiet success on a deck with skipped notes a conformance failure rather
 * than a tidy interface. Everything goes to stderr, so `ankimd extract deck.apkg -o
 * -` would still pipe clean Markdown if it ever grows that.
 */

/** One line out. Every one goes to stderr, results and losses alike, for the reason above. */
export interface Reporter {
  readonly line: (text: string) => void;
}

export const consoleReporter: Reporter = {
  line: (text: string) => {
    process.stderr.write(`${text}\n`);
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
    reporter.line(format(where, found));
  }
};
