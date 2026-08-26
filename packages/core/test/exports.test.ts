import { describe, expect, it } from "vitest";

describe("the package entry point", () => {
  it("is importable as ESM", async () => {
    expect.hasAssertions();

    /*
     * The scaffold's only claim: the package resolves and loads. It grows into
     * a real suite as the surface does.
     */
    await expect(import("../src/index.js")).resolves.toBeDefined();
  });
});
