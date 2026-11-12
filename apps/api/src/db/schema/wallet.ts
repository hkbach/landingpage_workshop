import { sql } from "drizzle-orm";
import { bigint, check, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

// The wallet of a customer account and the withdrawal requests (FR-CUST-04, FR-ADM-19, D6, D12, D22). The account is platform wide (not a shop's customer), money is bigint minor units, one
// wallet for each currency. The system never moves money: an administrator pays the invoice outside it and marks it as paid.
export const walletSource = pgEnum("wallet_source", ["AFFILIATE", "REFERRAL"]);
export const withdrawalStatus = pgEnum("withdrawal_status", ["PENDING", "PAID", "REJECTED"]);

/** What an account has earned, one row for each credit (append only: a trigger refuses UPDATE and DELETE). The affiliate and referral programs write here when a fee or a bonus is earned. */
export const walletCredits = pgTable(
  "wallet_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    source: walletSource("source").notNull(),
    currency: text("currency").notNull(),
    /** Always positive. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    /** What it was earned for (a booking code, a friend): shown to the customer, never a secret. */
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("wallet_credits_amount", sql`${t.amount} > 0`), index("wallet_credits_user_idx").on(t.userId, t.source, t.currency)],
);

/** An invoice WD-0001... asked by the customer. Pending until an administrator pays or rejects it (once: a trigger keeps a processed one as it is). */
export const withdrawals = pgTable(
  "withdrawals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "WD-0001": from a database sequence, so two requests at the same time never share a number. */
    number: text("number").notNull().unique(),
    userId: uuid("user_id").notNull().references(() => users.id),
    source: walletSource("source").notNull(),
    currency: text("currency").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    status: withdrawalStatus("status").notNull().default("PENDING"),
    /** Why it was rejected (the customer sees it). */
    reason: text("reason"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processedBy: uuid("processed_by").references(() => users.id),
  },
  (t) => [
    check("withdrawals_amount", sql`${t.amount} > 0`),
    check("withdrawals_processed", sql`(${t.status} = 'PENDING') = (${t.processedAt} IS NULL)`),
    index("withdrawals_user_idx").on(t.userId, t.source, t.currency),
    index("withdrawals_status_idx").on(t.status, t.requestedAt),
  ],
);

/** The most a customer can ask for in one request, for each currency (D12); 0 means no limit. */
export const withdrawalLimits = pgTable(
  "withdrawal_limits",
  {
    currency: text("currency").primaryKey(),
    minAmount: bigint("min_amount", { mode: "number" }).notNull().default(0),
    maxAmount: bigint("max_amount", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => [check("withdrawal_limits_range", sql`${t.minAmount} >= 0 AND ${t.maxAmount} >= 0 AND (${t.maxAmount} = 0 OR ${t.maxAmount} >= ${t.minAmount})`), check("withdrawal_limits_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`)],
);
