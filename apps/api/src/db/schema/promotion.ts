import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity";

// The promotions of a shop (FR-PROMO-01, FR-ADM-25): a percentage or a fixed amount off the price of all the workshops or of some of them, between two business dates of the shop. The price a guest
// pays is worked out by the server from the promotions the guest chose (`packages/shared/src/promotions.ts`); a booking keeps what was taken off (BR-05), so editing or deleting a promotion later never
// touches a past booking. The rules both sides share (limits, status, free workshops) live in `packages/shared`.
export const discountType = pgEnum("discount_type", ["PERCENT", "FIXED_AMOUNT"]);
export const stackingMode = pgEnum("stacking_mode", ["SINGLE", "MULTIPLE"]);

export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    /** By language (only the languages the owner typed). */
    title: jsonb("title").notNull().$type<Record<string, string>>(),
    description: jsonb("description").notNull().default({}).$type<Record<string, string>>(),
    discountType: discountType("discount_type").notNull(),
    /** PERCENT: 1 to 100. FIXED_AMOUNT: minor units of the currency of the shop. */
    discountValue: bigint("discount_value", { mode: "number" }).notNull(),
    /** 3 to 20 capitals and digits, unique in the shop. */
    code: text("code").notNull(),
    /** An https link (a platform image comes with the image storage). */
    imageUrl: text("image_url"),
    stacking: stackingMode("stacking").notNull().default("SINGLE"),
    appliesTo: text("applies_to").notNull().default("ALL"),
    workshopIds: uuid("workshop_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    /** Business dates in the time zone of the shop, both days included. */
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    /** The owner can pause a promotion without losing it. */
    enabled: boolean("enabled").notNull().default(true),
    /** Paused by the platform administrator (a reason is kept): the owner cannot resume it. `heldWasEnabled` says whether it was running, so a resume puts it back. */
    heldReason: text("held_reason"),
    heldAt: timestamp("held_at", { withTimezone: true }),
    heldBy: uuid("held_by").references(() => users.id),
    heldWasEnabled: boolean("held_was_enabled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("promotions_org_code_unique").on(t.organizationId, t.code),
    check("promotions_code", sql`${t.code} ~ '^[A-Z0-9]{3,20}$'`),
    check("promotions_value", sql`${t.discountValue} > 0 AND (${t.discountType} <> 'PERCENT' OR ${t.discountValue} <= 100)`),
    check("promotions_applies_to", sql`${t.appliesTo} IN ('ALL', 'SELECTED') AND (${t.appliesTo} = 'ALL' OR cardinality(${t.workshopIds}) > 0)`),
    check("promotions_dates", sql`${t.endDate} >= ${t.startDate}`),
    index("promotions_org_idx").on(t.organizationId, t.createdAt),
  ],
);
