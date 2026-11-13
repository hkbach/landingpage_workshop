import { defineConfig, devices } from "@playwright/test";

// End-to-end tests of the main flows (REQUIREMENTS M7). They drive a real browser against the web app. `*.localtest.me` is mapped to this machine by the browser itself, so no DNS and no
// network are needed. By default the web app runs on its built-in sample data (no database); see e2e/README.md for the run against the real API.
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://app.localtest.me:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--host-resolver-rules=MAP *.localtest.me 127.0.0.1, MAP localtest.me 127.0.0.1"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm --filter web exec next dev -p ${PORT}`,
    url: `http://app.localtest.me:${PORT}/about`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
