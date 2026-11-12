import { Logger } from "@nestjs/common";
import type { Env } from "../config/env";

export const OUTBOX_QUEUE = "outbox.dispatch";
export const JOBS = Symbol("JOBS");

/** What the API needs from the job queue: ask the worker to look at the outbox now. Nothing else, so tests can replace it. */
export interface JobsPort {
  /** Wakes the worker (at most one pending wake-up at a time). Never throws: the worker also polls, so a missed wake-up only delays an email. */
  kick(): Promise<void>;
  stop(): Promise<void>;
}

export class NoopJobs implements JobsPort {
  async kick(): Promise<void> {}
  async stop(): Promise<void> {}
}

type Boss = import("pg-boss").PgBoss;

/** pg-boss on the same PostgreSQL (schema `pgboss`, created by pg-boss itself). pg-boss is ESM only, so it is loaded when it is first needed. */
export async function startBoss(databaseUrl: string, options: { supervise: boolean; schedule: boolean }): Promise<Boss> {
  const { PgBoss } = await import("pg-boss");
  const boss = new PgBoss({ connectionString: databaseUrl, supervise: options.supervise, schedule: options.schedule });
  boss.on("error", (error: Error) => new Logger("pg-boss").error(`pg-boss error: ${error.message}`));
  await boss.start();
  await boss.createQueue(OUTBOX_QUEUE);
  return boss;
}

/** The publisher inside the API process: only sends jobs; the worker process does the supervising, the schedule and the work. */
export class PgBossJobs implements JobsPort {
  private boss: Promise<Boss> | undefined;
  private readonly logger = new Logger("Jobs");

  constructor(private readonly databaseUrl: string) {}

  private get started(): Promise<Boss> {
    this.boss ??= startBoss(this.databaseUrl, { supervise: false, schedule: false });
    return this.boss;
  }

  async kick(): Promise<void> {
    try {
      // `singletonKey` makes pg-boss keep one waiting job: ten signups in a second wake the worker once.
      await (await this.started).send(OUTBOX_QUEUE, {}, { singletonKey: "outbox", singletonSeconds: 1 });
    } catch (error) {
      this.logger.warn(`Could not wake the worker: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  async stop(): Promise<void> {
    if (this.boss) await (await this.boss).stop({ graceful: false }).catch(() => undefined);
  }
}

export function createJobs(env: Pick<Env, "JOBS_ENABLED" | "DATABASE_URL" | "NODE_ENV">): JobsPort {
  return env.JOBS_ENABLED && env.NODE_ENV !== "test" ? new PgBossJobs(env.DATABASE_URL) : new NoopJobs();
}
