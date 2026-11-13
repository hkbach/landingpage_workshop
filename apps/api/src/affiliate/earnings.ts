import { sql, type SQL } from "drizzle-orm";
import type { Executor } from "../db/db.module";
import { DEFAULT_RATES } from "../finance/rates";

// What the two programs earn (FR-CUST-02, FR-CUST-03, FR-ADM-16). Nothing is stored: it is worked out from the bookings as they are NOW, so a booking put back to unpaid (or cancelled) stops
// counting at once. Both are a percentage of the ORIGINAL price of the booking (before the vouchers), like the other fees, with the rate the shop has now. Money is minor units.

/** The original price of a booking (the alias of the table is `b`). */
const SUBTOTAL = sql`coalesce((b.snapshot->>'subtotalAmount')::bigint, b.unit_price_amount * b.quantity)`;

const rows = async <T>(executor: Executor, query: SQL): Promise<T[]> => (await executor.execute(query)).rows as T[];

export interface LinkEarning { linkId: string; currency: string; /** Paid bookings that came through the link. */ bookings: number; /** The Affiliate fee they earned. */ fee: number }

/**
 * Per affiliate link: the bookings that are PAID (and not cancelled) and came through it, and the Affiliate fee of them = the affiliate rate of the shop x the original price. A disabled link
 * keeps what it earned before (it only stops counting new bookings, which is decided when a booking is made).
 */
export async function affiliateEarnings(executor: Executor, filter: { userId?: string } = {}): Promise<LinkEarning[]> {
  const result = await rows<{ link_id: string; currency: string; bookings: number; fee: string }>(executor, sql`
    select b.affiliate_link_id as link_id, b.currency, count(*)::int as bookings,
           coalesce(sum(round(${SUBTOTAL}::numeric * coalesce(fs.affiliate_bps, ${DEFAULT_RATES.affiliateBps}) / 10000)), 0)::bigint as fee
      from bookings b
      join affiliate_links l on l.id = b.affiliate_link_id
      left join organization_fee_settings fs on fs.organization_id = b.organization_id
     where b.payment_status = 'PAID' and b.status <> 'CANCELLED' ${filter.userId ? sql`and l.user_id = ${filter.userId}` : sql``}
     group by b.affiliate_link_id, b.currency`);
  return result.map((r) => ({ linkId: r.link_id, currency: r.currency, bookings: Number(r.bookings), fee: Number(r.fee) }));
}

export interface ReferralBonus {
  referralId: string; inviterUserId: string; friendUserId: string; bookingId: string; bookingCode: string; organizationId: string; currency: string;
  /** The Referral bonus: the invite rate of the shop x the original price of that booking. */
  bonus: number;
  /** When it was paid (the last payment entry). */
  paidAt: Date | null;
}

/**
 * The bonus of each friend, once: the FIRST booking the friend made (by the email of the account) AFTER registering that is PAID and not cancelled. A booking made before registering never
 * counts, a later booking of the same friend earns nothing more, and a booking put back to unpaid hands the bonus to the next paid one (FR-CUST-03).
 */
export async function referralBonuses(executor: Executor, filter: { inviterUserId?: string } = {}): Promise<ReferralBonus[]> {
  const result = await rows<{ referral_id: string; inviter: string; friend: string; booking_id: string; booking_code: string; organization_id: string; currency: string; bonus: string; paid_at: string | Date | null }>(executor, sql`
    select distinct on (r.id) r.id as referral_id, r.inviter_user_id as inviter, r.friend_user_id as friend, b.id as booking_id, b.booking_code, b.organization_id, b.currency,
           round(${SUBTOTAL}::numeric * coalesce(fs.invite_bonus_bps, ${DEFAULT_RATES.inviteBonusBps}) / 10000)::bigint as bonus,
           (select max(p.recorded_at) from payments p where p.organization_id = b.organization_id and p.booking_id = b.id) as paid_at
      from referrals r
      join users f on f.id = r.friend_user_id
      join bookings b on lower(b.guest_email) = f.email and b.created_at > r.created_at and b.payment_status = 'PAID' and b.status <> 'CANCELLED'
      left join organization_fee_settings fs on fs.organization_id = b.organization_id
     where true ${filter.inviterUserId ? sql`and r.inviter_user_id = ${filter.inviterUserId}` : sql``}
     order by r.id, b.created_at, b.id`);
  return result.map((r) => ({ referralId: r.referral_id, inviterUserId: r.inviter, friendUserId: r.friend, bookingId: r.booking_id, bookingCode: r.booking_code, organizationId: r.organization_id, currency: r.currency, bonus: Number(r.bonus), paidAt: r.paid_at ? new Date(r.paid_at) : null })) // the driver of drizzle gives a date as text here;
}

export interface ProgramEarning { source: "AFFILIATE" | "REFERRAL"; currency: string; amount: number }

/** What an account earned from the two programs, for each source and currency (the wallet adds it to the credits written by hand). */
export async function programEarnings(executor: Executor, userId: string): Promise<ProgramEarning[]> {
  const sums = new Map<string, ProgramEarning>();
  const add = (source: ProgramEarning["source"], currency: string, amount: number) => {
    const key = `${source}|${currency}`;
    const row = sums.get(key) ?? { source, currency, amount: 0 };
    row.amount += amount;
    sums.set(key, row);
  };
  for (const e of await affiliateEarnings(executor, { userId })) add("AFFILIATE", e.currency, e.fee);
  for (const b of await referralBonuses(executor, { inviterUserId: userId })) add("REFERRAL", b.currency, b.bonus);
  return [...sums.values()];
}
