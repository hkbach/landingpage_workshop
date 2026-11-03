import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // The first test of a file pays for loading the mock stores and Intl (1-3 s alone); with every file running at once that can pass the default 5 s.
  test: { environment: "node", include: ["src/**/*.test.ts"], testTimeout: 20_000 },
});
