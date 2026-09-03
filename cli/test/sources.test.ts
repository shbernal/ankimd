import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { callerCwd, markdownFiles, mediaDirectories, targetPath } from "../src/sources.js";

/*
 * Turning a path into files, which is the whole of what `@ankimd/core` refuses to
 * do with one: it takes a `Deck` and never goes looking.
 */

describe("what a source path names", () => {
  let directory: string;

  const at = (...parts: readonly string[]): string => path.join(directory, ...parts);

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "ankimd-sources-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
    delete process.env.ANKIMD_CALLER_CWD;
  });

  it("takes a Markdown file as itself", async () => {
    expect.hasAssertions();
    await writeFile(at("a.markdown"), "## card\n");

    await expect(markdownFiles(at("a.markdown"))).resolves.toStrictEqual([at("a.markdown")]);
  });

  it("walks a directory, in name order, ignoring everything else", async () => {
    expect.hasAssertions();
    await mkdir(at("deep"));
    await writeFile(at("b.md"), "");
    await writeFile(at("a.md"), "");
    await writeFile(at("notes.txt"), "");
    await writeFile(at("deep", "c.md"), "");

    const found = await markdownFiles(directory);

    expect(found.map((file) => path.basename(file))).toStrictEqual(["a.md", "b.md", "c.md"]);
  });

  /* `notes{a,b}` is a folder name, not a brace expansion, and fast-glob reads the
     two the same way unless the path is escaped. */
  it("walks a directory whose name looks like a glob pattern", async () => {
    expect.hasAssertions();
    await mkdir(at("notes{a,b}"));
    await writeFile(at("notes{a,b}", "a.md"), "");

    const found = await markdownFiles(at("notes{a,b}"));

    expect(found.map((file) => path.basename(file))).toStrictEqual(["a.md"]);
  });

  /* A vault reached through a symlink is an ordinary directory. */
  it("follows a symlink to a directory", async () => {
    expect.hasAssertions();
    await mkdir(at("real"));
    await writeFile(at("real", "a.md"), "");
    await symlink(at("real"), at("link"), "dir");

    const found = await markdownFiles(at("link"));

    expect(found.map((file) => path.basename(file))).toStrictEqual(["a.md"]);
  });

  it("says a broken symlink does not exist", async () => {
    expect.hasAssertions();
    await symlink(at("nowhere"), at("dangling"), "dir");

    await expect(markdownFiles(at("dangling"))).rejects.toThrow(/does not exist/u);
  });

  it("says so when a directory holds no Markdown at all", async () => {
    expect.hasAssertions();
    await writeFile(at("notes.txt"), "");

    await expect(markdownFiles(directory)).rejects.toThrow(/no Markdown files/u);
  });

  /* One per source file, in order, so an image is looked for beside its own file. */
  it("lists each file's directory once", () => {
    expect.hasAssertions();
    expect(mediaDirectories(["/a/one.md", "/a/two.md", "/b/three.md"])).toStrictEqual(["/a", "/b"]);
  });
});

describe("where the output goes", () => {
  afterEach(() => {
    delete process.env.ANKIMD_CALLER_CWD;
  });

  it("borrows the source's stem when nothing says otherwise", () => {
    expect.hasAssertions();
    process.env.ANKIMD_CALLER_CWD = "/somewhere";

    expect(targetPath("/notes/french.md", undefined, ".apkg")).toBe("/somewhere/french.apkg");
    expect(targetPath("/notes/french.md", "", ".apkg")).toBe("/somewhere/french.apkg");
  });

  it("resolves what it is given against the directory the caller is standing in", () => {
    expect.hasAssertions();
    process.env.ANKIMD_CALLER_CWD = "/somewhere";

    expect(targetPath("/notes/french.md", "out/deck.apkg", ".apkg")).toBe(
      "/somewhere/out/deck.apkg",
    );
  });

  /*
   * `pnpm --dir` runs the binary with the repository as its working directory, so
   * a development wrapper sets this and a relative path still means what the user
   * meant. Unset, which is every real installation, it is just the process's own.
   */
  it("falls back to the process's own directory", () => {
    expect.hasAssertions();
    expect(callerCwd()).toBe(process.cwd());
  });
});
