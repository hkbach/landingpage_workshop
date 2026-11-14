import { desc, sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { outboxStatus } from "./enums";
import { organizations, users } from "./identity";

// The system tables of REQUIREMENTS 8.6.

/** Append only (a trigger refuses UPDATE and DELETE). `organization_id` is null for an action of the platform. No secret ever goes in `before` or `after`. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    /** Null for the system itself (a timer, a worker). */
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_org_created_idx").on(t.organizationId, desc(t.createdAt), desc(t.id)),
    index("audit_logs_actor_idx").on(t.actorUserId, desc(t.createdAt)),
    // the audit log of the whole platform (newest first) and the History tabs of the admin screens (one kind of record, newest first): the order of the query is the order of the index
    index("audit_logs_created_idx").on(desc(t.createdAt), desc(t.id)),
    index("audit_logs_entity_created_idx").on(t.entityType, desc(t.createdAt), desc(t.id)),
  ],
);

/** Written in the same transaction as the change that needs an email or another effect; a worker dispatches it. */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    status: outboxStatus("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** For an EMAIL: who it is for (lowercase), which template made it and the subject that was sent. Kept 90 days for the list of the administrator (the content is never kept, except an email an administrator wrote). */
    recipient: text("recipient"),
    template: text("template"),
    subject: text("subject"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outbox_events_dispatch_idx").on(t.status, t.availableAt),
    index("outbox_events_email_created_idx").on(t.createdAt, t.id).where(sql`${t.type} = 'EMAIL'`), // the Emails page of the administrator
  ],
);
