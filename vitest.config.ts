import { configDefaults, defineConfig } from "vitest/config";

// Production smoke tests are env-gated: they only join the run when TANGO_LIVE_TESTS=true.
// Cassette recording and live runs hit the real API, so they get serial file execution and a generous timeout.
const liveTests = process.env.TANGO_LIVE_TESTS === "true";
const hittingLiveApi = liveTests || process.env.TANGO_REFRESH_CASSETTES === "true" || process.env.TANGO_USE_LIVE_API === "true";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ...(liveTests ? [] : ["tests/production/**"])],
    fileParallelism: !hittingLiveApi,
    ...(hittingLiveApi ? { testTimeout: 60_000 } : {}),
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
