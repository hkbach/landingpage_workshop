import { eq, inArray, sql } from "drizzle-orm";
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

  it("makes the accounts, three shops in three states and a believable history, and can run again", async () => {
    await rolledBack(async (tx) => {
      const first = await seed(tx, PASSWORD);
      expect(first.created.length + first.existing.length).toBeGreaterThanOrEqual(Object.keys(DEMO_ACCOUNTS).length);
      const again = await seed(tx, PASSWORD);
      expect(again.created).toEqual([]); // a second run makes nothing
      expect(again.sessions).toBe(0);
      expect(again.bookings).toBe(0);

      const [admin] = await tx.select().from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS.admin));
      expect(admin!.platformRole).toBe("SUPER_ADMIN");
      expect(admin!.passwordHash).toMatch(/^\$argon2id\$/);
      expect(admin!.passwordHash).not.toContain(PASSWORD);
      if (first.created.includes(DEMO_ACCOUNTS.admin)) expect(await verifyPassword(admin!.passwordHash, PASSWORD)).toBe(true);

      const orgs = await tx.select({ slug: schema.organizations.slug, status: schema.organizations.status }).from(schema.organizations).where(inArray(schema.organizations.slug, ["whiskladle", "sugarsift", "goldennoodle"]));
      expect(orgs.map((o) => [o.slug, o.status]).sort()).toEqual([["goldennoodle", "SUSPENDED"], ["sugarsift", "DRAFT"], ["whiskladle", "ACTIVE"]]);
      // nine shops in all, with a landing page in every one that is meant to have one
      const all = await tx.select({ slug: schema.organizations.slug }).from(schema.organizations);
      expect(all.length).toBeGreaterThanOrEqual(9);
      const pages = await tx.select({ slug: schema.organizations.slug }).from(schema.sitePages).innerJoin(schema.organizations, eq(schema.organizations.id, schema.sitePages.organizationId)).where(eq(schema.sitePages.isLive, true));
      expect(pages.map((p) => p.slug)).not.toContain("quietcorner");
      expect(pages.map((p) => p.slug)).toContain("whiskladle");

      if (first.created.includes(DEMO_ACCOUNTS.activeOwner)) {
        expect(first.sessions).toBeGreaterThan(30);
        expect(first.bookings).toBeGreaterThan(80);
        expect(first.payments).toBeGreaterThan(20);
        const [org] = await tx.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, "whiskladle"));

        // the books agree: the seats of every session are what its bookings hold, within the capacity, and the codes are unique
        const sessions = await tx.execute(sql`
          select s.id, s.capacity, s.reserved_count, s.booking_seq,
                 coalesce(sum(b.quantity) filter (where b.status <> 'CANCELLED'), 0)::int as held, count(b.id)::int as n
          from workshop_sessions s left join bookings b on b.session_id = s.id and b.organization_id = s.organization_id
          where s.organization_id = ${org!.id} group by s.id`);
        const rows = sessions.rows as { capacity: number; reserved_count: number; held: number; n: number; booking_seq: number }[];
        expect(rows.length).toBeGreaterThan(60);
        expect(rows.length).toBeLessThan(first.sessions); // the suspended shop has sessions of its own
        for (const r of rows) {
          expect(r.reserved_count).toBe(r.held);
          expect(r.reserved_count).toBeLessThanOrEqual(r.capacity);
          expect(r.booking_seq).toBe(r.n);
        }
        const codes = await tx.execute(sql`select count(*)::int as total, count(distinct booking_code)::int as distinct_codes from bookings where organization_id = ${org!.id}`);
        expect((codes.rows[0] as { total: number; distinct_codes: number }).total).toBe((codes.rows[0] as { distinct_codes: number }).distinct_codes);

        // every state is there, and every payment belongs to a booking that is paid for exactly its total
        const statuses = await tx.execute(sql`select status, count(*)::int as n from bookings where organization_id = ${org!.id} group by status`);
        expect((statuses.rows as { status: string }[]).map((r) => r.status).sort()).toEqual(["CANCELLED", "CHECKED_IN", "CONFIRMED", "NOT_CONFIRMED"]);
        const mismatch = await tx.execute(sql`
          select count(*)::int as n from bookings b
          where b.organization_id = ${org!.id} and b.payment_status = 'PAID'
            and b.total_amount <> coalesce((select sum(case when p.type = 'PAYMENT' then p.amount else -p.amount end) from payments p where p.booking_id = b.id), 0)`);
        expect((mismatch.rows[0] as { n: number }).n).toBe(0);
        const kinds = await tx.execute(sql`select distinct status from workshop_sessions where organization_id = ${org!.id}`);
        expect((kinds.rows as { status: string }[]).map((r) => r.status)).toEqual(expect.arrayContaining(["RUNNING", "OPEN", "CLOSED", "COMPLETED"]));
      }
    });
  });
});
