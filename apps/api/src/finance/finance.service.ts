import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import { feeBase, feeShares, filterLedgerRange, ledgerSeries, monthKey, summarizeLedger, type LedgerRow } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import type { OrgContext } from "../auth/auth.guards";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { addDays } from "../common/zoned-time";
import { DB, type Database } from "../db/db.module";
import { financeMonthClosings, organizations, type MonthClosingTotals } from "../db/schema";
import { RatesBook, buildLedger, ledgerView, loadEntries, resolveRange, startOfDay, type ShopInfo } from "./ledger";

export interface IncomeQuery { from?: string | undefined; to?: string | undefined; kind?: "PAYMENT" | "REVERSAL" | undefined; limit: number; cursor?: string | undefined }

const notFound = () => new NotFoundException({ code: "NOT_FOUND", message: "Shop not found." });
const FAR_PAST = new Date(0);

/** What a month of a shop adds up to (the invoice is what the shop owes the platform: maintenance + service fee). */
export function monthTotals(rows: readonly LedgerRow[]): MonthClosingTotals {
  const t = summarizeLedger(rows);
  // The affiliate fee and the referral bonus are not in the backend yet (no booking carries a link): they are 0 until the programs exist.
  return { entries: rows.length, collected: t.income, maintenanceFee: t.maintenanceFee, serviceFee: t.serviceFee, invoice: t.fees, affiliateFee: 0, referralBonus: 0, platformProfit: t.fees };
}

/**
 * Income of a shop (FR-PAY-02), the income of the platform (FR-ADM-16, FR-ADM-24) and the closing of the months (D11). Only the bookings that are PAID are counted. The fees are a percentage of the
 * ORIGINAL price of the booking, the rule is the one of `packages/shared`. Money is minor units.
 */
@Injectable()
export class FinanceService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  private async shopInfo(id: string): Promise<ShopInfo> {
    const [o] = await this.db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug, timezone: organizations.timezone, currency: organizations.currency }).from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!o) throw notFound();
    return o;
  }

  /** The ledger of one shop in a range of days (the days of the shop), with its totals and chart. */
  private async report(shop: ShopInfo, range: { from: string; to: string }, q: IncomeQuery) {
    const entries = await loadEntries(this.db, { organizationId: shop.id, fromUtc: startOfDay(range.from, shop.timezone), toUtc: startOfDay(addDays(range.to, 1), shop.timezone) });
    const book = await RatesBook.load(this.db, [shop.id]);
    const all = buildLedger(entries, shop, book);
    const totals = summarizeLedger(all);
    const shown = q.kind ? all.filter((r) => r.kind === (q.kind === "PAYMENT" ? "PAYMENT" : "REFUND")) : all;
    const offset = q.cursor ? Number(decodeCursor<{ o: number }>(q.cursor, ["o"]).o) : 0;
    const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
    const page = shown.slice(start, start + q.limit);
    const current = book.currentOf(shop.id);
    const body = {
      currency: shop.currency, timezone: shop.timezone, from: range.from, to: range.to,
      rates: { maintenanceBps: current.maintenanceBps, serviceBps: current.serviceBps },
      totals, series: ledgerSeries(all, shop.timezone, range.from, range.to), feeShares: feeShares(totals),
      items: page.map((r) => ledgerView(r, shop.timezone)),
      nextCursor: start + q.limit < shown.length ? encodeCursor({ o: start + q.limit }) : null,
    };
    return { body, book };
  }

  // ---- the shop owner -----------------------------------------------------------------------------------------------------------------------------------------

  /** `GET /finance/income`: income, fees and profit of the shop in a range of days (default: the last 180), the chart and the payments. */
  async income(org: OrgContext, q: IncomeQuery, now = new Date()) {
    const shop = await this.shopInfo(org.id);
    return (await this.report(shop, resolveRange(q.from, q.to, shop.timezone, now), q)).body;
  }

  // ---- the platform administrator -------------------------------------------------------------------------------------------------------------------------------

  /** `GET /admin/income`: one line per shop that had payments in the range (each day is a day of ITS shop) and the totals per currency (currencies are never added together). */
  async adminIncome(q: { from?: string | undefined; to?: string | undefined }, now = new Date()) {
    const range = resolveRange(q.from, q.to, "UTC", now);
    const shops = await this.db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug, timezone: organizations.timezone, currency: organizations.currency }).from(organizations).orderBy(asc(organizations.name), asc(organizations.id));
    // One wide window for every shop (their days differ by up to a day either way); each shop is then cut to its own days.
    const entries = await loadEntries(this.db, { fromUtc: new Date(`${addDays(range.from, -1)}T00:00:00Z`), toUtc: new Date(`${addDays(range.to, 2)}T00:00:00Z`) });
    const book = await RatesBook.load(this.db);
    const items = shops.flatMap((shop) => {
      const mine = entries.filter((e) => e.organizationId === shop.id);
      if (mine.length === 0) return [];
      const rows = filterLedgerRange(buildLedger(mine, shop, book), range.from, range.to, shop.timezone);
      if (rows.length === 0) return [];
      const t = summarizeLedger(rows);
      return [{
        shopId: shop.id, name: shop.name, slug: shop.slug, currency: shop.currency, entries: rows.length, collected: t.income,
        originalPrice: rows.reduce((n, r) => n + feeBase(r.amount, r.price), 0), maintenanceFee: t.maintenanceFee, serviceFee: t.serviceFee, adminIncome: t.fees, affiliateFee: 0, referralBonus: 0, profit: t.fees,
      }];
    });
    const totals = new Map<string, { currency: string; entries: number; collected: number; originalPrice: number; maintenanceFee: number; serviceFee: number; adminIncome: number; affiliateFee: number; referralBonus: number; profit: number }>();
    for (const i of items) {
      const t = totals.get(i.currency) ?? { currency: i.currency, entries: 0, collected: 0, originalPrice: 0, maintenanceFee: 0, serviceFee: 0, adminIncome: 0, affiliateFee: 0, referralBonus: 0, profit: 0 };
      t.entries += i.entries; t.collected += i.collected; t.originalPrice += i.originalPrice; t.maintenanceFee += i.maintenanceFee; t.serviceFee += i.serviceFee; t.adminIncome += i.adminIncome; t.affiliateFee += i.affiliateFee; t.referralBonus += i.referralBonus; t.profit += i.profit;
      totals.set(i.currency, t);
    }
    return { from: range.from, to: range.to, items, totals: [...totals.values()] };
  }

  /** `GET /admin/income/{shopId}`: the months of the shop (closed or open) and its payments in a range, with the fees of each. */
  async adminShopIncome(shopId: string, q: IncomeQuery, now = new Date()) {
    const shop = await this.shopInfo(shopId);
    const { body: range, book } = await this.report(shop, resolveRange(q.from, q.to, shop.timezone, now), q);
    const everything = buildLedger(await loadEntries(this.db, { organizationId: shop.id, fromUtc: FAR_PAST, toUtc: new Date(now.getTime() + 86_400_000) }), shop, book);
    const closings = new Map((await this.db.select().from(financeMonthClosings).where(eq(financeMonthClosings.organizationId, shop.id))).map((c) => [c.month, c]));
    const byMonth = new Map<string, LedgerRow[]>();
    for (const r of everything) { const k = monthKey(r.occurredAt, shop.timezone); (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(r); }
    const months = [...new Set([...byMonth.keys(), ...closings.keys()])].sort().reverse().map((month) => {
      const closing = closings.get(month);
      const rates = closing ? { maintenanceBps: closing.maintenanceBps, serviceBps: closing.serviceBps } : { maintenanceBps: book.currentOf(shop.id).maintenanceBps, serviceBps: book.currentOf(shop.id).serviceBps };
      return { month, closed: Boolean(closing), closedAt: closing ? closing.closedAt.toISOString() : null, rates, ...(closing ? closing.totals : monthTotals(byMonth.get(month) ?? [])) };
    });
    return { shop: { id: shop.id, name: shop.name, slug: shop.slug, currency: shop.currency, timezone: shop.timezone }, ...range, months };
  }

  // ---- closing the months ---------------------------------------------------------------------------------------------------------------------------------------

  /**
   * D11: every month that is over (in the time zone of the shop) and has payments is closed: its figures and the rates are written down once. Safe to run again and again (a month that is
   * closed is skipped, and two runs at the same time cannot close it twice: one waits for the other on the shop's lock). The rates written are the ones the shop has when it is closed.
   */
  async closeMonths(now = new Date()): Promise<{ shops: number; closed: number }> {
    const shops = await this.db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug, timezone: organizations.timezone, currency: organizations.currency }).from(organizations);
    let closed = 0;
    for (const shop of shops) {
      closed += await this.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`finance-close:${shop.id}`}))`);
        const current = monthKey(now.toISOString(), shop.timezone);
        const entries = await loadEntries(tx, { organizationId: shop.id, fromUtc: FAR_PAST, toUtc: startOfDay(`${current}-01`, shop.timezone) });
        if (entries.length === 0) return 0;
        const book = await RatesBook.load(tx, [shop.id]);
        const byMonth = new Map<string, LedgerRow[]>();
        for (const r of buildLedger(entries, shop, book)) { const k = monthKey(r.occurredAt, shop.timezone); (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(r); }
        let n = 0;
        for (const [month, rows] of byMonth) {
          if (book.isClosed(shop.id, month)) continue;
          const rates = book.currentOf(shop.id);
          const totals = monthTotals(rows); // a month that is not closed yet was priced with the current rates, which are the ones written below
          await tx.insert(financeMonthClosings).values({ organizationId: shop.id, month, currency: shop.currency, maintenanceBps: rates.maintenanceBps, serviceBps: rates.serviceBps, totals, closedAt: now }).onConflictDoNothing();
          await this.audit.record({ organizationId: shop.id, actorUserId: null, action: "finance.month_close", entityType: "finance_month", entityId: `${shop.id}:${month}`, after: { month, entries: rows.length, invoice: totals.invoice, maintenanceBps: rates.maintenanceBps, serviceBps: rates.serviceBps } }, tx);
          n++;
        }
        return n;
      });
    }
    return { shops: shops.length, closed };
  }
}
