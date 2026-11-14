import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { workshops } from "./catalog";
import { users } from "./identity";

// The affiliate links of a workshop and the invite links of a customer, and the friends who registered with an invite (FR-CUST-02, FR-CUST-03, FR-ADM-15, FR-ADM-18). The money is not stored here:
// the fee of a link and the bonus of a friend are worked out from the bookings as they are now (the wallet and the finance screens read them), so a booking put back to unpaid stops counting.

/** One link for each account and workshop: `?ref=CODE&book=WORKSHOP_ID` on the landing page of the shop. */
export const affiliateLinks = pgTable(
  "affiliate_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    organizationId: uuid("organization_id").notNull(),
    workshopId: uuid("workshop_id").notNull(),
    /** "A" and 8 characters (no 0, O, 1, I, L): unique on the whole platform. */
    code: text("code").notNull().unique(),
    /** Visits that opened the link (the landing page counts one for each visit). */
    clicks: integer("clicks").notNull().default(0),
    /** An administrator switched it off (a reason is kept): the link no longer counts new bookings, what it earned stays. */
    disabled: boolean("disabled").notNull().default(false),
    disabledReason: text("disabled_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.organizationId, t.workshopId], foreignColumns: [workshops.organizationId, workshops.id], name: "affiliate_links_workshop_fk" }),
    unique("affiliate_links_user_workshop_unique").on(t.userId, t.workshopId),
    check("affiliate_links_code", sql`${t.code} ~ '^A[A-Z0-9]{8}$'`),
    check("affiliate_links_clicks", sql`${t.clicks} >= 0`),
    index("affiliate_links_user_idx").on(t.userId),
    index("affiliate_links_workshop_idx").on(t.organizationId, t.workshopId),
    index("affiliate_links_created_idx").on(t.createdAt, t.id), // the list of the administrator, newest first
  ],
);

/** The one invite link of an account, made the first time it is asked for and never changed: `?invite=CODE`. */
export const inviteLinks = pgTable(
  "invite_links",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id),
    /** "I" and 8 characters. */
    code: text("code").notNull().unique(),
    disabled: boolean("disabled").notNull().default(false),
    disabledReason: text("disabled_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("invite_links_code", sql`${t.code} ~ '^I[A-Z0-9]{8}$'`)],
);

/** A friend who registered with the invite link of an account. A friend belongs to one inviter only (unique) and nobody invites themselves. */
export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviterUserId: uuid("inviter_user_id").notNull().references(() => users.id),
    friendUserId: uuid("friend_user_id").notNull().unique().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("referrals_not_self", sql`${t.inviterUserId} <> ${t.friendUserId}`), index("referrals_inviter_idx").on(t.inviterUserId, t.createdAt)],
);
