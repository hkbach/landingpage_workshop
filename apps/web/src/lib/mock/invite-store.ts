// SERVER-ONLY: the REFERRAL program (a customer invites friends to register a customer account), until apps/api exists. It is not the affiliate program (a link of a workshop).
//  - Every customer with an account has ONE invite link, for good.
//  - A friend who registers through the link is the customer's referral.
//  - The bonus is earned when the friend pays a booking (payment status PAID) made after they registered: the referral bonus rate of the shop x the ORIGINAL price of that booking
//    (unit price x guests, before vouchers, like every fee). It is earned ONCE for each referral, on the FIRST paid booking; later bookings of the same friend earn nothing more.
//  - The rate is set by the system admin for each shop (fee-rates-store).
// The bonus is worked out from the bookings as they are now (a booking that stops being paid stops counting, and the next paid one of the friend counts instead).
// Lives on globalThis like the other mock stores. TODO(api): `referral_invites` (inviter_id, invitee_id unique, registered_at) and `referral_bonuses` written once, in the transaction
// that marks the booking Paid.
import { feeOf } from "@workshop/shared";
import { liveBookings, liveCustomers } from "./booking-store";
import { currentShop } from "./data";
import { getInviteBonusBps } from "./fee-rates-store";
import { newUuid } from "../uuid";
import type { Booking } from "../types";

export interface Invite {
  id: string;
  inviterId: string;
  /** The friend who registered (customer id). One inviter at most for each friend. */
  inviteeId: string;
  registeredAt: string;
}

export interface InviteBonus {
  inviteId: string; inviterId: string; inviteeId: string;
  bookingId: string; bookingCode: string; shopId: string; currency: string;
  /** The original price of the booking (before vouchers): what the rate is a percentage of. */
  base: number; bonusBps: number; amount: number;
  /** When the booking was paid (ISO). */
  paidAt: string;
}

const DAY = 86_400_000;
const g = globalThis as unknown as { __inviteCodes?: Map<string, string>; __invites?: Invite[] };
const codes = (): Map<string, string> => (g.__inviteCodes ??= new Map());

/**
 * Friends to look at, one row each: [inviter, friend, days ago the friend registered]. They cover every case of the Referrals page: a friend who paid a booking after registering (the bonus
 * is earned), friends still waiting for a first paid booking, and a friend whose only paid booking was made BEFORE registering (it does not count: Registered). Customers with no row
 * (for example cu-9, cu-12, cu-14, cu-16, cu-17, cu-18) have invited nobody: the empty page.
 */
function seed(): Invite[] {
  const rows: Array<[string, string, number]> = [
    ["cu-1", "cu-2", 400], ["cu-1", "cu-7", 400], ["cu-1", "cu-12", 400], ["cu-4", "cu-5", 400], ["cu-4", "cu-6", 400],
    ["cu-1", "cu-14", 2], // paid a booking long before registering: does not count
    ["cu-5", "cu-15", 300], // paid a booking after registering: earned
    ["cu-5", "cu-17", 20], // no paid booking yet
    ["cu-6", "cu-18", 10], // the only friend of cu-6, no paid booking yet
  ];
  return rows.map(([inviterId, inviteeId, days], i) => ({ id: `iv-${i + 1}`, inviterId, inviteeId, registeredAt: new Date(Date.now() - days * DAY).toISOString() }));
}
const store = (): Invite[] => (g.__invites ??= seed());

/** Test helper: back to the demo friends and no code made yet. */
export function resetInviteStore(): void {
  g.__inviteCodes = undefined;
  g.__invites = undefined;
  (globalThis as unknown as { __inviteOff?: Map<string, string> }).__inviteOff = undefined;
}

/** Invite codes an administrator switched off: customer id -> reason. A friend who registers with such a code is not counted. */
const off = (): Map<string, string> => ((globalThis as unknown as { __inviteOff?: Map<string, string> }).__inviteOff ??= new Map());
export const isInviteDisabled = (accountId: string): boolean => off().has(accountId);
export const inviteDisabledReason = (accountId: string): string => off().get(accountId) ?? "";

/** An administrator switches the invite code of a customer off (with a reason) or on again. False when the customer is not known. */
export function setInviteDisabled(accountId: string, disabled: boolean, reason = ""): boolean {
  if (!liveCustomers().some((c) => c.id === accountId && c.account)) return false;
  if (disabled) off().set(accountId, reason.trim().slice(0, 300)); else off().delete(accountId);
  return true;
}

/** The one invite code of a customer (made the first time it is asked for, then always the same). */
export function inviteCodeOf(accountId: string): string {
  let code = codes().get(accountId);
  if (!code) {
    code = `I${newUuid().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    codes().set(accountId, code);
  }
  return code;
}

/** The customer who owns an invite code. */
export function inviterOfCode(code: string): string | undefined {
  return [...codes()].find(([, c]) => c === code)?.[0];
}

/**
 * A friend registered with an invite code: the customer who owns the code gets a referral. Ignored (false) when the code is not one, when the friend is the owner, or when the
 * friend already is somebody's referral (each friend counts for one inviter, once).
 */
export function recordInvite(code: string, inviteeId: string, now: Date = new Date()): boolean {
  const inviterId = inviterOfCode(code);
  if (!inviterId || isInviteDisabled(inviterId) || inviterId === inviteeId || store().some((i) => i.inviteeId === inviteeId)) return false;
  if (!liveCustomers().some((c) => c.id === inviterId && c.account)) return false;
  store().push({ id: `iv-${newUuid().slice(0, 8)}`, inviterId, inviteeId, registeredAt: now.toISOString() });
  return true;
}

/** The invite codes made so far: [customer id, code]. */
export const listInviteCodes = (): [string, string][] => [...codes()];

export const listInvites = (): Invite[] => store().map((i) => ({ ...i }));

/** When a booking was paid: the first payment it received (the booking date when no payment is recorded). */
const paidAtOf = (b: Booking): string => b.payments.filter((p) => p.type === "PAYMENT").map((p) => p.recordedAt).sort()[0] ?? b.createdAt;

/**
 * The bonuses earned: for each referral, the FIRST booking of the friend that is paid, was made after the friend registered and is not cancelled. A friend with no such booking has
 * earned nothing yet. The mock keeps the bookings of the demo shop only.
 */
export function inviteBonuses(bookings: readonly Booking[] = liveBookings()): InviteBonus[] {
  return store().flatMap((i): InviteBonus[] => {
    const first = bookings
      .filter((b) => b.customerId === i.inviteeId && b.paymentStatus === "PAID" && b.status !== "CANCELLED" && b.createdAt >= i.registeredAt)
      .sort((a, b) => paidAtOf(a).localeCompare(paidAtOf(b)) || a.id.localeCompare(b.id))[0];
    if (!first) return [];
    const base = first.unitPriceAmount * first.quantity;
    const bonusBps = getInviteBonusBps(currentShop.id);
    return [{ inviteId: i.id, inviterId: i.inviterId, inviteeId: i.inviteeId, bookingId: first.id, bookingCode: first.bookingCode, shopId: currentShop.id, currency: first.currency, base, bonusBps, amount: feeOf(base, bonusBps), paidAt: paidAtOf(first) }];
  });
}
