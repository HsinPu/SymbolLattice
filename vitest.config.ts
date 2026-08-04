import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.{ts,mjs}"],
    environment: "node",
    // Integration cases exercise real SQLite files and filesystem watches.
    // Keep a meaningful per-test ceiling while accommodating slower Windows I/O.
    testTimeout: 30_000,
    clearMocks: true,
    restoreMocks: true
  }
});
