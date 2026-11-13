import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { checkFeeRates, isValidFeeBps } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../catalog/workshops.service";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { DB, type Database, type Executor } from "../db/db.module";
import { organizationFeeRates, organizationFeeSettings, organizations } from "../db/schema";
import { DEFAULT_RATES, type Rates } from "./ledger";

/** The four rates as the API names them: `referralBps` is the Affiliate fee and `inviteBonusBps` the Referral bonus (FR-ADM-17). */
export interface FeeRatesView { maintenanceBps: number; serviceBps: number; referralBps: number; inviteBonusBps: number }
export type FeeRatesPatch = Partial<FeeRatesView>;

const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);
const toView = (r: Rates): FeeRatesView => ({ maintenanceBps: r.maintenanceBps, serviceBps: r.serviceBps, referralBps: r.affiliateBps, inviteBonusBps: r.inviteBonusBps });

function validate(r: FeeRatesView): void {
  const fields: Record<string, string> = {};
  const check = checkFeeRates(r);
  if (check === "MAINTENANCE_INVALID") fields.maintenanceBps = "invalid";
  else if (check === "SERVICE_INVALID") fields.serviceBps = "invalid";
  else if (check === "TOTAL_TOO_HIGH") { fields.maintenanceBps = "totalTooHigh"; fields.serviceBps = "totalTooHigh"; }
  if (!isValidFeeBps(r.referralBps)) fields.referralBps = "invalid";
  if (!isValidFeeBps(r.inviteBonusBps)) fields.inviteBonusBps = "invalid";
  if (Object.keys(fields).length > 0) throw new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });
}

/** The fee rates of the shops (FR-ADM-17): the platform administrator sets them, one shop at a time or all at once. Every change is audited with the old and the new values. */
@Injectable()
export class FeesService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  private async ratesOf(executor: Executor, organizationId: string): Promise<{ rates: Rates; custom: boolean }> {
    const [s] = await executor.select().from(organizationFeeSettings).where(eq(organizationFeeSettings.organizationId, organizationId)).limit(1);
    return s ? { rates: { maintenanceBps: s.maintenanceBps, serviceBps: s.serviceBps, affiliateBps: s.affiliateBps, inviteBonusBps: s.inviteBonusBps }, custom: true } : { rates: DEFAULT_RATES, custom: false };
  }

  /** The shops with their rates (a shop without its own rates shows the defaults and `custom: false`), by name. */
  async list(q: { q?: string | undefined; limit: number; cursor?: string | undefined }) {
    const conditions: (SQL | undefined)[] = [];
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`;
      conditions.push(sql`(${organizations.name} ilike ${like} escape '\\' or ${organizations.slug} ilike ${like} escape '\\')`);
    }
    if (q.cursor) {
      const c = decodeCursor<{ name: string; id: string }>(q.cursor, ["name", "id"]);
      conditions.push(sql`(${organizations.name}, ${organizations.id}) > (${String(c.name)}, ${String(c.id)}::uuid)`);
    }
    const rows = await this.db
      .select({ o: organizations, s: organizationFeeSettings })
      .from(organizations).leftJoin(organizationFeeSettings, eq(organizationFeeSettings.organizationId, organizations.id))
      .where(and(...conditions)).orderBy(asc(organizations.name), asc(organizations.id)).limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = rows.length > q.limit ? page[page.length - 1] : undefined;
    return {
      defaults: toView(DEFAULT_RATES),
      items: page.map(({ o, s }) => ({
        shopId: o.id, name: o.name, slug: o.slug, status: o.status, currency: o.currency, custom: Boolean(s),
        ...toView(s ? { maintenanceBps: s.maintenanceBps, serviceBps: s.serviceBps, affiliateBps: s.affiliateBps, inviteBonusBps: s.inviteBonusBps } : DEFAULT_RATES), updatedAt: s ? s.updatedAt.toISOString() : null,
      })),
      nextCursor: last ? encodeCursor({ name: last.o.name, id: last.o.id }) : null,
    };
  }

  async get(organizationId: string) {
    const [o] = await this.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!o) throw new NotFoundException({ code: "NOT_FOUND", message: "Shop not found." });
    const { rates, custom } = await this.ratesOf(this.db, organizationId);
    return { shopId: organizationId, custom, ...toView(rates) };
  }

  /** Sets the rates of one shop. A field that is left out keeps its value (the form of the shop only has the two fees). */
  async set(organizationId: string, patch: FeeRatesPatch, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [o] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1).for("update");
      if (!o) throw new NotFoundException({ code: "NOT_FOUND", message: "Shop not found." });
      const before = (await this.ratesOf(tx, organizationId)).rates;
      const next: FeeRatesView = { ...toView(before), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
      validate(next);
      await this.write(tx, organizationId, next, actor, toView(before));
      await this.audit.record({ organizationId, actorUserId: actor.userId, action: "fees.update", entityType: "fee_settings", entityId: organizationId, before: toView(before), after: next, ip: actor.ip }, tx);
      return { shopId: organizationId, custom: true, ...next };
    });
  }

  /** The same four rates for every shop, all or nothing. */
  async bulk(rates: FeeRatesView, actor: Actor) {
    validate(rates);
    return this.db.transaction(async (tx) => {
      const shops = await tx.select({ id: organizations.id }).from(organizations).orderBy(asc(organizations.id)).for("update");
      for (const shop of shops) {
        const before = (await this.ratesOf(tx, shop.id)).rates;
        await this.write(tx, shop.id, rates, actor, toView(before));
        await this.audit.record({ organizationId: shop.id, actorUserId: actor.userId, action: "fees.bulk_update", entityType: "fee_settings", entityId: shop.id, before: toView(before), after: rates, ip: actor.ip }, tx);
      }
      return { updated: shops.length, ...rates };
    });
  }

  /**
   * Saves the rates (the current row, for the screens) and, when they are not the ones the shop already had, a new version of its history that takes effect NOW (D24): only what is paid from
   * this moment on is worked out with them; every fee worked out before keeps the rates it was worked out with.
   */
  private async write(executor: Executor, organizationId: string, r: FeeRatesView, actor: Actor, before: FeeRatesView): Promise<void> {
    const values = { maintenanceBps: r.maintenanceBps, serviceBps: r.serviceBps, affiliateBps: r.referralBps, inviteBonusBps: r.inviteBonusBps, updatedAt: new Date(), updatedBy: actor.userId };
    await executor.insert(organizationFeeSettings).values({ organizationId, ...values }).onConflictDoUpdate({ target: organizationFeeSettings.organizationId, set: values });
    if (r.maintenanceBps === before.maintenanceBps && r.serviceBps === before.serviceBps && r.referralBps === before.referralBps && r.inviteBonusBps === before.inviteBonusBps) return; // nothing changed: no new version
    await executor.insert(organizationFeeRates).values({
      organizationId, effectiveFrom: sql`clock_timestamp()`, maintenanceBps: r.maintenanceBps, serviceBps: r.serviceBps, affiliateBps: r.referralBps, inviteBonusBps: r.inviteBonusBps, createdBy: actor.userId,
    });
  }
}
