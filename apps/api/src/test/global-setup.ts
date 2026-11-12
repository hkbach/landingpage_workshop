import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Runs once before the test files: the integration tests need the schema of the test database to be current (migrate is idempotent). Without TEST_DATABASE_URL nothing happens.
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: join(import.meta.dirname, "..", "..", "drizzle") });
  } finally {
    await pool.end();
  }
}
