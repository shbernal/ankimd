import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import AnkiExport from "@shbernal/anki-apkg-export";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { main } from "../src/index.js";
import type { Reporter } from "../src/report.js";

/*
 * The binary, run through `main` rather than through a subprocess.
 *
 * Every command's real work is in `@ankimd/core` and is tested there. What is
 * tested here is the part that is only true of a program: which files a path
 * names, what the deck ends up called, what gets refused, and whether anything
 * that was lost reached the user.
 */

/** A 4x4 PNG, so the media path is exercised with a real file rather than bytes. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAEAQMAAACTPww9AAAAA1BMVEUgQEDcqAWnAAAAC0lEQVR4nGNgQAcAABAAAaOWEC4AAAAASUVORK5CYII=",
  "base64",
);

const DECK = `# Botany

## Leaf venation patterns

![Venation](venation.png)

***

- Parallel venation is typical of monocots

#morphology

## Which pigment absorbs red light?

\`\`\`python
chlorophyll = "a"
\`\`\`
`;

describe("the ankimd binary", () => {
  let directory: string;
  let lines: string[];
  let reporter: Reporter;

  const at = (...parts: readonly string[]): string => path.join(directory, ...parts);

  const run = (...argv: readonly string[]): Promise<number> => main(argv, reporter);

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "ankimd-cli-"));
    lines = [];
    reporter = {
      line: (text: string) => {
        lines.push(text);
      },
    };
    await writeFile(at("notes.md"), DECK);
    await writeFile(at("venation.png"), PNG);
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("refuses to run with no command at all", async () => {
    expect.hasAssertions();
    await expect(run()).resolves.toBe(1);
  });

  describe("build", () => {
    it("writes a package and says how many cards went into it", async () => {
      expect.hasAssertions();

      const code = await run("build", at("notes.md"), "-o", at("deck.apkg"));

      expect(code).toBe(0);
      const written = await readFile(at("deck.apkg"));

      expect(lines.at(-1)).toContain("wrote 2 card(s)");
      expect(written.length).toBeGreaterThan(0);
    });

    it("reads every Markdown file in a directory, in name order", async () => {
      expect.hasAssertions();

      await mkdir(at("vault", "b"), { recursive: true });
      await writeFile(at("vault", "a.md"), "## First\n\n- one\n");
      await writeFile(at("vault", "b", "c.md"), "## Second\n\n- two\n");
      await writeFile(at("vault", "notes.txt"), "## Ignored\n\n- three\n");

      const code = await run("build", at("vault"), "-o", at("deck.apkg"), "--deck", "Vault");

      expect(code).toBe(0);
      expect(lines.at(-1)).toContain("wrote 2 card(s)");
    });

    it("says what a file gave up on the way in", async () => {
      expect.hasAssertions();

      await writeFile(at("stray.md"), "# One\n\n## Card\n\n- body\n\n# Two\n");
      await run("build", at("stray.md"), "-o", at("deck.apkg"));

      expect(lines.some((line) => line.includes("stray-h1"))).toBe(true);
    });

    it("refuses a file with no cards in it", async () => {
      expect.hasAssertions();

      await writeFile(at("empty.md"), "# Just a title\n\nAnd a paragraph.\n");
      const code = await run("build", at("empty.md"), "-o", at("deck.apkg"));

      expect(code).toBe(1);
      expect(lines.at(-1)).toContain("holds no cards");
    });

    it("refuses a source that is not Markdown", async () => {
      expect.hasAssertions();

      const code = await run("build", at("venation.png"), "-o", at("deck.apkg"));

      expect(code).toBe(1);
      expect(lines.at(-1)).toContain("not a Markdown file");
    });

    it("refuses a source that is not there", async () => {
      expect.hasAssertions();

      const code = await run("build", at("missing.md"), "-o", at("deck.apkg"));

      expect(code).toBe(1);
      expect(lines.at(-1)).toContain("does not exist");
    });

    it("refuses a template directory that is missing a file", async () => {
      expect.hasAssertions();

      await mkdir(at("template"));
      await writeFile(at("template", "front.html"), "{{Front}}");

      const code = await run(
        "build",
        at("notes.md"),
        "-o",
        at("deck.apkg"),
        "--template",
        at("template"),
      );

      expect(code).toBe(1);
      expect(lines.at(-1)).toContain("back.html");
    });

    it("uses the template directory it is given", async () => {
      expect.hasAssertions();

      await mkdir(at("template"));
      await writeFile(at("template", "front.html"), "{{Front}}");
      await writeFile(at("template", "back.html"), "{{Back}}");
      await writeFile(at("template", "style.css"), ".card { color: rebeccapurple }");

      const plain = await run("build", at("notes.md"), "-o", at("plain.apkg"));
      const themed = await run(
        "build",
        at("notes.md"),
        "-o",
        at("themed.apkg"),
        "--template",
        at("template"),
      );

      const first = await readFile(at("plain.apkg"));
      const second = await readFile(at("themed.apkg"));

      expect([plain, themed]).toStrictEqual([0, 0]);
      expect(first.equals(second)).toBe(false);
    });

    /* The library refuses to open a socket; this is where that becomes a choice. */
    it("reports a remote image it was told not to download", async () => {
      expect.hasAssertions();

      await writeFile(at("remote.md"), "## Card\n\n![](https://example.invalid/a.png)\n");
      await run("build", at("remote.md"), "-o", at("deck.apkg"), "--no-remote-media");

      expect(lines.some((line) => line.includes("remote media is off"))).toBe(true);
    });
  });

  describe("extract", () => {
    const buildDeck = async (): Promise<void> => {
      await run("build", at("notes.md"), "-o", at("deck.apkg"));
      lines = [];
    };

    it("writes Markdown and the media beside it", async () => {
      expect.hasAssertions();

      await buildDeck();
      const code = await run("extract", at("deck.apkg"), "-o", at("back.md"));
      const written = await readFile(at("back.md"), "utf8");

      expect(code).toBe(0);
      expect(written).toContain("## Leaf venation patterns");
      /* The image is beside the file, so the name it already carries resolves. */
      expect(written).toMatch(/!\[Venation\]\([\da-f]{32}\.png\)/u);
      expect(lines.at(-1)).toContain("1 media file(s)");
    });

    it("points the references at the media directory it was given", async () => {
      expect.hasAssertions();

      await buildDeck();
      await run("extract", at("deck.apkg"), "-o", at("back.md"), "--media-dir", at("pictures"));
      const written = await readFile(at("back.md"), "utf8");

      expect(written).toMatch(/!\[Venation\]\(pictures\/[\da-f]{32}\.png\)/u);
    });

    /*
     * Extracting to a package and building it back would drop every review the
     * user has done, and it is the first thing anyone tries. See
     * `docs/round-trip.md`.
     */
    it("refuses to write a package", async () => {
      expect.hasAssertions();

      await buildDeck();
      const code = await run("extract", at("deck.apkg"), "-o", at("again.apkg"));

      expect(code).toBe(1);
      expect(lines.at(-1)).toContain("only writes Markdown");
    });

    it("refuses to overwrite a file it was not told to", async () => {
      expect.hasAssertions();

      await buildDeck();
      await writeFile(at("back.md"), "mine");

      await expect(run("extract", at("deck.apkg"), "-o", at("back.md"))).resolves.toBe(1);
      expect(lines.at(-1)).toContain("--force");
      await expect(run("extract", at("deck.apkg"), "-o", at("back.md"), "--force")).resolves.toBe(
        0,
      );
    });

    /*
     * A media name is whatever the package says it is, and nothing between the
     * archive and the filesystem checks it, so a deck someone sent you can name a
     * file anywhere on the disk. Extracting one is what this command is for.
     */
    it("refuses a media name that climbs out of the media directory", async () => {
      expect.hasAssertions();

      const exporter = await AnkiExport("Hostile");

      try {
        exporter.addMedia("../escaped.txt", new Uint8Array([1, 2, 3]));
        exporter.addCard("Question", '<img src="../escaped.txt">');
        await writeFile(at("hostile.apkg"), await exporter.save());
      } finally {
        exporter.close();
      }

      const code = await run("extract", at("hostile.apkg"), "-o", at("out", "back.md"));

      expect(code).toBe(0);
      await expect(readFile(at("escaped.txt"), "utf8")).rejects.toThrow(/ENOENT/u);
      expect(lines.join("\n")).toContain("unrepresentable-content");
      /* §3.1: one refused file does not fail the extraction. */
      await expect(readFile(at("out", "back.md"), "utf8")).resolves.toContain("## Question");
    });

    it("titles the deck after the file, or after what it is told", async () => {
      expect.hasAssertions();

      await buildDeck();
      await run("extract", at("deck.apkg"), "-o", at("named.md"), "--deck", "Plants");

      const written = await readFile(at("named.md"), "utf8");

      expect(written).toContain("# Plants\n");
    });
  });
});
