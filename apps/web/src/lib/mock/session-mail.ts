// SERVER-ONLY: who is emailed when a session changes (re-scheduled, closed by the owner, an administrator or the system). Every guest who booked the
// session is told, whatever the state of the booking, except the guests who cancelled their booking before. TODO(api): the same rule, in the
// transaction of the change, through the outbox.
import type { SessionCloseReason } from "@workshop/shared";
import type { Booking, Customer } from "@/lib/types";
import { liveBookings, liveCustomers } from "./booking-store";
import { sessions } from "./data";
import { queueSessionClosed, queueSessionRescheduled } from "./outbox-store";

export interface MailResult { notified: number; withoutEmail: number }

/** The bookings of a session whose guest must be told: all but the cancelled ones. A session made in the browser only has no bookings here. */
export function bookingsToTell(sessionId: string): { booking: Booking; guest: Customer | undefined }[] {
  if (!sessions.some((s) => s.id === sessionId)) return [];
  return liveBookings()
    .filter((b) => b.sessionId === sessionId && b.status !== "CANCELLED")
    .map((booking) => ({ booking, guest: liveCustomers().find((c) => c.id === booking.customerId) }));
}

export function mailSessionRescheduled(sessionId: string, change: { oldStartsAt: string; newStartsAt: string; newEndsAt: string; reason: SessionCloseReason }): MailResult {
  const res: MailResult = { notified: 0, withoutEmail: 0 };
  for (const { booking: b, guest } of bookingsToTell(sessionId)) {
    if (!guest?.email) { res.withoutEmail++; continue; } // walk-in guests have no email
    queueSessionRescheduled({ to: guest.email, locale: guest.preferredLocale, bookingCode: b.bookingCode, workshopTitle: b.workshopTitle, timezone: b.timezone, ...change });
    res.notified++;
  }
  return res;
}

/** `reason` is the reason of the owner or the administrator; without one the session was closed by the system because its time ended. */
export function mailSessionClosed(sessionId: string, change: { startsAt: string; endsAt: string; reason?: SessionCloseReason }): MailResult {
  const res: MailResult = { notified: 0, withoutEmail: 0 };
  for (const { booking: b, guest } of bookingsToTell(sessionId)) {
    if (!guest?.email) { res.withoutEmail++; continue; }
    queueSessionClosed({
      to: guest.email, locale: guest.preferredLocale, bookingCode: b.bookingCode, workshopTitle: b.workshopTitle, timezone: b.timezone,
      startsAt: change.startsAt, endsAt: change.endsAt, auto: !change.reason, ...(change.reason ? { reason: change.reason } : {}),
    });
    res.notified++;
  }
  return res;
}

// Sessions whose end was already handled: the ones that ended before the first sweep of this server (their guests were told long ago), then every
// session the system closed. Lives on globalThis like the other mock stores. TODO(api): a worker closes the sessions and writes the outbox events.
const g = globalThis as unknown as { __autoClosed?: Set<string> };
function handled(now: Date): Set<string> {
  return (g.__autoClosed ??= new Set(sessions.filter((s) => Date.parse(s.endsAt) <= now.getTime()).map((s) => s.id)));
}

/** Test helper: forget what was handled, and take the sessions that ended before `now` as handled. */
export function resetAutoClosed(now: Date = new Date()): void {
  g.__autoClosed = undefined;
  handled(now);
}

/** The system closed these sessions because their time ended: email the guests once for each session. Returns the sessions that were mailed. */
export function mailAutoClosed(items: readonly { id: string; startsAt: string; endsAt: string }[], now: Date = new Date()): { id: string; notified: number }[] {
  const done = handled(now);
  const out: { id: string; notified: number }[] = [];
  for (const s of items) {
    if (done.has(s.id) || Date.parse(s.endsAt) > now.getTime()) continue;
    done.add(s.id);
    out.push({ id: s.id, notified: mailSessionClosed(s.id, { startsAt: s.startsAt, endsAt: s.endsAt }).notified });
  }
  return out;
}
