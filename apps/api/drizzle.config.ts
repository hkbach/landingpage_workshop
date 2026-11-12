import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Migrations are generated into apps/api/drizzle (committed) and applied with `pnpm db:migrate`. A migration that is merged is never edited: a change is a new migration.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
