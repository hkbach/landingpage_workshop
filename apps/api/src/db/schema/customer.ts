import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { workshops } from "./catalog";
import { users } from "./identity";

// The area of the customer who has an account (FR-CUST-01 "Khu vực customer"): the profile, the workshops saved as favorites, and the ratings of the workshops attended. The account is platform
// wide (one user), the bookings it made are found by its email in every shop.

/** What the customer tells about themselves (the name and the language are on the user). Written whole by the customer: what is left out is removed. */
export const customerProfiles = pgTable(
  "customer_profiles",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id),
    phone: text("phone").notNull().default(""),
    /** ISO 3166-1 alpha-2, capitals. */
    country: text("country").notNull().default(""),
    birthDate: date("birth_date", { mode: "string" }),
    /** Exactly three (the workshops page shows first the ones that share the most of them). */
    favoriteCategories: text("favorite_categories").array().notNull().default(sql`ARRAY[]::text[]`),
    gender: text("gender"),
    socials: jsonb("socials").notNull().default({}).$type<Record<string, string>>(),
    avatarUrl: text("avatar_url"),
    /** When the customer agreed to the terms when registering. */
    consentAt: timestamp("consent_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("customer_profiles_gender", sql`${t.gender} IS NULL OR ${t.gender} IN ('MALE', 'FEMALE', 'OTHER')`)],
);

/** A workshop a customer saved with the heart. One row for each account and workshop. */
export const favoriteWorkshops = pgTable(
  "favorite_workshops",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    organizationId: uuid("organization_id").notNull(),
    workshopId: uuid("workshop_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.workshopId] }),
    foreignKey({ columns: [t.organizationId, t.workshopId], foreignColumns: [workshops.organizationId, workshops.id], name: "favorite_workshops_workshop_fk" }),
    index("favorite_workshops_user_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * The rating of a workshop by a customer who attended it: 1 to 5 stars and an optional comment, once for each booking and never edited by the customer. The platform administrator can remove
 * one that breaks the rules (a reason is kept): it stops counting and the shop no longer sees it; it can be put back.
 */
export const workshopRatings = pgTable(
  "workshop_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    workshopId: uuid("workshop_id").notNull(),
    bookingId: uuid("booking_id").notNull().unique(),
    userId: uuid("user_id").notNull().references(() => users.id),
    stars: integer("stars").notNull(),
    comment: text("comment"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedReason: text("removed_reason"),
    removedBy: uuid("removed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.organizationId, t.workshopId], foreignColumns: [workshops.organizationId, workshops.id], name: "workshop_ratings_workshop_fk" }),
    unique("workshop_ratings_org_id_unique").on(t.organizationId, t.id),
    check("workshop_ratings_stars", sql`${t.stars} BETWEEN 1 AND 5`),
    check("workshop_ratings_comment", sql`${t.comment} IS NULL OR char_length(${t.comment}) <= 500`),
    index("workshop_ratings_workshop_idx").on(t.organizationId, t.workshopId, t.createdAt),
    index("workshop_ratings_live_idx").on(t.workshopId).where(sql`${t.removedAt} IS NULL`), // the score of the workshops on every public page
  ],
);
