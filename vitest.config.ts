import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
  esbuild: {
    loader: "ts",
    target: "es2020",
  },
});
