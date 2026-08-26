import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Highlighter } from "@ankimd/core";
import Prism from "prismjs";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-c.js";
import "prismjs/components/prism-cpp.js";
import "prismjs/components/prism-csharp.js";
import "prismjs/components/prism-css.js";
import "prismjs/components/prism-dart.js";
import "prismjs/components/prism-diff.js";
import "prismjs/components/prism-docker.js";
import "prismjs/components/prism-elixir.js";
import "prismjs/components/prism-go.js";
import "prismjs/components/prism-graphql.js";
import "prismjs/components/prism-haskell.js";
import "prismjs/components/prism-ini.js";
import "prismjs/components/prism-java.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-kotlin.js";
import "prismjs/components/prism-latex.js";
import "prismjs/components/prism-lua.js";
import "prismjs/components/prism-makefile.js";
import "prismjs/components/prism-markdown.js";
/* Before `php`, `handlebars` and `smarty`, which reach into it at highlight time
   and fail with a TypeError rather than a missing-language error if it is absent.
   Alphabetical order puts it there already; keep it that way. */
import "prismjs/components/prism-markup-templating.js";
import "prismjs/components/prism-nix.js";
import "prismjs/components/prism-objectivec.js";
import "prismjs/components/prism-ocaml.js";
import "prismjs/components/prism-perl.js";
import "prismjs/components/prism-php.js";
import "prismjs/components/prism-powershell.js";
import "prismjs/components/prism-python.js";
import "prismjs/components/prism-r.js";
import "prismjs/components/prism-regex.js";
import "prismjs/components/prism-ruby.js";
import "prismjs/components/prism-rust.js";
import "prismjs/components/prism-scala.js";
import "prismjs/components/prism-scss.js";
import "prismjs/components/prism-sql.js";
import "prismjs/components/prism-swift.js";
import "prismjs/components/prism-toml.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-yaml.js";
import "prismjs/components/prism-zig.js";

/*
 * Syntax highlighting, which the library refuses on purpose.
 *
 * `@ankimd/core` takes a highlighter and never imports one, so a library consumer
 * does not pull a language table and a stylesheet along with a deck converter. This
 * is where the table and the stylesheet live.
 *
 * The colouring happens once, here, at build time. Nothing is injected into the deck
 * to run inside Anki: the classes Prism emits are styled by the CSS the note type
 * carries, so the card is coloured with no script in it at all.
 */

/** Short names people write on a fence that Prism knows under another. */
const ALIASES: Readonly<Record<string, string>> = {
  "c#": "csharp",
  "c++": "cpp",
  html: "markup",
  js: "javascript",
  md: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  yml: "yaml",
};

export const CODE_THEMES = ["dark", "light"] as const;

export type CodeTheme = (typeof CODE_THEMES)[number];

const THEME_FILE: Readonly<Record<CodeTheme, string>> = {
  dark: "prism-okaidia.css",
  light: "prism.css",
};

/**
 * Colour one fenced block, or hand the code back untouched.
 *
 * A fence with no info string, or one naming a language Prism was not loaded with,
 * is left as it is. Guessing would colour a shell transcript as JavaScript.
 */
export const highlight: Highlighter = (code: string, language?: string): string => {
  const name = ALIASES[language ?? ""] ?? language ?? "";
  const grammar = Prism.languages[name];

  if (grammar === undefined) {
    return code;
  }

  return Prism.highlight(code, grammar, name);
};

/**
 * The theme's stylesheet, read out of the installed `prismjs` rather than vendored.
 *
 * Vendoring it would freeze a copy at whatever version it was taken from, which is
 * the state the package this replaces was in: a 1.19.0 theme shipped beside a 1.30
 * highlighter.
 */
export const themeCss = (theme: CodeTheme): Promise<string> => {
  const themes = path.dirname(fileURLToPath(import.meta.resolve("prismjs/themes/prism.css")));

  return readFile(path.join(themes, THEME_FILE[theme]), "utf8");
};
