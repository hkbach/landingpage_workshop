import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { formatMoney } from "@workshop/shared";
import type { Executor } from "../db/db.module";
import { bookings, organizations } from "../db/schema";
import type { BookingMailData } from "../email/templates";
import type { OutboxService } from "../outbox/outbox.service";
import { tenantScope } from "../tenant/tenant-scope";

/** The reasons of the owner as words a guest reads (the codes are never shown). */
const REASON_TEXT: Record<string, string> = {
  NOT_ENOUGH_GUESTS: "there are not enough guests", INSTRUCTOR_UNAVAILABLE: "the instructor is not available", VENUE_ISSUE: "there is a problem with the venue", SCHEDULE_CHANGE: "of a change of schedule", WORKSHOP_COMPLETED: "the workshop is done",
};

const when = (at: Date, timeZone: string): string => new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "full", timeStyle: "short" }).format(at);

/**
 * Tells every guest who booked a session that it was closed or moved: one email for each live booking (not confirmed or confirmed) that has an email, written to the outbox in the transaction
 * of the change (so a change that is rolled back tells nobody, and a change that is kept always tells everybody). Returns how many were queued; the caller wakes the worker after the commit.
 * The reason is plain text; the booking keeps its code, so the guest can cancel it or look it up with it.
 */
export async function notifyGuests(
  executor: Executor, outbox: OutboxService,
  input: { organizationId: string; sessionId: string; workshopTitle: Record<string, string>; startsAt: Date; previousStartsAt?: Date; kind: "CLOSED" | "RESCHEDULED"; reason: string },
): Promise<number> {
  const [shop] = await executor.select({ name: organizations.name, defaultLocale: organizations.defaultLocale, address: organizations.address }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
  if (!shop) return 0;
  const live = await executor.select().from(bookings).where(and(tenantScope(bookings, input.organizationId), eq(bookings.sessionId, input.sessionId), inArray(bookings.status, ["NOT_CONFIRMED", "CONFIRMED"]), isNotNull(bookings.guestEmail)));
  for (const b of live) {
    const data: BookingMailData = {
      shop: shop.name, code: b.bookingCode, workshop: input.workshopTitle[shop.defaultLocale] ?? Object.values(input.workshopTitle)[0] ?? "", when: when(input.startsAt, b.snapshot.timezone), timezone: b.snapshot.timezone,
      quantity: b.quantity, total: formatMoney(b.totalAmount, b.currency, "en"), address: b.snapshot.address,
    };
    await outbox.enqueueEmail(executor, {
      name: "session-notice", to: b.guestEmail!,
      data: { ...data, name: b.guestName, kind: input.kind, reason: REASON_TEXT[input.reason] ?? input.reason, ...(input.previousStartsAt ? { previousWhen: when(input.previousStartsAt, b.snapshot.timezone) } : {}) },
    }, input.organizationId);
  }
  return live.length;
}
