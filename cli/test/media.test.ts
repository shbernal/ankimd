import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { highlight, themeCss } from "../src/highlight.js";
import { createMediaResolver, DEFAULT_TIMEOUT_MS } from "../src/media.js";
import { consoleReporter } from "../src/report.js";

/*
 * The three things the library refused to do, tested where they landed: opening
 * a socket, loading a language table, and writing to a stream.
 */

const BYTES = new Uint8Array([1, 2, 3]);

const resolver = (directories: readonly string[], remote = true) =>
  createMediaResolver({ directories, remote, timeoutMs: DEFAULT_TIMEOUT_MS });

/** A `fetch` that answers with the same bytes however it is called. */
const respondWith = (body: Uint8Array, ok = true, status = 200): typeof fetch =>
  vi.fn<typeof fetch>(async () => {
    await Promise.resolve();

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the two members read.
    return {
      arrayBuffer: () => Promise.resolve(body.buffer),
      ok,
      status,
      statusText: "",
    } as Response;
  });

/** A `fetch` that fails the way the case under test needs it to. */
const failWith = (name: string, message: string): typeof fetch =>
  vi.fn<typeof fetch>(async () => {
    await Promise.resolve();
    const error = new Error(message);
    error.name = name;

    throw error;
  });

describe("resolving media", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "ankimd-media-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
    vi.unstubAllGlobals();
  });

  it("reads a local file from the first directory that has it", async () => {
    expect.hasAssertions();

    const second = await mkdtemp(path.join(os.tmpdir(), "ankimd-media-"));
    await writeFile(path.join(second, "a.png"), BYTES);

    const resolved = await resolver([directory, second])("a.png");

    expect(resolved.extension).toBe(".png");
    await rm(second, { force: true, recursive: true });
  });

  it("names every directory it looked in when there is no such file", async () => {
    expect.hasAssertions();

    await expect(resolver([directory])("gone.png")).rejects.toThrow(/gone\.png/u);
  });

  it("downloads a remote image and takes its extension from the URL", async () => {
    expect.hasAssertions();
    vi.stubGlobal("fetch", respondWith(BYTES));

    const resolved = await resolver([directory])("https://example.org/a.png?v=2#top");

    expect(resolved.extension).toBe(".png");
    expect([...resolved.data]).toStrictEqual([...BYTES]);
  });

  it("gives no extension to a URL that names none", async () => {
    expect.hasAssertions();
    vi.stubGlobal("fetch", respondWith(BYTES));

    const resolved = await resolver([directory])("https://example.org/image");

    expect(resolved.extension).toBe("");
  });

  it("reports the status of a response that is not ok", async () => {
    expect.hasAssertions();
    vi.stubGlobal("fetch", respondWith(BYTES, false, 418));

    await expect(resolver([directory])("https://example.org/a.png")).rejects.toThrow(/418/u);
  });

  it("reports a download that ran out of time", async () => {
    expect.hasAssertions();
    vi.stubGlobal("fetch", failWith("AbortError", "aborted"));

    await expect(
      createMediaResolver({ directories: [], remote: true, timeoutMs: 1 })(
        "https://example.org/a.png",
      ),
    ).rejects.toThrow(/timed out/u);
  });

  it("reports a download that failed for any other reason", async () => {
    expect.hasAssertions();
    vi.stubGlobal("fetch", failWith("TypeError", "getaddrinfo ENOTFOUND"));

    await expect(resolver([directory])("https://example.invalid/a.png")).rejects.toThrow(
      /ENOTFOUND/u,
    );
  });

  it("refuses a remote image when downloads are off", async () => {
    expect.hasAssertions();

    await expect(resolver([directory], false)("https://example.org/a.png")).rejects.toThrow(
      /remote media is off/u,
    );
  });
});

describe("highlighting", () => {
  it("colours a language Prism knows", () => {
    expect.hasAssertions();
    expect(highlight("a = 1", "python")).toContain("token");
  });

  it("understands the short name people write on a fence", () => {
    expect.hasAssertions();
    expect(highlight("const a = 1", "ts")).toContain("token");
  });

  /* Guessing would colour a shell transcript as JavaScript. */
  it("hands back a language it does not know, untouched", () => {
    expect.hasAssertions();
    expect(highlight("a = 1", "brainfuck")).toBe("a = 1");
    expect(highlight("a = 1")).toBe("a = 1");
  });

  it("reads each theme out of the installed prismjs", async () => {
    expect.hasAssertions();

    const dark = await themeCss("dark");
    const light = await themeCss("light");

    expect(dark).toContain("token");
    expect(light).not.toBe(dark);
  });
});

describe("the console reporter", () => {
  it("writes one line to stderr", () => {
    expect.hasAssertions();

    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    consoleReporter.warn("something");

    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });
});
