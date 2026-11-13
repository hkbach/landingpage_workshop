import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { SessionCloseReason } from "@workshop/shared";
import type { Executor } from "../db/db.module";
import { bookings, organizations } from "../db/schema";
import { bookingFacts } from "../email/booking-facts";
import type { OutboxService } from "../outbox/outbox.service";
import { tenantScope } from "../tenant/tenant-scope";

/**
 * Tells every guest who booked a session that it was closed or moved: one email for each live booking (not confirmed or confirmed) that has an email, written to the outbox in the transaction
 * of the change (so a change that is rolled back tells nobody, and a change that is kept always tells everybody). Returns how many were queued; the caller wakes the worker after the commit.
 * The email holds the six languages of the platform (the reason is a code, told in each of them, or the words of the shop, kept as they are); the booking keeps its code, so the guest can
 * cancel it or look it up with it. A close with no reason is the system closing a session whose time ended.
 */
export async function notifyGuests(
  executor: Executor, outbox: OutboxService,
  input: { organizationId: string; sessionId: string; workshopTitle: Record<string, string>; startsAt: Date; endsAt: Date; previousStartsAt?: Date; kind: "CLOSED" | "RESCHEDULED"; reason?: SessionCloseReason },
): Promise<number> {
  const [shop] = await executor.select({ name: organizations.name, defaultLocale: organizations.defaultLocale }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
  if (!shop) return 0;
  const live = await executor.select().from(bookings).where(and(tenantScope(bookings, input.organizationId), eq(bookings.sessionId, input.sessionId), inArray(bookings.status, ["NOT_CONFIRMED", "CONFIRMED"]), isNotNull(bookings.guestEmail)));
  for (const b of live) {
    const f = bookingFacts(shop, b, { startsAt: input.startsAt, endsAt: input.endsAt, title: input.workshopTitle });
    const common = { guestName: f.guestName, shopName: f.shopName, bookingCode: f.bookingCode, workshopTitle: f.workshopTitle, timezone: f.timezone };
    await outbox.enqueueEmail(executor, {
      name: "session-notice", to: b.guestEmail!,
      data: input.kind === "RESCHEDULED"
        ? { kind: "RESCHEDULED", ...common, oldStartsAt: (input.previousStartsAt ?? input.startsAt).toISOString(), newStartsAt: f.startsAt, newEndsAt: f.endsAt, reason: input.reason ?? { code: "SCHEDULE_CHANGE" } }
        : { kind: "CLOSED", ...common, startsAt: f.startsAt, endsAt: f.endsAt, ...(input.reason ? { reason: input.reason } : {}) },
    }, input.organizationId);
  }
  return live.length;
}
