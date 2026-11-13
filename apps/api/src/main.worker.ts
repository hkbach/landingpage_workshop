import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, Module } from "@nestjs/common";
import { loadDotEnv, parseEnv } from "./config/env";
import { EnvModule } from "./config/env.module";
import { DbModule } from "./db/db.module";
import { EMAIL_PROVIDER, createEmailProvider } from "./email/email";
import { ENV } from "./config/env.module";
import type { Env } from "./config/env";
import { AuditService } from "./audit/audit.service";
import { ScheduleService } from "./catalog/schedule.service";
import { JOBS, NoopJobs, OUTBOX_QUEUE, startBoss } from "./jobs/jobs";
import { FinanceService } from "./finance/finance.service";
import { EmailsService } from "./platform/emails.service";
import { MaintenanceService, FINANCE_CLOSE_QUEUE, MAINTENANCE_PURGE_QUEUE, SESSIONS_GENERATE_QUEUE, SESSIONS_SWEEP_QUEUE } from "./jobs/maintenance";
import { OutboxService } from "./outbox/outbox.service";

// The worker (REQUIREMENTS 3.2: a separate entry point, a separate container). It sends the emails of the outbox when the API wakes it (pg-boss job) and once a minute on its own,
// so an email is sent even if a wake-up was lost. It never listens on a port.
@Module({
  imports: [EnvModule, DbModule],
  providers: [
    { provide: EMAIL_PROVIDER, inject: [ENV], useFactory: (env: Env) => createEmailProvider(env) },
    { provide: JOBS, useValue: new NoopJobs() },
    AuditService, OutboxService, ScheduleService, FinanceService, EmailsService, MaintenanceService,
  ],
})
class WorkerModule {}

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const env = parseEnv();
  const logger = new Logger("Worker");
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  const outbox = app.get(OutboxService);
  const maintenance = app.get(MaintenanceService);

  const boss = await startBoss(env.DATABASE_URL, { supervise: true, schedule: true });
  const dispatch = async (): Promise<void> => {
    const result = await outbox.dispatchPending();
    if (result.sent + result.retried + result.failed > 0) logger.log(`Outbox: ${result.sent} sent, ${result.retried} to retry, ${result.failed} failed`);
  };
  await boss.work(OUTBOX_QUEUE, async () => dispatch());
  await boss.schedule(OUTBOX_QUEUE, "* * * * *"); // the safety net: look every minute
  await dispatch(); // and once at the start, for what waited while the worker was down

  // Sessions: close the ones whose time is over (every minute) and make the ones of the weekly schedules (every hour, and once now).
  await boss.createQueue(SESSIONS_SWEEP_QUEUE);
  await boss.createQueue(SESSIONS_GENERATE_QUEUE);
  await boss.work(SESSIONS_SWEEP_QUEUE, async () => {
    const closed = await maintenance.sweepSessions();
    if (closed > 0) logger.log(`Sessions: ${closed} closed because their time was over`);
  });
  await boss.work(SESSIONS_GENERATE_QUEUE, async () => {
    const result = await maintenance.generateSessions();
    if (result.created > 0) logger.log(`Sessions: ${result.created} made from the weekly schedules of ${result.shops} shop(s)`);
  });
  // Finance: close the months that are over (hourly: each shop has its own time zone, and a month is closed only once).
  await boss.createQueue(FINANCE_CLOSE_QUEUE);
  await boss.work(FINANCE_CLOSE_QUEUE, async () => {
    const result = await maintenance.closeMonths();
    if (result.closed > 0) logger.log(`Finance: ${result.closed} month(s) closed`);
  });
  await boss.schedule(FINANCE_CLOSE_QUEUE, "5 * * * *");
  // What is kept for a time only (D18): once a day.
  await boss.createQueue(MAINTENANCE_PURGE_QUEUE);
  await boss.work(MAINTENANCE_PURGE_QUEUE, async () => {
    const r = await maintenance.purgeExpired();
    if (r.emails + r.messages > 0) logger.log(`Purge: ${r.emails} email(s) and ${r.messages} message(s) removed`);
  });
  await boss.schedule(MAINTENANCE_PURGE_QUEUE, "0 3 * * *");
  await boss.schedule(SESSIONS_SWEEP_QUEUE, "* * * * *");
  await boss.schedule(SESSIONS_GENERATE_QUEUE, "0 * * * *");
  await maintenance.sweepSessions();
  await maintenance.generateSessions();
  await maintenance.closeMonths();
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
