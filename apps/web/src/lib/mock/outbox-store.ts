// SERVER-ONLY: the emails the mock backend "sends", until apps/api exists. The real backend writes an outbox event in the same transaction as the
// change and a worker sends the email in the language of the guest (REQUIREMENTS 5.7), so nothing is sent from a request handler.
// Lives on globalThis like the other mock stores.
import type { Locale, SessionCloseReason } from "@workshop/shared";
import { newUuid } from "@/lib/uuid";

interface EmailBase {
  id: string;
  to: string;
  /** Language of the email: the preferred language of the guest. */
  locale: Locale;
  bookingCode: string;
  workshopTitle: string;
  timezone: string;
  createdAt: string;
}

export interface SessionRescheduledEmail extends EmailBase {
  type: "SESSION_RESCHEDULED";
  oldStartsAt: string;
  newStartsAt: string;
  newEndsAt: string;
  reason: SessionCloseReason;
}

/** A session was closed: by its owner or an administrator (`reason`), or by the system when its time ended (`auto`, no reason). */
export interface SessionClosedEmail extends EmailBase {
  type: "SESSION_CLOSED";
  startsAt: string;
  endsAt: string;
  auto: boolean;
  reason?: SessionCloseReason;
}

export type OutboxEmail = SessionRescheduledEmail | SessionClosedEmail;

const g = globalThis as unknown as { __outbox?: OutboxEmail[] };
const box = () => (g.__outbox ??= []);

export function queueSessionRescheduled(email: Omit<SessionRescheduledEmail, "id" | "type" | "createdAt">): SessionRescheduledEmail {
  const entry: SessionRescheduledEmail = { ...email, id: newUuid(), type: "SESSION_RESCHEDULED", createdAt: new Date().toISOString() };
  box().push(entry);
  return entry;
}

export function queueSessionClosed(email: Omit<SessionClosedEmail, "id" | "type" | "createdAt">): SessionClosedEmail {
  const entry: SessionClosedEmail = { ...email, id: newUuid(), type: "SESSION_CLOSED", createdAt: new Date().toISOString() };
  box().push(entry);
  return entry;
}

export const outboxEmails = (): OutboxEmail[] => box().map((e) => ({ ...e }));

/** Test helper. */
export function resetOutbox(): void {
  g.__outbox = [];
}
