import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
      /*
       * A floor, not a target. The two branches short of 100% are both the same
       * thing: a capture group that its pattern always fills, which the type still
       * says may be missing. Nothing can reach the missing arm. The floor binds
       * `test:coverage` rather than `pnpm test`, so the gate CI runs stays fast.
       */
      thresholds: { branches: 99, functions: 100, lines: 100, statements: 100 },
    },
    include: ["test/**/*.{test,spec}.ts"],
    /*
     * Not the Vitest default, which is `forks`. Threads are cheaper to start
     * and nothing here needs process isolation.
     */
    pool: "threads",
  },
});
