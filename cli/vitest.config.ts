import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      /* `bin.ts` is the two lines that only run as a process: the shebang and
         the call. Everything it calls is covered through `main`. */
      exclude: ["src/bin.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
      /*
       * A floor, not a target. What sits under it is the abort callback of a
       * download's timer, which only a real clock can reach. The floor binds
       * `test:coverage` rather than `pnpm test`, so the gate CI runs stays fast.
       */
      thresholds: { branches: 90, functions: 95, lines: 98, statements: 98 },
    },
    include: ["test/**/*.{test,spec}.ts"],
    /*
     * Not the Vitest default, which is `forks`. Threads are cheaper to start
     * and nothing here needs process isolation.
     */
    pool: "threads",
  },
});
