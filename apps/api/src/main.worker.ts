import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, Module } from "@nestjs/common";
import { loadDotEnv, parseEnv } from "./config/env";
import { EnvModule } from "./config/env.module";
import { DbModule } from "./db/db.module";
import { EMAIL_PROVIDER, createEmailProvider } from "./email/email";
import { ENV } from "./config/env.module";
import type { Env } from "./config/env";
import { JOBS, NoopJobs, OUTBOX_QUEUE, startBoss } from "./jobs/jobs";
import { OutboxService } from "./outbox/outbox.service";

// The worker (REQUIREMENTS 3.2: a separate entry point, a separate container). It sends the emails of the outbox when the API wakes it (pg-boss job) and once a minute on its own,
// so an email is sent even if a wake-up was lost. It never listens on a port.
@Module({
  imports: [EnvModule, DbModule],
  providers: [
    { provide: EMAIL_PROVIDER, inject: [ENV], useFactory: (env: Env) => createEmailProvider(env) },
    { provide: JOBS, useValue: new NoopJobs() },
    OutboxService,
  ],
})
class WorkerModule {}

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const env = parseEnv();
  const logger = new Logger("Worker");
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.enableShutdownHooks();
  const outbox = app.get(OutboxService);

  const boss = await startBoss(env.DATABASE_URL, { supervise: true, schedule: true });
  const dispatch = async (): Promise<void> => {
    const result = await outbox.dispatchPending();
    if (result.sent + result.retried + result.failed > 0) logger.log(`Outbox: ${result.sent} sent, ${result.retried} to retry, ${result.failed} failed`);
  };
  await boss.work(OUTBOX_QUEUE, async () => dispatch());
  await boss.schedule(OUTBOX_QUEUE, "* * * * *"); // the safety net: look every minute
  await dispatch(); // and once at the start, for what waited while the worker was down
  logger.log("The worker is running");

  const stop = async (): Promise<void> => {
    await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => undefined);
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "The worker could not start.");
  process.exit(1);
});
