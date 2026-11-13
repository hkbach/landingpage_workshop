# E2E tests (Playwright)

The main flows in a real browser: a visitor reads a landing page and books a workshop in five steps, an account is created and logged in, a shop owner moves around the dashboard and the landing
pages, the platform administrator sees the shops. Every test also fails on a **Content-Security-Policy violation** or an error that nobody caught in the page.

```
pnpm exec playwright install chromium     # once
pnpm test:e2e                             # starts the web app on port 3100 (or uses the one that runs) and runs everything
pnpm exec playwright test e2e/public-site.spec.ts   # one file
E2E_PORT=3200 pnpm test:e2e               # another port
```

- `*.localtest.me` is mapped to this machine by the browser (a launch option), so no DNS and no network are needed for the app itself.
- The web app runs on its **built-in sample data** (no database, no Docker). The password of the sample accounts is read from the file of the mock store (`DEMO_PASSWORD`), not copied here.
- The first visit to a page is compiled by `next dev` and can take a while: the helpers wait for the address, not for every image.
- A failed test leaves a screenshot, a trace and a snapshot of the page in `test-results/` (git ignores it): `pnpm exec playwright show-trace <trace.zip>`.

## Against the real API (accounts)

The web app is not connected to `apps/api` yet (see REQUIREMENTS, M7), so these tests do not run against it. When it is, set `E2E_PASSWORD` to the password of the accounts made by `pnpm db:seed`
(see `apps/api/.seed-credentials`) and read the verification code of a booking from Mailpit (`http://127.0.0.1:8025/api/v1/messages`) instead of the demo code of the sample data.

### Run `e2e/real-auth.spec.ts` (accounts on the real API)

Postgres and Mailpit up (`infra/docker-compose.yml`), migrated, then in three terminals (no other `next dev` of this project may run):

```
APP_URL=http://app.localtest.me:3200 pnpm --filter api dev
API_URL=http://127.0.0.1:4000 pnpm --filter web exec next dev -p 3200
E2E_REAL_API=1 E2E_PORT=3200 pnpm exec playwright test e2e/real-auth.spec.ts
```

Without `E2E_REAL_API` the file is skipped. The other files expect the sample data, so do not run them against the real API yet.
