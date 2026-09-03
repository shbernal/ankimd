import { readFileSync } from "node:fs";

import { reasonOf } from "@ankimd/core";
import yargs from "yargs";

import { build } from "./build.js";
import { extract } from "./extract.js";
import { CODE_THEMES } from "./highlight.js";
import { DEFAULT_TIMEOUT_MS } from "./media.js";
import { consoleReporter, type Reporter } from "./report.js";

/*
 * The `ankimd` binary.
 *
 * Two commands, and the split between them is the split in the format itself:
 * `build` is the producer and `extract` is the consumer. Everything either one
 * decides is a decision `@ankimd/core` refused to make, which is why this file
 * exists at all rather than the library growing options.
 */

const FAILED = 1;

/**
 * This package's own version.
 *
 * Read rather than left to yargs, which looks for the nearest `package.json` above
 * the running file and finds the workspace root when the binary is run from a
 * checkout. `../package.json` is this package's from `dist/` and from `src/` alike.
 */
const version = (): string => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- our own manifest.
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };

  return manifest.version;
};

const parser = (argv: readonly string[], reporter: Readonly<Reporter>) =>
  yargs([...argv])
    .scriptName("ankimd")
    .usage("$0 <command>")
    .command(
      "build <source>",
      "Convert Flashcard Markdown into an Anki package.",
      (command) =>
        command
          .positional("source", {
            describe: "A Markdown file, or a directory to read every Markdown file in",
            type: "string",
          })
          .option("output", {
            alias: "o",
            describe: "Where to write the .apkg. Defaults to the source's name.",
            type: "string",
          })
          .option("deck", {
            describe: "The Anki deck's name. Defaults to the file's title heading.",
            type: "string",
          })
          .option("template", {
            describe: "A directory holding front.html, back.html and style.css",
            type: "string",
          })
          .option("code-theme", {
            choices: CODE_THEMES,
            default: "dark",
            describe: "Which Prism theme colours fenced code blocks",
          })
          .option("remote-media", {
            default: true,
            describe: "Download images the deck references over http and https",
            type: "boolean",
          })
          .option("remote-timeout", {
            default: DEFAULT_TIMEOUT_MS,
            describe: "How long to wait for one download, in milliseconds",
            type: "number",
          })
          .example("$0 build notes.md -o deck.apkg", "One file into one package")
          .example("$0 build ./vault --deck French -o french.apkg", "A whole directory"),
      (args) =>
        build(
          {
            /* Narrowed rather than asserted: yargs types a `choices` option as
               `string` once it also carries a default. */
            codeTheme: args.codeTheme === "light" ? "light" : "dark",
            deck: args.deck,
            remoteMedia: args.remoteMedia,
            remoteTimeoutMs: args.remoteTimeout,
            source: String(args.source),
            target: args.output,
            template: args.template,
          },
          reporter,
        ),
    )
    .command(
      "extract <source>",
      "Read an Anki package back into Flashcard Markdown.",
      (command) =>
        command
          .positional("source", { describe: "An .apkg file", type: "string" })
          .option("output", {
            alias: "o",
            describe: "Where to write the Markdown. Defaults to the source's name.",
            type: "string",
          })
          .option("deck", {
            describe: "The title to give the deck. Defaults to the file's name.",
            type: "string",
          })
          .option("media-dir", {
            describe: "Where to write the images. Defaults to beside the Markdown.",
            type: "string",
          })
          .option("force", {
            default: false,
            describe: "Overwrite the output file if it is already there",
            type: "boolean",
          })
          .example("$0 extract deck.apkg -o notes.md", "A package into one file"),
      (args) =>
        extract(
          {
            deck: args.deck,
            force: args.force,
            mediaDir: args.mediaDir,
            source: String(args.source),
            target: args.output,
          },
          reporter,
        ),
    )
    .demandCommand(1, "Say which command to run: build or extract.")
    .strict()
    .help()
    .version(version())
    /* Turned off so a failure comes back here as a rejection: yargs would
       otherwise print its own message and call `process.exit`, which a test
       cannot see and a caller cannot decide about. */
    .fail(false);

/**
 * Run the binary.
 *
 * Returns an exit code rather than calling `process.exit`, so a test can run a
 * whole conversion and read what came of it.
 */
export const main = async (
  argv: readonly string[],
  reporter: Readonly<Reporter> = consoleReporter,
): Promise<number> => {
  try {
    await parser(argv, reporter).parseAsync();

    return 0;
  } catch (error) {
    reporter.line(`ankimd: ${reasonOf(error)}`);

    return FAILED;
  }
};
