import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Pool } from "pg";
import { createApp } from "../app";
import { MemoryEmailProvider } from "../email/email";
import { NoopJobs } from "../jobs/jobs";
import { OutboxService } from "../outbox/outbox.service";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const ORIGIN = "http://app.localtest.me:3000";
export const PASSWORD = "A-strong-pass-2026";

/** A name that is unique to this run, so tests never meet the rows of an earlier run (the audit log cannot be cleaned: it is append only). */
export const unique = (prefix = "t"): string => `${prefix}${randomUUID().replace(/-/g, "").slice(0, 10)}`;
export const emailFor = (label = "user"): string => `${unique(label)}@example.test`;

/** The answer of an injected request (the type of the server in use, so two copies of light-my-request cannot disagree). */
export type Res = Awaited<ReturnType<NestFastifyApplication["inject"]>>;

export interface TestApp {
  app: NestFastifyApplication;
  emails: MemoryEmailProvider;
  outbox: OutboxService;
  pool: Pool;
  close(): Promise<void>;
  /** A JSON POST under /api/v1 from the web app's origin; `cookie` is the session cookie, `from` simulates another client address. */
  post(url: string, body: unknown, opts?: { cookie?: string; from?: string; headers?: Record<string, string> }): Promise<Res>;
  get(url: string, opts?: { cookie?: string; from?: string }): Promise<Res>;
}

/** Starts the whole API on the test database with emails kept in memory. `env` overrides settings for this app only. */
export async function startApp(env: Record<string, string> = {}): Promise<TestApp> {
  const values = { DATABASE_URL: TEST_DATABASE_URL ?? "", NODE_ENV: "test", ...env };
  const before = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  Object.assign(process.env, values);
  const emails = new MemoryEmailProvider();
  const app = await createApp({ NODE_ENV: "test", LOG_LEVEL: "silent" }, { emailProvider: emails, jobs: new NoopJobs() });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } // the app has read its settings
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  return {
    app, emails, pool, outbox: app.get(OutboxService, { strict: false }),
    close: async () => { await app.close(); await pool.end(); },
    post: (url, body, opts = {}) => app.inject({ method: "POST", url: `/api/v1${url}`, payload: body as object, remoteAddress: opts.from ?? "10.1.1.1", headers: { origin: ORIGIN, ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers } }),
    get: (url, opts = {}) => app.inject({ method: "GET", url: `/api/v1${url}`, remoteAddress: opts.from ?? "10.1.1.1", headers: opts.cookie ? { cookie: opts.cookie } : {} }),
  };
}

/** The `name=value` part of the Set-Cookie header of an answer (what a browser sends back), or "". */
export function cookieOf(res: Res): string {
  const header = res.headers["set-cookie"];
  const first = Array.isArray(header) ? header[0] : header;
  return first?.split(";")[0] ?? "";
}

/** The link with a token in the last email sent to `to`: `{ link, token }`. */
export function linkIn(emails: MemoryEmailProvider, to: string): { link: string; token: string } {
  const mail = [...emails.sent].reverse().find((m) => m.to === to);
  const link = /https?:\/\/\S+token=[A-Za-z0-9_-]+/.exec(mail?.text ?? "")?.[0];
  if (!link) throw new Error(`No email with a link was sent to ${to}`);
  return { link, token: new URL(link).searchParams.get("token") ?? "" };
}

export const signupBody = (type: "CUSTOMER" | "SHOP_OWNER", email: string, shopName?: string, password = PASSWORD) => ({
  type, email, password, confirmPassword: password, ...(type === "SHOP_OWNER" ? { shopName: shopName ?? `Studio ${unique("s")}` } : {}),
});
