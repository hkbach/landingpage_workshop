import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./identity";

// Workshops, their weekly schedule and their sessions (REQUIREMENTS 8.4). Every table carries `organization_id`; the composite foreign keys make it impossible for a row of one shop to
// point at a row of another (the database refuses it, not only the code). Times are timestamptz (UTC); money is bigint minor units.
export const workshopStatus = pgEnum("workshop_status", ["DRAFT", "ACTIVE"]);
export const sessionStatus = pgEnum("session_status", ["OPEN", "PAUSED", "RUNNING", "CLOSED", "COMPLETED"]);
export const ruleStatus = pgEnum("schedule_rule_status", ["ACTIVE", "INACTIVE"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const workshops = pgTable(
  "workshops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    /** `{ en: "...", vi: "..." }`: one text per language; the default language of the shop is required, the others are optional. */
    title: jsonb("title").notNull().$type<Record<string, string>>(),
    shortDescription: jsonb("short_description").notNull().default({}).$type<Record<string, string>>(),
    description: jsonb("description").notNull().default({}).$type<Record<string, string>>(),
    includes: jsonb("includes").notNull().default({}).$type<Record<string, string[]>>(),
    notes: jsonb("notes").notNull().default({}).$type<Record<string, string>>(),
    durationMinutes: integer("duration_minutes").notNull(),
    /** Price of ONE guest in minor units of `currency` (a booking keeps a snapshot, so a later change never touches a past booking). */
    priceAmount: bigint("price_amount", { mode: "number" }).notNull(),
    /** The currency of the shop, copied when the workshop is made and never edited on its own. */
    currency: text("currency").notNull(),
    defaultCapacity: integer("default_capacity").notNull(),
    maxPerBooking: integer("max_per_booking").notNull().default(6),
    // TODO(media): `cover_media_id` / `gallery_media_ids` of REQUIREMENTS 8.4 once media upload (R2) exists; until then the pictures are https links, like in the mock.
    coverUrl: text("cover_url").notNull().default(""),
    galleryUrls: text("gallery_urls").array().notNull().default(sql`ARRAY[]::text[]`),
    categories: text("categories").array().notNull(),
    address: text("address").notNull().default(""),
    addressNote: text("address_note").notNull().default(""),
    status: workshopStatus("status").notNull().default("DRAFT"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("workshops_org_id_unique").on(t.organizationId, t.id),
    check("workshops_duration", sql`${t.durationMinutes} BETWEEN 15 AND 600`),
    check("workshops_price", sql`${t.priceAmount} >= 0`),
    check("workshops_capacity", sql`${t.defaultCapacity} BETWEEN 1 AND 50`),
    check("workshops_max_per_booking", sql`${t.maxPerBooking} BETWEEN 1 AND ${t.defaultCapacity}`),
    check("workshops_categories", sql`cardinality(${t.categories}) BETWEEN 1 AND 3`),
    check("workshops_gallery", sql`cardinality(${t.galleryUrls}) <= 6`),
    index("workshops_org_idx").on(t.organizationId, t.sortOrder, t.id),
  ],
);

export const scheduleRules = pgTable(
  "schedule_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    workshopId: uuid("workshop_id").notNull(),
    /** 0 = Sunday ... 6 = Saturday, in the time zone of the shop. */
    weekdays: smallint("weekdays").array().notNull(),
    /** "HH:mm" in the time zone of the shop. */
    startTimes: text("start_times").array().notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    capacityOverride: integer("capacity_override"),
    status: ruleStatus("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ columns: [t.organizationId, t.workshopId], foreignColumns: [workshops.organizationId, workshops.id], name: "schedule_rules_workshop_fk" }),
    check("schedule_rules_weekdays", sql`cardinality(${t.weekdays}) BETWEEN 1 AND 7 AND ${t.weekdays} <@ ARRAY[0,1,2,3,4,5,6]::smallint[]`),
    check("schedule_rules_start_times", sql`cardinality(${t.startTimes}) BETWEEN 1 AND 12`),
    check("schedule_rules_dates", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
    check("schedule_rules_capacity", sql`${t.capacityOverride} IS NULL OR ${t.capacityOverride} BETWEEN 1 AND 50`),
    index("schedule_rules_workshop_idx").on(t.organizationId, t.workshopId),
  ],
);

export const workshopSessions = pgTable(
  "workshop_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    workshopId: uuid("workshop_id").notNull(),
    /** The rule that made the session (null for one added by hand). A rule that is deleted detaches its sessions, it does not delete them. */
    scheduleRuleId: uuid("schedule_rule_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** The slot the session was made for. Re-scheduling changes `starts_at` but never this, so a rule does not make the old slot again (and a slot is only ever made once). */
    originStartsAt: timestamp("origin_starts_at", { withTimezone: true }).notNull(),
    capacity: integer("capacity").notNull(),
    /** Changed ONLY by SessionCapacityService under a row lock (CLAUDE.md); never written elsewhere. */
    reservedCount: integer("reserved_count").notNull().default(0),
    /** The last booking number given in this session: "SES-0003-042" is 42. Bumped under the row lock of the session, so codes never repeat. */
    bookingSeq: integer("booking_seq").notNull().default(0),
    status: sessionStatus("status").notNull().default("OPEN"),
    /** True when the system closed the session because its time was over. */
    autoClosed: boolean("auto_closed").notNull().default(false),
    /** "SES-0001": made by the system, unique in the shop, never changed (a trigger refuses it). */
    code: text("code").notNull(),
    imageUrl: text("image_url"),
    clonedFromSessionId: uuid("cloned_from_session_id"),
    /** The history: `[{ type: "CLOSED|RESCHEDULED|REOPENED|AUTO_CLOSED", at, reason?, by? }]`, never removed (REQUIREMENTS 8.4). */
    sessionNotes: jsonb("session_notes").notNull().default([]).$type<SessionNoteRow[]>(),
    bookingCutoffMinutes: integer("booking_cutoff_minutes").notNull().default(120),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ columns: [t.organizationId, t.workshopId], foreignColumns: [workshops.organizationId, workshops.id], name: "workshop_sessions_workshop_fk" }),
    foreignKey({ columns: [t.scheduleRuleId], foreignColumns: [scheduleRules.id], name: "workshop_sessions_rule_fk" }).onDelete("set null"),
    unique("workshop_sessions_org_id_unique").on(t.organizationId, t.id),
    unique("workshop_sessions_org_code_unique").on(t.organizationId, t.code),
    unique("workshop_sessions_start_unique").on(t.organizationId, t.workshopId, t.startsAt),
    unique("workshop_sessions_origin_unique").on(t.organizationId, t.workshopId, t.originStartsAt),
    check("workshop_sessions_capacity", sql`${t.capacity} BETWEEN 1 AND 50`),
    check("workshop_sessions_reserved", sql`${t.reservedCount} BETWEEN 0 AND ${t.capacity}`),
    check("workshop_sessions_time", sql`${t.endsAt} > ${t.startsAt}`),
    check("workshop_sessions_cutoff", sql`${t.bookingCutoffMinutes} BETWEEN 0 AND 10080`),
    check("workshop_sessions_code_format", sql`${t.code} ~ '^SES-[0-9]{4,}$'`),
    index("workshop_sessions_org_start_idx").on(t.organizationId, t.startsAt, t.status),
    index("workshop_sessions_open_end_idx").on(t.endsAt).where(sql`${t.status} NOT IN ('CLOSED','COMPLETED')`),
    index("workshop_sessions_starts_idx").on(t.startsAt, t.id), // the platform-wide list of the administrator (ascending: serves DESC read backwards)
  ],
);

export interface SessionNoteRow {
  type: "CLOSED" | "RESCHEDULED" | "REOPENED" | "AUTO_CLOSED";
  at: string;
  reason?: { code: string; note?: string };
  by?: "ADMIN";
  from?: string;
}
