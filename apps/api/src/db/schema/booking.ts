import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { affiliateLinks } from "./affiliate";
import { workshopSessions, workshops } from "./catalog";
import { organizations, users } from "./identity";

// Customers, bookings and payments (REQUIREMENTS 8.5). The composite foreign keys keep every row inside its shop. Money is bigint minor units. A booking keeps a snapshot of the price and of
// the session as they were when it was made (BR-05): the columns that make the snapshot never change (a trigger refuses it).
export const bookingStatus = pgEnum("booking_status", ["NOT_CONFIRMED", "CONFIRMED", "CHECKED_IN", "CANCELLED"]);
export const paymentStatus = pgEnum("payment_status", ["UNPAID", "PAID"]);
export const bookingSource = pgEnum("booking_source", ["ONLINE", "WALK_IN", "PHONE", "OTHER"]);
export const cancelledBy = pgEnum("cancelled_by", ["SHOP", "GUEST"]);
export const paymentType = pgEnum("payment_type", ["PAYMENT", "REVERSAL"]);
export const paymentMethod = pgEnum("payment_method", ["CASH", "CARD", "BANK_TRANSFER", "E_WALLET", "OTHER"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    /** Trim + lowercase (BR-10); null for a walk-in without an email. */
    emailNormalized: text("email_normalized"),
    fullName: text("full_name").notNull(),
    country: text("country").notNull().default(""),
    phone: text("phone").notNull().default(""),
    preferredLocale: text("preferred_locale").notNull().default("en"),
    /** Set when the personal data was erased on request (the row stays, so the bookings keep their numbers). */
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("customers_org_id_unique").on(t.organizationId, t.id),
    uniqueIndex("customers_org_email_unique").on(t.organizationId, t.emailNormalized).where(sql`${t.emailNormalized} IS NOT NULL`),
    check("customers_email_lowercase", sql`${t.emailNormalized} IS NULL OR ${t.emailNormalized} = lower(btrim(${t.emailNormalized}))`),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    /** "<session code>-<3 digits>", for example SES-0003-042: unique in the shop. */
    bookingCode: text("booking_code").notNull(),
    sessionId: uuid("session_id").notNull(),
    workshopId: uuid("workshop_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    source: bookingSource("source").notNull().default("ONLINE"),
    quantity: integer("quantity").notNull(),
    status: bookingStatus("status").notNull().default("NOT_CONFIRMED"),
    paymentStatus: paymentStatus("payment_status").notNull().default("UNPAID"),
    /** The status before a check-in, so an uncheck-in goes back to it. */
    statusBeforeCheckIn: bookingStatus("status_before_check_in"),
    unitPriceAmount: bigint("unit_price_amount", { mode: "number" }).notNull(),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    /** What the promotions took off (a snapshot: a promotion edited or deleted later does not change a past booking, BR-05). */
    discountAmount: bigint("discount_amount", { mode: "number" }).notNull().default(0),
    promotionIds: uuid("promotion_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    /** The affiliate link the guest came through, set when the booking is made (never changed): the Affiliate fee is worked out from it. */
    affiliateLinkId: uuid("affiliate_link_id").references(() => affiliateLinks.id),
    currency: text("currency").notNull(),
    /** What the guest typed when booking: each booking keeps its own name, email, phone and country (the customer keeps the first ones). */
    guestName: text("guest_name").notNull(),
    guestEmail: text("guest_email"),
    guestPhone: text("guest_phone").notNull().default(""),
    guestCountry: text("guest_country").notNull().default(""),
    /** Workshop title by language, the start and end of the session, the time zone and the address as they were when the booking was made. */
    snapshot: jsonb("snapshot").notNull().$type<BookingSnapshot>(),
    locale: text("locale").notNull().default("en"),
    specialRequest: text("special_request"),
    idempotencyKey: text("idempotency_key"),
    cancelReason: text("cancel_reason"),
    cancelledBy: cancelledBy("cancelled_by"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedInBy: uuid("checked_in_by").references(() => users.id),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    statusChangedBy: uuid("status_changed_by").references(() => users.id),
    /** Null for a guest who booked online; the user who made it for a manual booking. */
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ columns: [t.organizationId, t.sessionId], foreignColumns: [workshopSessions.organizationId, workshopSessions.id], name: "bookings_session_fk" }),
    foreignKey({ columns: [t.organizationId, t.workshopId], foreignColumns: [workshops.organizationId, workshops.id], name: "bookings_workshop_fk" }),
    foreignKey({ columns: [t.organizationId, t.customerId], foreignColumns: [customers.organizationId, customers.id], name: "bookings_customer_fk" }),
    unique("bookings_org_id_unique").on(t.organizationId, t.id),
    unique("bookings_org_code_unique").on(t.organizationId, t.bookingCode),
    unique("bookings_org_idempotency_unique").on(t.organizationId, t.idempotencyKey),
    check("bookings_quantity", sql`${t.quantity} BETWEEN 1 AND 50`),
    check("bookings_amounts", sql`${t.unitPriceAmount} >= 0 AND ${t.totalAmount} >= 0 AND ${t.discountAmount} >= 0`),
    check("bookings_code_format", sql`${t.bookingCode} ~ '^SES-[0-9]{4,}-[0-9]{3,}$'`),
    index("bookings_org_session_status_idx").on(t.organizationId, t.sessionId, t.status),
    index("bookings_org_created_idx").on(t.organizationId, t.createdAt.desc()),
    index("bookings_org_customer_idx").on(t.organizationId, t.customerId),
  ],
);

export interface BookingSnapshot {
  workshopTitle: Record<string, string>;
  sessionCode: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  address: string;
  /** What the promotions took off, line by line (the code or title of each one). */
  discounts?: { code: string; amount: number; promotionId?: string }[];
  subtotalAmount?: number;
}

/** Append only (a trigger refuses UPDATE and DELETE): money that was taken in is never edited; a mistake is put right with a REVERSAL, which is not a refund (REQUIREMENTS 8.5). */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    bookingId: uuid("booking_id").notNull(),
    type: paymentType("type").notNull(),
    /** Always positive; the type says the direction. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    method: paymentMethod("method").notNull(),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.organizationId, t.bookingId], foreignColumns: [bookings.organizationId, bookings.id], name: "payments_booking_fk" }),
    check("payments_amount", sql`${t.amount} > 0`),
    index("payments_org_booking_idx").on(t.organizationId, t.bookingId),
    index("payments_org_recorded_idx").on(t.organizationId, t.recordedAt.desc()),
  ],
);

/** The link of the confirmation email: stored as a hash, valid for a time, used once (BR-12). */
export const bookingConfirmations = pgTable(
  "booking_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    bookingId: uuid("booking_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [foreignKey({ columns: [t.organizationId, t.bookingId], foreignColumns: [bookings.organizationId, bookings.id], name: "booking_confirmations_booking_fk" }), index("booking_confirmations_booking_idx").on(t.organizationId, t.bookingId)],
);

/** The 6-digit code sent to the guest before a booking is made (step 5 of the booking form): only its hash is kept, with an expiry and a count of tries. */
export const bookingOtps = pgTable(
  "booking_otps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("booking_otps_lookup_idx").on(t.organizationId, t.email, t.createdAt.desc())],
);
