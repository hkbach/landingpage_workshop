import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { auditLogs, organizations, users } from "./schema";

// Integration tests against a REAL PostgreSQL (the one of infra/docker-compose.yml, database `workshop_test`). They run only when TEST_DATABASE_URL is set, so a plain `pnpm test`
// works without Docker. Every write below happens in a transaction that is rolled back, so the database stays clean (the audit log cannot be cleaned: it is append only).
const url = process.env.TEST_DATABASE_URL;
const d = describe.skipIf(!url);

d("the database (PostgreSQL)", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url! });
    await migrate(drizzle(pool), { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
  });
  afterAll(async () => { await pool.end(); });

  /** Runs `fn` in a transaction that is always rolled back. */
  async function rolledBack(fn: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await fn(client);
    } finally {
      await client.query("rollback");
      client.release();
    }
  }
  /** A statement that must fail: a savepoint keeps the transaction usable after it. */
  async function refused(client: PoolClient, text: string, params: unknown[] = []): Promise<string> {
    await client.query("savepoint s");
    try {
      await client.query(text, params);
    } catch (e) {
      await client.query("rollback to savepoint s");
      return (e as Error).message;
    }
    throw new Error("The statement was accepted but must be refused");
  }
  const org = (slug: string) => ({ text: `insert into organizations (name, slug, country, timezone, currency, contact_email) values ('Shop', $1, 'VN', 'Asia/Ho_Chi_Minh', 'VND', 'owner@example.com') returning id`, params: [slug] });

  it("has the tables of M1", async () => {
    const { rows } = await pool.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' order by 1");
    expect(rows.map((r) => r.table_name)).toEqual(expect.arrayContaining(["users", "auth_sessions", "user_tokens", "organizations", "organization_members", "audit_logs", "outbox_events"]));
    expect(Object.keys(users).length + Object.keys(organizations).length + Object.keys(auditLogs).length).toBeGreaterThan(0);
  });

  it("keeps the email lowercase and unique", async () => {
    await rolledBack(async (c) => {
      const email = "Mixed.Case@Example.com";
      expect(await refused(c, "insert into users (email, password_hash, full_name) values ($1, 'h', 'A')", [email])).toMatch(/users_email_lowercase/);
      await c.query("insert into users (email, password_hash, full_name) values ($1, 'h', 'A')", [email.toLowerCase()]);
      expect(await refused(c, "insert into users (email, password_hash, full_name) values ($1, 'h', 'B')", [email.toLowerCase()])).toMatch(/users_email_unique/);
    });
  });

  it("accepts a slug of the right format only, and never lets it change (BR-21)", async () => {
    await rolledBack(async (c) => {
      for (const bad of ["a", "-start", "end-", "UPPER", "has space", "x".repeat(33)]) {
        const o = org(bad);
        expect(await refused(c, o.text, o.params), bad).toMatch(/organizations_slug_format/);
      }
      const ok = org("clay-studio");
      const id = (await c.query<{ id: string }>(ok.text, ok.params)).rows[0]!.id;
      expect(await refused(c, "update organizations set slug = 'other-slug' where id = $1", [id])).toMatch(/cannot be changed/);
      await c.query("update organizations set name = 'Renamed' where id = $1", [id]); // everything else can change
      const dup = org("clay-studio");
      expect(await refused(c, dup.text, dup.params)).toMatch(/organizations_slug_unique/);
    });
  });

  it("checks the languages of a shop: only the five, and the default one is enabled", async () => {
    await rolledBack(async (c) => {
      const base = `insert into organizations (name, slug, country, timezone, currency, contact_email, default_locale, enabled_locales) values ('S', $1, 'VN', 'UTC', 'VND', 'o@example.com', $2, $3)`;
      expect(await refused(c, base, ["lang-one", "fr", ["fr"]])).toMatch(/organizations_default_locale/);
      expect(await refused(c, base, ["lang-two", "en", ["vi"]])).toMatch(/organizations_enabled_locales/);
      await c.query(base, ["lang-three", "vi", ["vi", "en"]]);
    });
  });

  it("keeps the audit log append only: no update, no delete, no truncate", async () => {
    await rolledBack(async (c) => {
      const id = (await c.query<{ id: string }>("insert into audit_logs (action, entity_type, entity_id) values ('test.action', 'test', '1') returning id")).rows[0]!.id;
      expect(await refused(c, "update audit_logs set action = 'changed' where id = $1", [id])).toMatch(/append only/);
      expect(await refused(c, "delete from audit_logs where id = $1", [id])).toMatch(/append only/);
      expect(await refused(c, "truncate audit_logs")).toMatch(/append only/);
    });
  });
});

d("the API on a real database", () => {
  it("answers /health and /ready, uses the standard error and echoes the request id", async () => {
    process.env.DATABASE_URL = url!;
    const app = await createApp({ NODE_ENV: "test", LOG_LEVEL: "silent" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    try {
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toEqual({ status: "ok" });
      expect((await app.inject({ method: "GET", url: "/ready" })).json()).toEqual({ status: "ready" });

      const missing = await app.inject({ method: "GET", url: "/api/v1/nothing-here", headers: { "x-request-id": "abc-12345678" } });
      expect(missing.statusCode).toBe(404);
      expect(missing.headers["x-request-id"]).toBe("abc-12345678");
      expect(missing.json().error).toMatchObject({ code: "NOT_FOUND", requestId: "abc-12345678" });

      const own = await app.inject({ method: "GET", url: "/health", headers: { "x-request-id": "bad id with spaces" } });
      expect(own.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/); // a request id that is not a plain token is replaced
    } finally {
      await app.close();
    }
  });
});
