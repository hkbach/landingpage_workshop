import { eq } from "drizzle-orm";
import type { Executor } from "../db/db.module";
import { organizations, walletCredits } from "../db/schema";
import { affiliateRows, referralBonuses } from "./earnings";

/**
 * Turns what the affiliate and the referral programs earned in the CLOSED months of a shop into credits of the wallet (D11, D24): one row for each account, source, currency and month, written
 * once. From then on the money is frozen: the row is never changed, a booking put back to unpaid or cancelled afterwards no longer touches it, and it can be withdrawn. Safe to run again and
 * again (a row that exists is skipped); a figure that shows up in a month that is already settled is not added, because a settled month does not change.
 * Returns how many credits were written.
 */
export async function settleCredits(executor: Executor, organizationId: string): Promise<number> {
  const [shop] = await executor.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!shop) return 0;
  const sums = new Map<string, { userId: string; source: "AFFILIATE" | "REFERRAL"; currency: string; month: string; amount: number }>();
  const add = (userId: string, source: "AFFILIATE" | "REFERRAL", currency: string, month: string, amount: number) => {
    const key = `${userId}|${source}|${currency}|${month}`;
    const row = sums.get(key) ?? { userId, source, currency, month, amount: 0 };
    row.amount += amount;
    sums.set(key, row);
  };
  for (const e of await affiliateRows(executor, { organizationId })) if (e.closed) add(e.userId, "AFFILIATE", e.currency, e.month, e.fee);
  for (const b of await referralBonuses(executor, { organizationId })) if (b.closed) add(b.inviterUserId, "REFERRAL", b.currency, b.month, b.bonus);
  let written = 0;
  for (const s of sums.values()) {
    if (s.amount <= 0) continue;
    const made = await executor.insert(walletCredits).values({
      userId: s.userId, source: s.source, currency: s.currency, amount: s.amount, organizationId, month: s.month,
      note: `${s.source === "AFFILIATE" ? "Affiliate fees" : "Referral bonuses"} of ${shop.name}, ${s.month}`,
    }).onConflictDoNothing().returning({ id: walletCredits.id });
    written += made.length;
  }
  return written;
}
