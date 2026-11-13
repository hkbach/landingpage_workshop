import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadDotEnv } from "../config/env";

/**
 * Applies the migrations of `apps/api/drizzle` that were not applied yet: the way a deployment brings the database up to date (`node dist/migrate.js`, run once before the API and the worker
 * start). It needs only DATABASE_URL, never prints it, and is safe to run again. A migration that was merged is never edited: a change is a new migration.
 */
async function main(): Promise<void> {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: url });
  try {
    // From dist/ or src/db/ the folder of the migrations is found the same way: the package root holds `drizzle`.
    const folder = join(import.meta.dirname, import.meta.dirname.endsWith("dist") ? ".." : join("..", ".."), "drizzle");
    await migrate(drizzle(pool), { migrationsFolder: folder });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message.split("\n")[0] : "Migration failed");
  process.exit(1);
});
