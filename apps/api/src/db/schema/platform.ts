import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity";

// What the platform administrator keeps and handles (FR-ADM-04, FR-ADM-07, FR-ADM-20 to FR-ADM-23): the settings, the support channels, the messages of the Contact form, the reports of a site and
// the Terms and Privacy. Personal data here (the name and the email of a sender) is shown only to the platform administrator and is never written to the audit log.

export const messageStatus = pgEnum("message_status", ["NEW", "IN_PROGRESS", "DONE"]);
export const reportStatus = pgEnum("report_status", ["OPEN", "RESOLVED", "DISMISSED"]);

/** One row for each group of values of the platform: `settings` (the numbers of FR-ADM-20) and `support_contact` (the four channels of FR-ADM-07). */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

/** A message sent from the Contact form of the public site. The internal note is for the administrators only and is never sent to the sender. Deleted on request (personal data). */
export const contactMessages = pgTable(
  "contact_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Lowercase. */
    email: text("email").notNull(),
    topic: text("topic").notNull(),
    message: text("message").notNull(),
    status: messageStatus("status").notNull().default("NEW"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("contact_messages_topic", sql`${t.topic} IN ('general', 'demo', 'support', 'partnership')`),
    check("contact_messages_sizes", sql`char_length(${t.name}) <= 120 AND char_length(${t.message}) <= 2000 AND char_length(${t.note}) <= 2000`),
    index("contact_messages_created_idx").on(t.createdAt),
  ],
);

/** "Report this site": a traveller tells the platform a landing page is a scam, a phishing page, inappropriate or something else. It is OPEN until an administrator resolves or dismisses it, once. */
export const siteReports = pgTable(
  "site_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    reason: text("reason").notNull(),
    description: text("description").notNull(),
    reporterEmail: text("reporter_email"),
    status: reportStatus("status").notNull().default("OPEN"),
    note: text("note"),
    handledBy: uuid("handled_by").references(() => users.id),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("site_reports_reason", sql`${t.reason} IN ('SCAM', 'PHISHING', 'INAPPROPRIATE', 'OTHER')`),
    check("site_reports_sizes", sql`char_length(${t.description}) <= 2000 AND (${t.note} IS NULL OR char_length(${t.note}) <= 500)`),
    check("site_reports_handled", sql`(${t.status} = 'OPEN') = (${t.handledAt} IS NULL)`),
    index("site_reports_status_idx").on(t.status, t.createdAt),
    index("site_reports_org_idx").on(t.organizationId, t.createdAt),
  ],
);

/** The Terms of Service and the Privacy Policy, one row for each document and language, as plain text. The version goes up by one at every change. */
export const legalDocuments = pgTable(
  "legal_documents",
  {
    kind: text("kind").notNull(),
    locale: text("locale").notNull(),
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.kind, t.locale] }), check("legal_documents_kind", sql`${t.kind} IN ('terms', 'privacy')`), check("legal_documents_content", sql`char_length(${t.content}) BETWEEN 1 AND 50000`)],
);
