import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// TEST_DATABASE_URL (the integration tests) comes from apps/api/.env when the file exists; without it those tests are skipped.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    // The integration tests share one database and one outbox: one file at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
