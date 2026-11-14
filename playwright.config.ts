import { defineConfig, devices } from "@playwright/test";

// End-to-end tests of the main flows (REQUIREMENTS M7). They drive a real browser against the web app, which talks to the real API (PostgreSQL, the API, the worker and Mailpit must run: see
// e2e/README.md). `*.localtest.me` is mapped to this machine by the browser itself, so no DNS and no network are needed.
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
  // E2E_CHANNEL=chrome (or msedge) runs the browser installed on the machine instead of the one Playwright downloads: for a machine where security software blocks the downloaded one.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) } }],
  webServer: {
    command: `pnpm --filter web exec next dev -p ${PORT}`,
    env: { API_URL: process.env.API_URL ?? "http://127.0.0.1:4000" },
    url: `http://app.localtest.me:${PORT}/about`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
