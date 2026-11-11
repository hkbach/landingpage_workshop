// SERVER-ONLY: the messages sent with the Contact form of the public site, until apps/api exists. Lives on globalThis like the other mock stores.
// The text of a message is kept here only (never in the audit log). TODO(api): `contact_messages`, an email to the platform team, the Turnstile check, a page in the admin area to read them.
import { newUuid } from "../uuid";
import { getPlatformSettings } from "./app-settings-store";

export const CONTACT_TOPICS = ["general", "demo", "support", "partnership"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export interface ContactMessage { id: string; name: string; email: string; topic: ContactTopic; message: string; createdAt: string }

const g = globalThis as unknown as { __contactMessages?: ContactMessage[]; __contactHits?: Map<string, number[]> };
const messages = () => (g.__contactMessages ??= []);
const hits = () => (g.__contactHits ??= new Map<string, number[]>());

/** Test helper: no message, no limit. */
export function resetContactStore(): void {
  g.__contactMessages = [];
  g.__contactHits = new Map();
}

/** The messages one client can send in an hour (5 by default, see Settings of the admin area). */
export const CONTACT_RATE_LIMIT = { get max(): number { return getPlatformSettings().contactPerHour; }, windowMs: 60 * 60 * 1000 };

/** Seconds the client has to wait before it can send again; 0 when it can send now. */
export function contactRetryAfter(key: string, now = Date.now()): number {
  const recent = (hits().get(key) ?? []).filter((t) => now - t < CONTACT_RATE_LIMIT.windowMs);
  if (recent.length < CONTACT_RATE_LIMIT.max) return 0;
  return Math.ceil((recent[0]! + CONTACT_RATE_LIMIT.windowMs - now) / 1000);
}

/** Counts a message accepted from the client (only accepted ones count, so a typo never locks anybody out). */
export function recordContactHit(key: string, now = Date.now()): void {
  hits().set(key, [...(hits().get(key) ?? []).filter((t) => now - t < CONTACT_RATE_LIMIT.windowMs), now]);
}

export function addContactMessage(input: Omit<ContactMessage, "id" | "createdAt">, now = new Date()): ContactMessage {
  const m: ContactMessage = { id: `ct-${newUuid().slice(0, 8)}`, createdAt: now.toISOString(), ...input };
  messages().unshift(m);
  return m;
}

/** The messages received in this session, newest first. */
export const contactMessages = (): ContactMessage[] => [...messages()];
