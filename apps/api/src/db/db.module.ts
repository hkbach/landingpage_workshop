import { Global, Inject, Logger, Module, type OnApplicationShutdown } from "@nestjs/common";
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

/**
 * The pool of one process, with limits on everything that can wait: the connections (`max`), the wait for one (`connectionTimeoutMillis`), a query (`statement_timeout`, and `query_timeout` a little later
 * on the client side in case the database does not answer at all), a lock (`lock_timeout`), a transaction left open (`idle_in_transaction_session_timeout`), and the age of a connection (it is replaced
 * after half an hour, so a pooler or a failover never leaves the process with connections that are dead). An error on an idle connection (the database restarted) is logged, not thrown: the pool
 * replaces the connection by itself, and an unhandled `error` event would stop the whole process.
 */
export function createPool(env: Env): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX, idleTimeoutMillis: 30_000, connectionTimeoutMillis: env.DB_ACQUIRE_TIMEOUT_MS, maxLifetimeSeconds: 30 * 60,
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS, query_timeout: env.DB_STATEMENT_TIMEOUT_MS + 5_000, lock_timeout: env.DB_LOCK_TIMEOUT_MS,
    idle_in_transaction_session_timeout: env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS, application_name: "workshop-api",
  });
  const log = new Logger("Database");
  pool.on("error", (error) => log.warn(`An idle database connection failed and was dropped: ${error.message}`));
  return pool;
}

/** One connection pool for the whole API; every query goes through Drizzle. PostgreSQL is only reachable from the API (never from the web app: REQUIREMENTS 3.2). */
@Global()
@Module({
  providers: [
    { provide: POOL, inject: [ENV], useFactory: (env: Env) => createPool(env) },
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
