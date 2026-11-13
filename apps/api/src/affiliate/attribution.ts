import { and, eq } from "drizzle-orm";
import type { Executor } from "../db/db.module";
import { affiliateLinks, inviteLinks, referrals, users } from "../db/schema";
import { AFFILIATE_CODE_RE, INVITE_CODE_RE } from "./codes";

// Used by the booking and by the signup, inside their transaction. No service, no injection: a plain function of the executor.

/**
 * The affiliate link a booking counts for, or null. The code must be a real one, of THIS workshop, not switched off, of an account that can earn, and the booking must not be the one of the
 * person who shared it (their email): a wrong code never fails the booking, it is simply not counted (FR-CUST-02).
 */
export async function affiliateLinkFor(executor: Executor, input: { code: string | undefined; organizationId: string; workshopId: string; guestEmail: string }): Promise<string | null> {
  if (!input.code || !AFFILIATE_CODE_RE.test(input.code)) return null;
  const [row] = await executor.select({ id: affiliateLinks.id, ownerEmail: users.email, ownerStatus: users.status, disabled: affiliateLinks.disabled })
    .from(affiliateLinks).innerJoin(users, eq(users.id, affiliateLinks.userId))
    .where(and(eq(affiliateLinks.code, input.code), eq(affiliateLinks.organizationId, input.organizationId), eq(affiliateLinks.workshopId, input.workshopId))).limit(1);
  if (!row || row.disabled || row.ownerStatus === "DISABLED") return null;
  return row.ownerEmail === input.guestEmail.trim().toLowerCase() ? null : row.id;
}

/** A friend who registered with an invite code becomes a referral of its owner. A wrong or switched off code is ignored (the account is made all the same, and nothing says why). */
export async function registerInvite(executor: Executor, input: { friendUserId: string; code: string | undefined }): Promise<boolean> {
  if (!input.code || !INVITE_CODE_RE.test(input.code)) return false;
  const [link] = await executor.select({ userId: inviteLinks.userId, disabled: inviteLinks.disabled }).from(inviteLinks).where(eq(inviteLinks.code, input.code)).limit(1);
  if (!link || link.disabled || link.userId === input.friendUserId) return false;
  const made = await executor.insert(referrals).values({ inviterUserId: link.userId, friendUserId: input.friendUserId }).onConflictDoNothing().returning({ id: referrals.id });
  return made.length > 0;
}

