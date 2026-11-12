import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// TEST_DATABASE_URL (the integration tests) comes from apps/api/.env when the file exists; without it those tests are skipped.
if (existsSync(".env")) process.loadEnvFile(".env");

// Nest decorators (experimentalDecorators) are read from tsconfig.json by esbuild.
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } });
