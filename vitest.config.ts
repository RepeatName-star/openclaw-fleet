import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    // Only run tests from the main repo `tests/` directory.
    // This avoids accidentally running duplicated tests from `.worktrees/**`.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
