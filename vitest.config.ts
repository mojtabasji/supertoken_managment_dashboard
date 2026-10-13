import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    setupFiles: ["src/tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside a React server environment; stub it for
      // plain Node tests.
      "server-only": path.resolve(import.meta.dirname, "src/tests/stubs/server-only.ts"),
    },
  },
});
