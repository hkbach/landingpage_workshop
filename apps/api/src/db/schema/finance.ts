import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity";

// Fees and month closings (REQUIREMENTS FR-PAY-02, FR-ADM-16, FR-ADM-17, FR-ADM-24). Rates are whole basis points (1% = 100) of the ORIGINAL price of a booking.

/** One row per shop that has its own rates; a shop without a row uses the defaults of `packages/shared`. */
export const organizationFeeSettings = pgTable(
  "organization_fee_settings",
  {
    organizationId: uuid("organization_id").primaryKey().references(() => organizations.id),
    maintenanceBps: integer("maintenance_bps").notNull(),
    serviceBps: integer("service_bps").notNull(),
    /** The Affiliate fee a customer earns on a booking that came from a link (FR-ADM-17 calls the field `referralBps`). */
    affiliateBps: integer("affiliate_bps").notNull(),
    /** The Referral bonus for a friend who makes a first paid booking (FR-ADM-17: `inviteBonusBps`). */
    inviteBonusBps: integer("invite_bonus_bps").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => [
    check("fee_settings_range", sql`${t.maintenanceBps} BETWEEN 0 AND 10000 AND ${t.serviceBps} BETWEEN 0 AND 10000 AND ${t.affiliateBps} BETWEEN 0 AND 10000 AND ${t.inviteBonusBps} BETWEEN 0 AND 10000`),
    check("fee_settings_total", sql`${t.maintenanceBps} + ${t.serviceBps} <= 10000`),
  ],
);

/**
 * Every change of the rates of a shop, with the moment it takes effect (D24): a rate applies only to what happens AFTER that moment, so a payment made before keeps the rate it was worked out
 * with. A fee is worked out with the row that was in force when the payment was recorded (a reversal: when the payment it reverses was recorded). Append only (a trigger refuses UPDATE and DELETE).
 * `organization_fee_settings` is the current row, for the screens.
 */
export const organizationFeeRates = pgTable(
  "organization_fee_rates",
  {
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    maintenanceBps: integer("maintenance_bps").notNull(),
    serviceBps: integer("service_bps").notNull(),
    affiliateBps: integer("affiliate_bps").notNull(),
    inviteBonusBps: integer("invite_bonus_bps").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.effectiveFrom] }),
    check("fee_rates_range", sql`${t.maintenanceBps} BETWEEN 0 AND 10000 AND ${t.serviceBps} BETWEEN 0 AND 10000 AND ${t.affiliateBps} BETWEEN 0 AND 10000 AND ${t.inviteBonusBps} BETWEEN 0 AND 10000`),
    check("fee_rates_total", sql`${t.maintenanceBps} + ${t.serviceBps} <= 10000`),
  ],
);

export interface MonthClosingTotals {
  /** Payments and reversals of the month. */
  entries: number;
  /** What the guests paid, net of reversals (minor units). */
  collected: number;
  maintenanceFee: number;
  serviceFee: number;
  /** maintenanceFee + serviceFee: what the shop owes the platform (the invoice is sent later). */
  invoice: number;
  /** Not counted yet: the affiliate and referral programs are not in the backend. Kept so the shape does not change when they are. */
  affiliateFee: number;
  referralBonus: number;
  platformProfit: number;
}

/**
 * A month of a shop that was closed (D11): its figures are written down once, with the rates used, and the payments of that month can no longer be put back to unpaid (D10). Append only: a
 * trigger refuses UPDATE and DELETE.
 */
export const financeMonthClosings = pgTable(
  "finance_month_closings",
  {
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    /** "YYYY-MM" in the time zone of the shop. */
    month: text("month").notNull(),
    currency: text("currency").notNull(),
    maintenanceBps: integer("maintenance_bps").notNull(),
    serviceBps: integer("service_bps").notNull(),
    /** The affiliate and referral rates of the month when it was closed (0 for a month closed before the programs existed). */
    affiliateBps: integer("affiliate_bps").notNull().default(0),
    inviteBonusBps: integer("invite_bonus_bps").notNull().default(0),
    totals: jsonb("totals").notNull().$type<MonthClosingTotals>(),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.month] }), check("month_closing_format", sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`)],
);
