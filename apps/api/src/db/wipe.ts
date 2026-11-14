import { Pool } from "pg";
import { loadDotEnv } from "../config/env";

// `pnpm --filter api db:wipe -- --yes` removes EVERY ROW of EVERY TABLE of the database in DATABASE_URL (`--test` takes TEST_DATABASE_URL instead): accounts, shops, workshops, sessions, bookings,
// payments, pages, audit lines, everything. The tables, their constraints and the migrations stay: run `pnpm db:seed` afterwards to make the demo data again. It cannot be undone.
//
// It refuses to run: without `--yes`; with NODE_ENV=production; and on a database that is not on this machine (localhost, 127.0.0.1 or ::1), unless `--allow-remote` is added too.

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function checkTarget(url: string, args: readonly string[], env: Record<string, string | undefined> = process.env): { database: string; host: string } {
  if (!args.includes("--yes")) throw new Error("This removes every row of every table. Run it again with --yes if that is what you want.");
  if (env.NODE_ENV === "production") throw new Error("Refused: NODE_ENV is production.");
  const parsed = new URL(url);
  if (!LOCAL.has(parsed.hostname) && !args.includes("--allow-remote")) throw new Error(`Refused: ${parsed.hostname} is not on this machine (add --allow-remote only if you are sure).`);
  return { database: parsed.pathname.replace(/^\//, ""), host: parsed.hostname };
}

/** Empties every table of the `public` schema and restarts the sequences. Returns how many rows each table had. */
export async function wipe(pool: Pool): Promise<Record<string, number>> {
  const tables = (await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by tablename")).rows.map((r) => r.tablename);
  if (tables.length === 0) throw new Error("The database has no tables: run pnpm db:migrate first.");
  const before: Record<string, number> = {};
  for (const t of tables) before[t] = (await pool.query<{ n: number }>(`select count(*)::int as n from "${t}"`)).rows[0]!.n;
  const client = await pool.connect();
  try {
    await client.query("begin");
    // The append-only tables (audit log, payments, wallet credits...) refuse TRUNCATE with a trigger on purpose. This tool is for a development database only (see the checks above), so the
    // triggers are switched off for this one transaction and switched on again before it commits: if anything fails, the rollback puts everything back.
    const withTriggers = (await client.query<{ relname: string }>("select distinct c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal")).rows.map((r) => r.relname);
    for (const t of withTriggers) await client.query(`alter table "${t}" disable trigger user`);
    await client.query(`truncate table ${tables.map((t) => `"${t}"`).join(", ")} restart identity cascade`);
    for (const t of withTriggers) await client.query(`alter table "${t}" enable trigger user`);
    // the sequences that no column owns (the numbers of the withdrawals) start again too
    for (const s of (await client.query<{ sequencename: string }>("select sequencename from pg_sequences where schemaname = 'public'")).rows) await client.query(`alter sequence "${s.sequencename}" restart`);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return before;
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = process.argv.slice(2);
  const url = args.includes("--test") ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error(args.includes("--test") ? "TEST_DATABASE_URL is not set." : "DATABASE_URL is not set.");
  const target = checkTarget(url, args);
  const pool = new Pool({ connectionString: url });
  try {
    const before = await wipe(pool);
    const rows = Object.values(before).reduce((a, b) => a + b, 0);
    console.log(`Wiped ${target.database} on ${target.host}: ${rows} rows removed from ${Object.keys(before).length} tables (the structure and the migrations are untouched).`);
    for (const [table, n] of Object.entries(before)) if (n > 0) console.log(`  ${table}: ${n}`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("wipe.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "The wipe failed.");
    process.exit(1);
  });
}
