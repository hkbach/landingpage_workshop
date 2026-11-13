import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { bookingSeries, monthKey, trendKeys, trendTotals, type TrendPeriod } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import type { OrgContext } from "../auth/auth.guards";
import { autoCloseEnded } from "../catalog/session-sweeper";
import { addDays, dateIn } from "../common/zoned-time";
import { DB, type Database } from "../db/db.module";
import { organizations } from "../db/schema";
import { FinanceService } from "../finance/finance.service";
import { startOfDay } from "../finance/ledger";

const num = (v: unknown): number => Number(v ?? 0);

/**
 * The overview of the shop owner (FR-PAY-03): the numbers that need action today, one card for each part of the shop, and the chart of the bookings. Everything is worked out on the server from
 * the data of the shop of the session (`organization_id` in every query) and in the time zone of the shop. Money is minor units of the currency of the shop.
 */
@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService, @Inject(FinanceService) private readonly finance: FinanceService) {}

  private async shopOf(org: OrgContext) {
    const [o] = await this.db.select({ timezone: organizations.timezone, currency: organizations.currency }).from(organizations).where(eq(organizations.id, org.id)).limit(1);
    return o ?? { timezone: "UTC", currency: "VND" };
  }

  private async rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
    return (await this.db.execute(query)).rows as T[];
  }

  /** The bookings of the shop with the start and the state of their session (what the chart and the numbers are made of). */
  private async points(orgId: string, from: Date) {
    const result = await this.rows<{ starts_ms: string; status: string; quantity: number }>(sql`
      select (extract(epoch from s.starts_at) * 1000)::bigint as starts_ms, b.status, b.quantity
        from bookings b join workshop_sessions s on s.organization_id = b.organization_id and s.id = b.session_id
       where b.organization_id = ${orgId} and s.starts_at >= ${from.toISOString()}::timestamptz`);
    return result.map((r) => ({ startsAt: new Date(Number(r.starts_ms)).toISOString(), status: r.status, guests: Number(r.quantity) }));
  }

  /** `GET /dashboard/summary`. */
  async summary(org: OrgContext, now = new Date()) {
    await autoCloseEnded(this.db, this.audit, { organizationId: org.id, now }); // a screen of the shop closes the sessions whose time is over, like the others
    const shop = await this.shopOf(org);
    const today = dateIn(now, shop.timezone);
    const dayStart = startOfDay(today, shop.timezone);
    const dayEnd = startOfDay(addDays(today, 1), shop.timezone);
    const iso = (d: Date) => d.toISOString();

    const [b] = await this.rows<{ today: number; not_confirmed: number; awaiting: number; awaiting_amount: string; to_pay: number; to_pay_amount: string }>(sql`
      select count(*) filter (where b.status <> 'CANCELLED' and s.starts_at >= ${iso(dayStart)}::timestamptz and s.starts_at < ${iso(dayEnd)}::timestamptz)::int as today,
             count(*) filter (where b.status = 'NOT_CONFIRMED' and s.starts_at > ${iso(now)}::timestamptz)::int as not_confirmed,
             count(*) filter (where b.status <> 'CANCELLED' and b.payment_status = 'UNPAID' and b.total_amount > 0 and s.status = 'CLOSED')::int as awaiting,
             coalesce(sum(b.total_amount) filter (where b.status <> 'CANCELLED' and b.payment_status = 'UNPAID' and b.total_amount > 0 and s.status = 'CLOSED'), 0)::bigint as awaiting_amount,
             count(*) filter (where b.status <> 'CANCELLED' and b.payment_status = 'UNPAID' and b.total_amount > 0 and s.starts_at > ${iso(now)}::timestamptz and s.status in ('OPEN', 'RUNNING', 'PAUSED'))::int as to_pay,
             coalesce(sum(b.total_amount) filter (where b.status <> 'CANCELLED' and b.payment_status = 'UNPAID' and b.total_amount > 0 and s.starts_at > ${iso(now)}::timestamptz and s.status in ('OPEN', 'RUNNING', 'PAUSED')), 0)::bigint as to_pay_amount
        from bookings b join workshop_sessions s on s.organization_id = b.organization_id and s.id = b.session_id
       where b.organization_id = ${org.id}`);
    const [s] = await this.rows<{ upcoming: number; reserved: string; capacity: string; closed: number; completed: number }>(sql`
      select count(*) filter (where starts_at > ${iso(now)}::timestamptz and status in ('OPEN', 'RUNNING', 'PAUSED'))::int as upcoming,
             coalesce(sum(reserved_count) filter (where starts_at > ${iso(now)}::timestamptz and status in ('OPEN', 'RUNNING', 'PAUSED')), 0)::bigint as reserved,
             coalesce(sum(capacity) filter (where starts_at > ${iso(now)}::timestamptz and status in ('OPEN', 'RUNNING', 'PAUSED')), 0)::bigint as capacity,
             count(*) filter (where status = 'CLOSED')::int as closed, count(*) filter (where status = 'COMPLETED')::int as completed
        from workshop_sessions where organization_id = ${org.id}`);
    const [w] = await this.rows<{ active: number; draft: number }>(sql`select count(*) filter (where status = 'ACTIVE')::int as active, count(*) filter (where status = 'DRAFT')::int as draft from workshops where organization_id = ${org.id}`);
    const [c] = await this.rows<{ total: number; returning: number }>(sql`
      select (select count(*)::int from customers where organization_id = ${org.id}) as total,
             (select count(*)::int from (select customer_id from bookings where organization_id = ${org.id} and status <> 'CANCELLED' group by customer_id having count(*) > 1) x) as returning`);
    const [p] = await this.rows<{ pages: number; live: number }>(sql`select count(*)::int as pages, count(*) filter (where is_live)::int as live from site_pages where organization_id = ${org.id}`);

    const month = monthKey(now.toISOString(), shop.timezone);
    const monthBucket = bookingSeries(await this.points(org.id, new Date(now.getTime() - 100 * 86_400_000)), "3m", now, shop.timezone).at(-1)!; // bookings of the month of their session
    const income = (await this.finance.income(org, { from: `${month}-01`, to: today, limit: 1 }, now)).totals;
    const reserved = num(s?.reserved);
    const capacity = num(s?.capacity);

    return {
      currency: shop.currency, timezone: shop.timezone, today,
      kpis: {
        bookingsToday: num(b?.today), upcomingSessions: num(s?.upcoming), notConfirmed: num(b?.not_confirmed),
        // Unpaid bookings (not cancelled, with something to pay): of a session that is closed (the shop still has to confirm) and of a coming session (the guest pays at the studio)
        awaitingPaymentConfirmation: { count: num(b?.awaiting), amount: num(b?.awaiting_amount) }, toPayAtStudio: { count: num(b?.to_pay), amount: num(b?.to_pay_amount) },
      },
      cards: {
        bookings: { month, total: monthBucket.total, guests: monthBucket.guests, lostRate: monthBucket.total ? monthBucket.lost / monthBucket.total : 0 },
        workshops: { active: num(w?.active), draft: num(w?.draft) },
        sessions: { upcoming: num(s?.upcoming), reserved, capacity, seatRate: capacity ? reserved / capacity : 0, closedToComplete: num(s?.closed), completed: num(s?.completed) },
        customers: { total: num(c?.total), returning: num(c?.returning) },
        income: { month, income: income.income, fees: income.fees, profit: income.profit },
        landingPages: { pages: num(p?.pages), max: 2, live: num(p?.live) },
      },
    };
  }

  /** `GET /dashboard/booking-stats?period=`: the bookings of each day (1m) or month (3m, 6m, 12m) of the period, by what became of them, and the totals. A booking counts on the day of its session. */
  async bookingStats(org: OrgContext, period: TrendPeriod, now = new Date()) {
    const shop = await this.shopOf(org);
    const points = await this.points(org.id, new Date(now.getTime() - 400 * 86_400_000));
    const series = bookingSeries(points, period, now, shop.timezone);
    return { period, unit: period === "1m" ? ("day" as const) : ("month" as const), keys: trendKeys(period, now, shop.timezone), timezone: shop.timezone, series, totals: trendTotals(series) };
  }
}
