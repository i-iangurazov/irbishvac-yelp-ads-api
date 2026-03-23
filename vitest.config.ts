import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  }
});
