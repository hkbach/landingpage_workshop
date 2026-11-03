// SERVER-ONLY: the emails the mock backend "sends", until apps/api exists. The real backend writes an outbox event in the same transaction as the
// change and a worker sends the email in the language of the guest (REQUIREMENTS 5.7), so nothing is sent from a request handler.
// Lives on globalThis like the other mock stores.
import type { Locale, SessionCloseReason } from "@workshop/shared";
import { newUuid } from "@/lib/uuid";

export interface SessionRescheduledEmail {
  id: string;
  type: "SESSION_RESCHEDULED";
  to: string;
  /** Language of the email: the preferred language of the guest. */
  locale: Locale;
  bookingCode: string;
  workshopTitle: string;
  oldStartsAt: string;
  newStartsAt: string;
  newEndsAt: string;
  timezone: string;
  reason: SessionCloseReason;
  createdAt: string;
}

const g = globalThis as unknown as { __outbox?: SessionRescheduledEmail[] };
const box = () => (g.__outbox ??= []);

export function queueSessionRescheduled(email: Omit<SessionRescheduledEmail, "id" | "type" | "createdAt">): SessionRescheduledEmail {
  const entry: SessionRescheduledEmail = { ...email, id: newUuid(), type: "SESSION_RESCHEDULED", createdAt: new Date().toISOString() };
  box().push(entry);
  return entry;
}

export const outboxEmails = (): SessionRescheduledEmail[] => box().map((e) => ({ ...e }));

/** Test helper. */
export function resetOutbox(): void {
  g.__outbox = [];
}
