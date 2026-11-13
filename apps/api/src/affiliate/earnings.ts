import { sql, type SQL } from "drizzle-orm";
import type { Executor } from "../db/db.module";
import { DEFAULT_RATES } from "../finance/rates";

// What the two programs earn (FR-CUST-02, FR-CUST-03, FR-ADM-16). Both are a percentage of the ORIGINAL price of the booking (before the vouchers), like the other fees, with the rate that was in
// force WHEN THE BOOKING WAS PAID (the history of the rates, D24: a change of the rates never touches what was already worked out). Money is minor units.
//
// An earning belongs to the MONTH (time zone of the shop) in which the booking was paid, and is only a figure waiting for the closing until that month of the shop is closed: it is worked out
// from the bookings as they are now, so a booking put back to unpaid (or cancelled) stops counting. When the month is closed it is written once into the wallet (`settlement.ts`) and never
// changes again (D11, D24).

/** The original price of a booking (the alias of the table is `b`). */
const SUBTOTAL = sql`coalesce((b.snapshot->>'subtotalAmount')::bigint, b.unit_price_amount * b.quantity)`;

const rows = async <T>(executor: Executor, query: SQL): Promise<T[]> => (await executor.execute(query)).rows as T[];

export interface AffiliateRow {
  bookingId: string; linkId: string; userId: string; organizationId: string; currency: string;
  /** The month the booking was paid in ("YYYY-MM", the time zone of the shop) and whether that month of the shop is closed. */
  month: string; closed: boolean;
  /** The Affiliate fee: the affiliate rate in force when the booking was paid x the original price. */
  fee: number;
}

/** The PAID (and not cancelled) bookings that came through an affiliate link, with their Affiliate fee. */
export async function affiliateRows(executor: Executor, filter: { userId?: string; organizationId?: string } = {}): Promise<AffiliateRow[]> {
  const result = await rows<{ booking_id: string; link_id: string; user_id: string; organization_id: string; currency: string; month: string; closed: boolean; fee: string }>(executor, sql`
    select b.id as booking_id, b.affiliate_link_id as link_id, l.user_id, b.organization_id, b.currency, mo.m as month,
           exists (select 1 from finance_month_closings c where c.organization_id = b.organization_id and c.month = mo.m) as closed,
           round(${SUBTOTAL}::numeric * coalesce(rr.affiliate_bps, ${DEFAULT_RATES.affiliateBps}) / 10000)::bigint as fee
      from bookings b
      join affiliate_links l on l.id = b.affiliate_link_id
      join organizations o on o.id = b.organization_id
      join lateral (select max(p.recorded_at) as paid_at from payments p where p.organization_id = b.organization_id and p.booking_id = b.id and p.type = 'PAYMENT') pay on pay.paid_at is not null
      cross join lateral (select to_char(pay.paid_at at time zone o.timezone, 'YYYY-MM') as m) mo
      left join lateral (select r.affiliate_bps from organization_fee_rates r where r.organization_id = b.organization_id and r.effective_from <= pay.paid_at order by r.effective_from desc limit 1) rr on true
     where b.payment_status = 'PAID' and b.status <> 'CANCELLED'
       ${filter.userId ? sql`and l.user_id = ${filter.userId}` : sql``} ${filter.organizationId ? sql`and b.organization_id = ${filter.organizationId}` : sql``}`);
  return result.map((r) => ({ bookingId: r.booking_id, linkId: r.link_id, userId: r.user_id, organizationId: r.organization_id, currency: r.currency, month: r.month, closed: r.closed, fee: Number(r.fee) }));
}

export interface LinkEarning { linkId: string; currency: string; /** Paid bookings that came through the link. */ bookings: number; /** The Affiliate fee they earned. */ fee: number }

/** Per affiliate link: the paid bookings that came through it and the Affiliate fee of them. A disabled link keeps what it earned (it only stops counting new bookings). */
export async function affiliateEarnings(executor: Executor, filter: { userId?: string } = {}): Promise<LinkEarning[]> {
  const sums = new Map<string, LinkEarning>();
  for (const r of await affiliateRows(executor, filter)) {
    const key = `${r.linkId}|${r.currency}`;
    const e = sums.get(key) ?? { linkId: r.linkId, currency: r.currency, bookings: 0, fee: 0 };
    e.bookings += 1;
    e.fee += r.fee;
    sums.set(key, e);
  }
  return [...sums.values()];
}

export interface ReferralBonus {
  referralId: string; inviterUserId: string; friendUserId: string; bookingId: string; bookingCode: string; organizationId: string; currency: string;
  /** The Referral bonus: the invite rate in force when the booking was paid x the original price of that booking. */
  bonus: number;
  /** When it was paid (the last payment entry). */
  paidAt: Date | null;
  month: string; closed: boolean;
}

/**
 * The bonus of each friend, once: the FIRST booking the friend made (by the email of the account) AFTER registering that is PAID and not cancelled. A booking made before registering never
 * counts, a later booking of the same friend earns nothing more, and a booking put back to unpaid hands the bonus to the next paid one (FR-CUST-03).
 */
export async function referralBonuses(executor: Executor, filter: { inviterUserId?: string; organizationId?: string } = {}): Promise<ReferralBonus[]> {
  const result = await rows<{ referral_id: string; inviter: string; friend: string; booking_id: string; booking_code: string; organization_id: string; currency: string; bonus: string; paid_ms: string; month: string; closed: boolean }>(executor, sql`
    select distinct on (r.id) r.id as referral_id, r.inviter_user_id as inviter, r.friend_user_id as friend, b.id as booking_id, b.booking_code, b.organization_id, b.currency,
           round(${SUBTOTAL}::numeric * coalesce(rr.invite_bonus_bps, ${DEFAULT_RATES.inviteBonusBps}) / 10000)::bigint as bonus,
           (extract(epoch from pay.paid_at) * 1000)::bigint as paid_ms, mo.m as month,
           exists (select 1 from finance_month_closings c where c.organization_id = b.organization_id and c.month = mo.m) as closed
      from referrals r
      join users f on f.id = r.friend_user_id
      join bookings b on lower(b.guest_email) = f.email and b.created_at > r.created_at and b.payment_status = 'PAID' and b.status <> 'CANCELLED'
      join organizations o on o.id = b.organization_id
      join lateral (select max(p.recorded_at) as paid_at from payments p where p.organization_id = b.organization_id and p.booking_id = b.id and p.type = 'PAYMENT') pay on pay.paid_at is not null
      cross join lateral (select to_char(pay.paid_at at time zone o.timezone, 'YYYY-MM') as m) mo
      left join lateral (select x.invite_bonus_bps from organization_fee_rates x where x.organization_id = b.organization_id and x.effective_from <= pay.paid_at order by x.effective_from desc limit 1) rr on true
     where true ${filter.inviterUserId ? sql`and r.inviter_user_id = ${filter.inviterUserId}` : sql``} ${filter.organizationId ? sql`and b.organization_id = ${filter.organizationId}` : sql``}
     order by r.id, b.created_at, b.id`);
  return result.map((r) => ({
    referralId: r.referral_id, inviterUserId: r.inviter, friendUserId: r.friend, bookingId: r.booking_id, bookingCode: r.booking_code, organizationId: r.organization_id, currency: r.currency,
    bonus: Number(r.bonus), paidAt: r.paid_ms === null ? null : new Date(Number(r.paid_ms)), month: r.month, closed: r.closed,
  }));
}

export interface ProgramEarning { source: "AFFILIATE" | "REFERRAL"; currency: string; amount: number }

/**
 * What an account earned from the two programs in months that are NOT closed yet, for each source and currency: it waits for the closing of the month (of the shop) and cannot be withdrawn
 * until then. What is in a closed month is in the wallet as credits (`settlement.ts`).
 */
export async function unsettledEarnings(executor: Executor, userId: string): Promise<ProgramEarning[]> {
  const sums = new Map<string, ProgramEarning>();
  const add = (source: ProgramEarning["source"], currency: string, amount: number) => {
    const key = `${source}|${currency}`;
    const row = sums.get(key) ?? { source, currency, amount: 0 };
    row.amount += amount;
    sums.set(key, row);
  };
  for (const e of await affiliateRows(executor, { userId })) if (!e.closed) add("AFFILIATE", e.currency, e.fee);
  for (const b of await referralBonuses(executor, { inviterUserId: userId })) if (!b.closed) add("REFERRAL", b.currency, b.bonus);
  return [...sums.values()];
}
