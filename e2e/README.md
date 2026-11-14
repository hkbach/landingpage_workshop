# E2E tests (Playwright)

The main flows in a real browser, on the **real stack**: a visitor reads a landing page and books a workshop (the code comes by email), accounts are created and logged in, the shop owner works in every
page of the dashboard, a customer uses their own area, and the platform administrator manages the shops, the users and the Terms. Every test also fails on a **Content-Security-Policy violation** or an
error that nobody caught in the page.

## What has to run

1. PostgreSQL and Mailpit: `docker compose -f infra/docker-compose.yml up -d db mailpit` (the password of the database is the `DB_PASSWORD` of your environment).
2. The database: `pnpm db:migrate` and `pnpm db:seed`. The seed writes the password of the demo accounts to `apps/api/.seed-credentials` (git ignores it); the tests read it, or `E2E_PASSWORD`.
3. The API and the worker (the worker sends the emails), with `APP_URL` equal to the address the browser uses (the check against forged requests compares it):
   ```
   APP_URL=http://app.localtest.me:3100 pnpm --filter api dev
   APP_URL=http://app.localtest.me:3100 pnpm --filter api dev:worker
   ```
4. The web app is started by Playwright (`API_URL`, default `http://127.0.0.1:4000`), or reused when it already runs on the port. Only one `next dev` of this project can run: stop yours first, or start it
   yourself with `API_URL=http://127.0.0.1:4000 pnpm --filter web exec next dev -p 3100`.

```
pnpm exec playwright install chromium         # once
pnpm test:e2e                                 # every file
pnpm exec playwright test e2e/owner.spec.ts   # one file
E2E_PORT=3200 pnpm test:e2e                   # another port (the API must then have APP_URL with 3200)
```

- `*.localtest.me` is mapped to this machine by the browser (a launch option), so no DNS is needed.
- The first visit to a page is compiled by `next dev` and can take a while: the helpers wait for the address, not for every image.
- The tests add data to the database (accounts, a workshop, a session, bookings, a published page, a published Terms). Run them on a database made for it, never on one with real data.
- While a published Terms or Privacy Policy is not agreed to, a window stands in front of the shop owner area and the customer area (D17): the helpers agree for the tests that are about something else
  (`acceptLegal`), and `customer.spec.ts` checks the window itself.
- A failed test leaves a screenshot, a trace and a snapshot of the page in `test-results/` (git ignores it): `pnpm exec playwright show-trace <trace.zip>`.
- CI runs the same on the services of the job (`.github/workflows/ci.yml`, job `e2e`).
