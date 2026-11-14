import { afterAll, describe, expect, it } from "vitest";
import { parseEnv } from "../config/env";
import { TEST_DATABASE_URL } from "../test/helpers";
import { createPool } from "./db.module";

const d = describe.skipIf(!TEST_DATABASE_URL);

d("the limits of the connection pool", () => {
  const pool = createPool(parseEnv({ DATABASE_URL: TEST_DATABASE_URL, DB_STATEMENT_TIMEOUT_MS: "1500", DB_LOCK_TIMEOUT_MS: "700", DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "2000", DB_POOL_MAX: "3" }));
  afterAll(async () => { await pool.end(); });

  it("sets the limits on every connection it opens", async () => {
    const rows = (await pool.query("select current_setting('statement_timeout') as s, current_setting('lock_timeout') as l, current_setting('idle_in_transaction_session_timeout') as i, current_setting('application_name') as a")).rows[0];
    expect(rows).toEqual({ s: "1500ms", l: "700ms", i: "2s", a: "workshop-api" });
    expect(pool.options.max).toBe(3);
  });

  it("has the database stop a query that runs too long, and the pool keeps working after it", async () => {
    await expect(pool.query("select pg_sleep(4)")).rejects.toThrow(/statement timeout/);
    expect((await pool.query("select 1 as n")).rows[0]).toEqual({ n: 1 });
  });

  it("closes a transaction that is left open, so it cannot hold its locks for ever", async () => {
    const client = await pool.connect();
    client.on("error", () => undefined); // (the database ends the connection: that is what is tested)
    try {
      await client.query("begin");
      await client.query("select 1");
      await new Promise((r) => setTimeout(r, 2600));
      await expect(client.query("select 1")).rejects.toThrow();
    } finally {
      client.release(true);
    }
  });

  it("does not stop the process when an idle connection fails", () => {
    expect(() => pool.emit("error", new Error("the database restarted"))).not.toThrow();
  });
});
