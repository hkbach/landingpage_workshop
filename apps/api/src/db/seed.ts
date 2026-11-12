import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hashPassword } from "../auth/crypto";
import { loadDotEnv } from "../config/env";
import type { Database, Executor } from "./db.module";
import * as schema from "./schema";

// Demo data for development (REQUIREMENTS 11.2): one platform administrator, a shop that is ACTIVE and one that is still a DRAFT, and a customer. Run with `pnpm db:seed`.
// The password of every demo account is NOT in the code: set SEED_PASSWORD (in apps/api/.env or the environment) before running, and use a password you choose. The seed can be run again:
// accounts that exist are left as they are.
export const DEMO_ACCOUNTS = {
  admin: "admin@workshopkit.example",
  activeOwner: "linh@whiskladle.example",
  draftOwner: "ava@sugarsift.example",
  customer: "emma@example.com",
} as const;

export interface SeedResult { created: string[]; existing: string[] }

export async function seed(db: Executor, password: string): Promise<SeedResult> {
  const passwordHash = await hashPassword(password);
  const result: SeedResult = { created: [], existing: [] };

  async function user(email: string, fullName: string, platformRole: "SUPER_ADMIN" | null = null): Promise<{ id: string; isNew: boolean }> {
    const [found] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (found) { result.existing.push(email); return { id: found.id, isNew: false }; }
    const [row] = await db.insert(schema.users).values({ email, passwordHash, fullName, status: "ACTIVE", platformRole, emailVerifiedAt: new Date() }).returning({ id: schema.users.id });
    result.created.push(email);
    return { id: row!.id, isNew: true };
  }

  async function shop(owner: { id: string; isNew: boolean }, input: { name: string; slug: string; status: "ACTIVE" | "DRAFT"; contactEmail: string }): Promise<void> {
    if (!owner.isNew) return;
    const [org] = await db.insert(schema.organizations).values({ ...input, country: "VN", timezone: "Asia/Ho_Chi_Minh", currency: "VND", defaultLocale: "en", enabledLocales: ["en", "vi"], contactPhone: "+84 28 0000 0000", address: "12 Nguyen Hue, District 1, Ho Chi Minh City" }).returning({ id: schema.organizations.id });
    await db.insert(schema.organizationMembers).values({ organizationId: org!.id, userId: owner.id, role: "OWNER" });
    await db.insert(schema.auditLogs).values({ organizationId: org!.id, actorUserId: owner.id, action: "organization.create", entityType: "organization", entityId: org!.id, after: { slug: input.slug, status: input.status } });
  }

  await user(DEMO_ACCOUNTS.admin, "Platform Admin", "SUPER_ADMIN");
  await shop(await user(DEMO_ACCOUNTS.activeOwner, "Linh Tran"), { name: "Whisk & Ladle Kitchen", slug: "whiskladle", status: "ACTIVE", contactEmail: DEMO_ACCOUNTS.activeOwner });
  await shop(await user(DEMO_ACCOUNTS.draftOwner, "Ava Nguyen"), { name: "Sugar & Sift Bakery", slug: "sugarsift", status: "DRAFT", contactEmail: DEMO_ACCOUNTS.draftOwner });
  await user(DEMO_ACCOUNTS.customer, "Emma Wilson");
  return result;
}

async function main(): Promise<void> {
  loadDotEnv();
  const password = process.env.SEED_PASSWORD;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  if (!password || password.length < 10) throw new Error("Set SEED_PASSWORD (at least 10 characters, chosen by you) before running the seed.");
  const pool = new Pool({ connectionString: url });
  try {
    const db = drizzle(pool, { schema }) as Database;
    const result = await db.transaction((tx) => seed(tx, password));
    console.log(`Seed done: ${result.created.length} created, ${result.existing.length} already there.`);
  } finally {
    await pool.end();
  }
}

// Run only when this file is the entry point (not when a test imports it).
if (import.meta.url === new URL(process.argv[1] ?? "", "file://").href || process.argv[1]?.endsWith("seed.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "The seed failed.");
    process.exit(1);
  });
}
