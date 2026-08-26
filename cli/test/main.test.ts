import { describe, expect, it, vi } from "vitest";

import main from "../src/index.js";

describe("the binary entry point", () => {
  it("exits zero and says there is nothing to run yet", () => {
    expect.hasAssertions();

    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    expect(main([])).toBe(0);
    expect(write).toHaveBeenCalledTimes(1);

    write.mockRestore();
  });
});
