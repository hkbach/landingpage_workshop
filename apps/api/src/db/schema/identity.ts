import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { memberRole, memberStatus, orgStatus, platformRole, userStatus, userTokenType } from "./enums";

// Identity and tenant (REQUIREMENTS 8.1). Every id is a uuid; every time is timestamptz (UTC); names are snake_case.
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always lowercase (the CHECK below), so the unique index is case-insensitive. */
    email: text("email").notNull().unique(),
    /** argon2id hash, never the password. */
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    status: userStatus("status").notNull().default("UNVERIFIED"),
    platformRole: platformRole("platform_role"),
    uiLocale: text("ui_locale").notNull().default("en"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("users_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Made from the name when the shop signs up and NEVER changed (a trigger refuses any update, even by an administrator: BR-21). */
    slug: text("slug").notNull().unique(),
    status: orgStatus("status").notNull().default("DRAFT"),
    statusReason: text("status_reason"),
    country: text("country").notNull(),
    timezone: text("timezone").notNull(),
    currency: text("currency").notNull(),
    defaultLocale: text("default_locale").notNull().default("en"),
    enabledLocales: text("enabled_locales").array().notNull().default(sql`ARRAY['en']::text[]`),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone").notNull().default(""),
    whatsapp: text("whatsapp"),
    address: text("address").notNull().default(""),
    mapsUrl: text("maps_url").notNull().default(""),
    /** The platform administrator chose to list the workshops of this shop on the Workshops page of the customers (only while the shop is ACTIVE). */
    showOnCustomerPage: boolean("show_on_customer_page").notNull().default(false),
    /** The own domain of the shop (D13): the landing page is served there too. One shop for each domain (unique). It counts only once its DNS was checked (`customDomainVerifiedAt`). */
    customDomain: text("custom_domain").unique(),
    customDomainVerifiedAt: timestamp("custom_domain_verified_at", { withTimezone: true }),
    /** The last session number used by the shop: "SES-0007" is 7. Bumped atomically (UPDATE ... RETURNING) so two sessions made at once never get the same code. */
    sessionSeq: integer("session_seq").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("organizations_slug_format", sql`${t.slug} ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$'`),
    check("organizations_default_locale", sql`${t.defaultLocale} IN ('en','vi','ko','ja','zh')`),
    check("organizations_enabled_locales", sql`${t.enabledLocales} <@ ARRAY['en','vi','ko','ja','zh']::text[] AND ${t.defaultLocale} = ANY(${t.enabledLocales})`),
  ],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: memberRole("role").notNull().default("OWNER"),
    status: memberStatus("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] }), index("organization_members_user_idx").on(t.userId)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Hash of the cookie token; the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    activeOrganizationId: uuid("active_organization_id").references(() => organizations.id),
    ip: text("ip"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId), index("auth_sessions_expires_idx").on(t.expiresAt)],
);

export const userTokens = pgTable(
  "user_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: userTokenType("type").notNull(),
    /** Hash of the token sent by email; the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("user_tokens_user_idx").on(t.userId, t.type)],
);
