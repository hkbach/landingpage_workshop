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
E2E_CHANNEL=chrome pnpm test:e2e              # the Chrome installed on the machine (or msedge), when security software blocks the browser Playwright downloads
```

- `*.localtest.me` is mapped to this machine by the browser (a launch option), so no DNS is needed.
- The first visit to a page is compiled by `next dev` and can take a while: the helpers wait for the address, not for every image.
- The tests add data to the database (accounts, a workshop, a session, bookings, a published page, a published Terms). Run them on a database made for it, never on one with real data.
- While a published Terms or Privacy Policy is not agreed to, a window stands in front of the shop owner area and the customer area (D17): the helpers agree for the tests that are about something else
  (`acceptLegal`), and `customer.spec.ts` checks the window itself.
- `media.spec.ts` uploads a real image to the Cloudflare R2 bucket from the browser, and checks that the bucket refuses a body larger than the signed size and that the Images page keeps an image uploaded in the last 24 hours out of the deletable ones (the five `R2_*` in `apps/api/.env`, `MEDIA_UPLOAD_ORIGIN` for web, the CORS policy of the bucket for the origin of the app: run it with `E2E_PORT=3000`, the origin
  in the CORS policy). It is skipped when the storage is not set up, so CI (no R2) skips it. It leaves one small test image in the bucket.
- The test cases, which of them are automated and in which file, and the order to automate the rest: [docs/E2E_TEST_CASES.md](../docs/E2E_TEST_CASES.md). `security.spec.ts` (access by role and by
  shop, CSRF Origin, session cookie, CSP) and `booking-rules.spec.ts` (price on the server, repeated request, seats, guests per booking, wrong codes, suspended shop) follow its IDs.
- The API limits what ONE address can do on the public side (10 signups, 30 bookings, 20 requests for a code and 30 look-ups an hour), and every browser test comes from the same address. A whole run
  uses about 11 signups and 15 bookings, so a second run within the hour fails with `429` (and the failures that follow hide the real cause). Start the API for the tests with the limits multiplied:
  `RATE_LIMIT_FACTOR=10 pnpm --filter api dev` (the API refuses any value but 1 in production; the limits of one account or one email never change).
- A failed test leaves a screenshot, a trace and a snapshot of the page in `test-results/` (git ignores it): `pnpm exec playwright show-trace <trace.zip>`.
- CI runs the same on the services of the job (`.github/workflows/ci.yml`, job `e2e`).
