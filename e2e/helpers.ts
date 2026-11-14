import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const PORT = Number(process.env.E2E_PORT ?? 3100);
export const APP = `http://app.localtest.me:${PORT}`;
export const SHOP = `http://whiskladle.localtest.me:${PORT}`;

/**
 * The password of the accounts made by `pnpm db:seed`: E2E_PASSWORD, else the file the seed wrote (apps/api/.seed-credentials, ignored by git). It is read when a test needs it and never printed.
 */
export function seedPassword(): string {
  if (process.env.E2E_PASSWORD) return process.env.E2E_PASSWORD;
  const file = join(__dirname, "..", "apps", "api", ".seed-credentials");
  const found = /^password:\s*(\S+)/m.exec(readFileSync(file, "utf8"));
  if (!found) throw new Error("The password of the seeded accounts was not found: run `pnpm db:seed` or set E2E_PASSWORD");
  return found[1]!;
}

/** What went wrong in the browser while a page was used: a Content-Security-Policy violation or an error that nobody caught. An empty list is the goal. */
export function watchBrowser(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/Content Security Policy|violates the following/i.test(text)) problems.push(`CSP: ${text.slice(0, 300)}`);
  });
  page.on("pageerror", (error) => problems.push(`Uncaught: ${error.message.slice(0, 300)}`));
  return problems;
}

/** The pages are slow to compile the first time in development: open without waiting for every image of the sample data (they come from other sites). */
export const open = (page: Page, url: string) => page.goto(url, { waitUntil: "domcontentloaded" });

/**
 * Types into a field of the landing page builder until the autosave says it kept the draft, and returns the text that was saved. A field filled before the page is hydrated holds the text
 * but raises no change, so nothing would be saved: the whole step (fill, then wait for "Draft saved") is tried again with a new text.
 */
export async function typeUntilSaved(page: Page, field: Locator, base: string): Promise<string> {
  let value = base;
  await expect(async () => {
    value = `${base} ${Math.random().toString(36).slice(2, 6)}`;
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 1_000 });
    await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 8_000 }); // (the autosave waits two seconds)
  }).toPass({ timeout: 60_000 });
  return value;
}

const MAILPIT = process.env.E2E_MAILPIT ?? "http://127.0.0.1:8025";

/** The text of the newest email in Mailpit that matches `query` (Mailpit search syntax, e.g. `to:a@x.example subject:changed`) and holds `contains`; waits up to 30 seconds. */
export async function waitForMail(request: APIRequestContext, query: string, contains: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const found = (await (await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}`)).json()) as { messages?: Array<{ ID: string }> };
    for (const m of found.messages ?? []) {
      const text = ((await (await request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string }).Text;
      if (text.includes(contains)) return text;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No email for "${query}" holding "${contains}" arrived`);
}

/** Logs in through the popup of the public site; a shop owner lands in the dashboard of the shop, a customer in the account area. */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await open(page, `${APP}/?auth=login`);
  const dialog = page.getByRole("dialog", { name: "Log in" });
  await dialog.getByRole("textbox", { name: "Email" }).fill(email);
  await dialog.getByRole("textbox", { name: "Password" }).fill(password);
  await dialog.getByRole("button", { name: "Log in" }).click();
  // the first visit of an area is compiled in development: allow it time
  await page.waitForURL(/\/(shopowner|customer|systemadmin)/, { timeout: 90_000, waitUntil: "domcontentloaded" });
  await acceptLegal(page.context().request);
}

/**
 * Agrees to the Terms and the Privacy Policy that are published and that the account has not agreed to yet (D17). While a published text is not agreed to, a window stands in front of the
 * shop owner area and the customer area: a test that is about something else agrees first (the window itself is what a person sees; the API records the same).
 */
export async function acceptLegal(request: APIRequestContext): Promise<void> {
  const res = await request.get(`${APP}/api/v1/legal/consent?locale=en`);
  if (!res.ok()) return;
  const status = (await res.json()) as { items: Array<{ kind: string; mustAccept: boolean }> };
  const kinds = status.items.filter((i) => i.mustAccept).map((i) => i.kind);
  if (kinds.length > 0) await request.post(`${APP}/api/v1/legal/consent`, { headers: { origin: APP }, data: { kinds, locale: "en" } });
}
