import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
      /*
       * A floor, not a target. The one branch short of 100% is the `groups` arm of the
       * media scan's `match.groups?.src`, which a pattern that always carries a named
       * group cannot reach and which the type still obliges the code to handle. The
       * floor binds `test:coverage` rather than `pnpm test`, so the gate CI runs stays
       * fast.
       */
      thresholds: { branches: 99, functions: 100, lines: 100, statements: 100 },
    },
    include: ["test/**/*.{test,spec}.ts"],
    /*
     * Not the Vitest 4 default, which is `forks`. Threads are cheaper to start
     * and nothing here needs process isolation.
     */
    pool: "threads",
  },
});
