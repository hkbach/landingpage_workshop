import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ENV } from "../config/env.module";
import type { Env } from "../config/env";
import * as schema from "./schema";

export const POOL = Symbol("PG_POOL");
export const DB = Symbol("DB");
export type Database = NodePgDatabase<typeof schema>;
/** The database or an open transaction: a service takes an Executor so the caller decides what runs in one transaction. */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/** One connection pool for the whole API; every query goes through Drizzle. PostgreSQL is only reachable from the API (never from the web app: REQUIREMENTS 3.2). */
@Global()
@Module({
  providers: [
    { provide: POOL, inject: [ENV], useFactory: (env: Env) => new Pool({ connectionString: env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 }) },
    { provide: DB, inject: [POOL], useFactory: (pool: Pool): Database => drizzle(pool, { schema }) },
  ],
  exports: [POOL, DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
