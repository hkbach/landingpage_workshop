import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, eq, lte } from "drizzle-orm";
import { DB, type Database, type Executor } from "../db/db.module";
import { outboxEvents } from "../db/schema";
import { EMAIL_PROVIDER, type EmailProvider } from "../email/email";
import { renderEmail, type EmailTemplate } from "../email/templates";
import { JOBS, type JobsPort } from "../jobs/jobs";

export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60 * 60_000;

/** Seconds-scale exponential backoff for the next try of an email: 1 min, 2, 4, 8 minutes... never more than an hour. */
export const retryDelayMs = (attempts: number): number => Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts);

export interface DispatchResult { sent: number; retried: number; failed: number }

/**
 * The outbox (REQUIREMENTS 7.3): a change that needs an email writes an `outbox_events` row IN THE SAME TRANSACTION, so the email is never lost and never sent for a change that was rolled
 * back. The worker then sends the rows one by one. A row that is sent loses its payload (it held the link with the secret token); a row that fails is tried again later, and is marked FAILED
 * after five attempts.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger("Outbox");

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(JOBS) private readonly jobs: JobsPort,
  ) {}

  /** Queues an email in the open transaction. Call `wake()` AFTER the transaction has committed. */
  async enqueueEmail(executor: Executor, template: EmailTemplate, organizationId?: string | null): Promise<void> {
    await executor.insert(outboxEvents).values({ organizationId: organizationId ?? null, type: "EMAIL", payload: { template } });
  }

  /** Asks the worker to send what is waiting now (it also looks every minute on its own). */
  wake(): Promise<void> {
    return this.jobs.kick();
  }

  /** Sends one waiting email under a row lock (`SKIP LOCKED`: two workers never take the same row). */
  private async dispatchOne(now: Date): Promise<"none" | "sent" | "retry" | "failed"> {
    return this.db.transaction(async (tx) => {
      const [event] = await tx.select().from(outboxEvents).where(and(eq(outboxEvents.status, "PENDING"), lte(outboxEvents.availableAt, now))).orderBy(asc(outboxEvents.createdAt)).limit(1).for("update", { skipLocked: true });
      if (!event) return "none";
      const template = (event.payload as { template?: EmailTemplate } | null)?.template;
      if (event.type !== "EMAIL" || !template?.name) {
        await tx.update(outboxEvents).set({ status: "FAILED", attempts: event.attempts + 1, lastError: "Unknown event" }).where(eq(outboxEvents.id, event.id));
        return "failed";
      }
      try {
        await this.email.send(renderEmail(template));
      } catch (error) {
        const attempts = event.attempts + 1;
        const message = (error instanceof Error ? error.message : "Unknown error").slice(0, 200);
        const last = attempts >= MAX_ATTEMPTS;
        await tx.update(outboxEvents).set({ attempts, lastError: message, status: last ? "FAILED" : "PENDING", availableAt: new Date(now.getTime() + retryDelayMs(attempts)) }).where(eq(outboxEvents.id, event.id));
        this.logger.warn(`Email event ${event.id} failed (attempt ${attempts}): ${message}`);
        return last ? "failed" : "retry";
      }
      await tx.update(outboxEvents).set({ status: "DISPATCHED", attempts: event.attempts + 1, lastError: null, payload: { redacted: true, template: template.name } }).where(eq(outboxEvents.id, event.id));
      return "sent";
    });
  }

  /** Sends up to `limit` waiting emails (the worker calls this when woken and every minute). */
  async dispatchPending(limit = 20, now = new Date()): Promise<DispatchResult> {
    const result: DispatchResult = { sent: 0, retried: 0, failed: 0 };
    for (let i = 0; i < limit; i++) {
      const outcome = await this.dispatchOne(now);
      if (outcome === "none") break;
      if (outcome === "sent") result.sent++;
      else if (outcome === "retry") result.retried++;
      else result.failed++;
    }
    return result;
  }
}
