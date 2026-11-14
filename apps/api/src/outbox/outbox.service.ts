import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { DB, type Database, type Executor } from "../db/db.module";
import { outboxEvents } from "../db/schema";
import { EMAIL_PROVIDER, type EmailProvider } from "../email/email";
import { renderEmail, type EmailTemplate } from "../email/templates";
import { JOBS, type JobsPort } from "../jobs/jobs";

export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60 * 60_000;
/** How long a row is kept for the worker that is sending it: longer than any mail server takes to answer. */
const CLAIM_MS = 5 * 60_000;

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
    await executor.insert(outboxEvents).values({ organizationId: organizationId ?? null, type: "EMAIL", payload: { template }, recipient: template.to.trim().toLowerCase(), template: template.name });
  }

  /** Asks the worker to send what is waiting now (it also looks every minute on its own). */
  wake(): Promise<void> {
    return this.jobs.kick();
  }

  /**
   * Sends one waiting email. The row is CLAIMED in a short transaction (a row lock with `SKIP LOCKED`, then `available_at` moved a few minutes ahead, so no other worker takes it while it is being sent), the
   * email is sent with NO transaction and NO connection of the pool held (a slow mail server must not hold one of the few connections), and the result is written in a second short statement. If the worker dies
   * between the two, the row becomes due again when the claim runs out and the email is tried again.
   */
  private async dispatchOne(now?: Date): Promise<"none" | "sent" | "retry" | "failed"> {
    const claimed = await this.db.transaction(async (tx) => {
      // `available_at` is written with the DATABASE clock, so "due" is judged by the same clock (a few seconds of drift between the app host and the database must not hide a fresh email). A caller may pass `now` (tests).
      const [event] = await tx.select().from(outboxEvents).where(and(eq(outboxEvents.status, "PENDING"), lte(outboxEvents.availableAt, now ?? sql`now()`))).orderBy(asc(outboxEvents.createdAt)).limit(1).for("update", { skipLocked: true });
      if (!event) return null;
      const template = (event.payload as { template?: EmailTemplate } | null)?.template;
      if (event.type !== "EMAIL" || !template?.name) {
        await tx.update(outboxEvents).set({ status: "FAILED", attempts: event.attempts + 1, lastError: "Unknown event" }).where(eq(outboxEvents.id, event.id));
        return { event, template: null };
      }
      await tx.update(outboxEvents).set({ availableAt: now ? new Date(now.getTime() + CLAIM_MS) : sql`now() + ${CLAIM_MS / 1000} * interval '1 second'` }).where(eq(outboxEvents.id, event.id));
      return { event, template };
    });
    if (!claimed) return "none";
    const { event, template } = claimed;
    if (!template) return "failed";

    let rendered: ReturnType<typeof renderEmail> | undefined;
    try {
      rendered = renderEmail(template);
      await this.email.send(rendered);
    } catch (error) {
      const attempts = event.attempts + 1;
      const message = (error instanceof Error ? error.message : "Unknown error").slice(0, 200);
      const last = attempts >= MAX_ATTEMPTS;
      await this.db.update(outboxEvents).set({ subject: rendered?.subject ?? null, attempts, lastError: message, status: last ? "FAILED" : "PENDING", availableAt: new Date((now ?? new Date()).getTime() + retryDelayMs(attempts)) }).where(eq(outboxEvents.id, event.id));
      this.logger.warn(`Email event ${event.id} failed (attempt ${attempts}): ${message}`);
      return last ? "failed" : "retry";
    }
    // the content is scrubbed (it can hold a secret link); only what an administrator wrote stays, because only that may be read again (FR-ADM-22)
    await this.db.update(outboxEvents).set({ status: "DISPATCHED", attempts: event.attempts + 1, lastError: null, subject: rendered?.subject ?? null, payload: template.name === "admin-message" ? event.payload : { redacted: true, template: template.name } }).where(eq(outboxEvents.id, event.id));
    return "sent";
  }

  /** Sends up to `limit` waiting emails (the worker calls this when woken and every minute). */
  async dispatchPending(limit = 20, now?: Date): Promise<DispatchResult> {
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
