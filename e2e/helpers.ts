import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

export const PORT = Number(process.env.E2E_PORT ?? 3100);
export const APP = `http://app.localtest.me:${PORT}`;
export const SHOP = `http://whiskladle.localtest.me:${PORT}`;

/**
 * The password of the sample accounts of the built-in sample data. It is demo data that is written at the top of the mock account store (it protects nothing), so the test reads it from there
 * instead of copying it. Running against the real API, give the password of the seeded accounts in E2E_PASSWORD.
 */
export function demoPassword(): string {
  if (process.env.E2E_PASSWORD) return process.env.E2E_PASSWORD;
  const source = readFileSync(join(__dirname, "..", "apps", "web", "src", "lib", "mock", "accounts-store.ts"), "utf8");
  const found = /DEMO_PASSWORD = "([^"]+)"/.exec(source);
  if (!found) throw new Error("The sample password was not found in the mock account store");
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

/** Logs in through the popup of the public site; a shop owner lands in the dashboard of the shop, a customer in the account area. */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await open(page, `${APP}/?auth=login`);
  const dialog = page.getByRole("dialog", { name: "Log in" });
  await dialog.getByRole("textbox", { name: "Email" }).fill(email);
  await dialog.getByRole("textbox", { name: "Password" }).fill(password);
  await dialog.getByRole("button", { name: "Log in" }).click();
  // the first visit of an area is compiled in development: allow it time
  await page.waitForURL(/\/(shopowner|customer|systemadmin)/, { timeout: 90_000, waitUntil: "domcontentloaded" });
}

/** The verification code of the booking form in the built-in sample data (nothing is emailed there). Read from the file of the form, not copied. */
export function demoOtp(): string {
  const source = readFileSync(join(__dirname, "..", "apps", "web", "src", "components", "booking", "otp.ts"), "utf8");
  const found = /DEMO_OTP = "(\d{6})"/.exec(source);
  if (!found) throw new Error("The sample verification code was not found");
  return found[1]!;
}
