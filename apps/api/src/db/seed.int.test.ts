import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPassword } from "../auth/crypto";
import { TEST_DATABASE_URL } from "../test/helpers";
import type { Executor } from "./db.module";
import { DEMO_ACCOUNTS, seed } from "./seed";
import * as schema from "./schema";

const d = describe.skipIf(!TEST_DATABASE_URL);

class Rollback extends Error {}
const PASSWORD = "A-demo-password-2026";

d("the demo seed", () => {
  let pool: Pool;
  beforeAll(() => { pool = new Pool({ connectionString: TEST_DATABASE_URL }); });
  afterAll(async () => { await pool.end(); });

  /** Runs `fn` in a transaction that is always rolled back (the test database stays as it was). */
  async function rolledBack(fn: (tx: Executor) => Promise<void>): Promise<void> {
    await drizzle(pool, { schema }).transaction(async (tx) => { await fn(tx); throw new Rollback(); }).catch((e: unknown) => { if (!(e instanceof Rollback)) throw e; });
  }

  it("creates the admin, an ACTIVE shop, a DRAFT shop and a customer with the password given, and can run again", async () => {
    await rolledBack(async (tx) => {
      const first = await seed(tx, PASSWORD);
      expect(first.created.length + first.existing.length).toBe(Object.keys(DEMO_ACCOUNTS).length);
      const again = await seed(tx, PASSWORD);
      expect(again.created).toEqual([]);
      expect(again.existing).toHaveLength(Object.keys(DEMO_ACCOUNTS).length);

      const [admin] = await tx.select().from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS.admin));
      expect(admin!.platformRole).toBe("SUPER_ADMIN");
      expect(admin!.passwordHash).toMatch(/^\$argon2id\$/);
      expect(admin!.passwordHash).not.toContain(PASSWORD);
      if (first.created.includes(DEMO_ACCOUNTS.admin)) expect(await verifyPassword(admin!.passwordHash, PASSWORD)).toBe(true);

      const orgs = await tx.select({ slug: schema.organizations.slug, status: schema.organizations.status }).from(schema.organizations).where(inArray(schema.organizations.slug, ["whiskladle", "sugarsift"]));
      expect(orgs.map((o) => [o.slug, o.status]).sort()).toEqual([["sugarsift", "DRAFT"], ["whiskladle", "ACTIVE"]]);
    });
  });
});
