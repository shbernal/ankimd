import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
    },
    include: ["test/**/*.{test,spec}.ts"],
    /*
     * Not the Vitest 4 default, which is `forks`. Threads are cheaper to start
     * and nothing here needs process isolation.
     */
    pool: "threads",
  },
});
