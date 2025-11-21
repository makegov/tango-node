import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [".*", "*.config.*s", "dist/**/**", "src/index.ts", "src/shapes/index.ts", "tests/**/**"],
    },
  },
  esbuild: {
    loader: "ts",
    target: "es2020",
  },
});
