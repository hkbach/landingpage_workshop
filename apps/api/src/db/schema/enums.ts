import { pgEnum } from "drizzle-orm/pg-core";

// REQUIREMENTS 8.1 and 8.6.
export const userStatus = pgEnum("user_status", ["UNVERIFIED", "ACTIVE", "DISABLED"]);
export const platformRole = pgEnum("platform_role", ["SUPER_ADMIN"]);
export const userTokenType = pgEnum("user_token_type", ["EMAIL_VERIFY", "PASSWORD_RESET"]);
export const orgStatus = pgEnum("org_status", ["DRAFT", "ACTIVE", "SUSPENDED"]);
export const memberRole = pgEnum("member_role", ["OWNER"]);
export const memberStatus = pgEnum("member_status", ["ACTIVE", "DISABLED"]);
export const outboxStatus = pgEnum("outbox_status", ["PENDING", "DISPATCHED", "FAILED"]);
