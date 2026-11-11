import { apiError } from "@/lib/api-error";
import { customerLoginRequired } from "@/lib/customer-access";
import { accountOfGuest, liveCustomers } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { getInviteBonusBps } from "@/lib/mock/fee-rates-store";
import { inviteBonuses, inviteCodeOf, listInvites } from "@/lib/mock/invite-store";
import { shareLink } from "@/lib/mock/share-link";

// The referrals of a customer: the friends they invited to register an account. Every customer has ONE invite link. A friend is a referral once registered through the link; the
// bonus is earned once for each friend, on the first booking the friend pays. MOCK implementation inside Next until apps/api exists. Identified like the rest of /customer/{id}: the
// email of the account in `x-guest-email`. TODO(api): the account of the session.

const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const emailOf = (request: Request): string | null => (customerLoginRequired() ? (request.headers.get("x-guest-email") ?? "") : null);

/** "mai.tran@example.com" -> "m***@example.com": a friend is not shown with their whole email. */
const mask = (email: string): string => { const [user = "", domain = ""] = email.split("@"); return `${user.slice(0, 1)}***@${domain}`; };

/**
 * GET -> { code, link, bonusBps, currency, items, total }. `items`: one for each friend { id, name, email (masked), registeredAt, status: REGISTERED | EARNED, bookingCode?, bonus, paidAt? }.
 * `total` is the bonus earned so far. 404 NOT_FOUND (also for another customer id).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/customer/[id]/invites">) {
  const { id } = await ctx.params;
  if (!accountOfGuest(id, emailOf(request))) return apiError(404, "NOT_FOUND", "Account not found.", {}, headers);
  const people = new Map(liveCustomers().map((c) => [c.id, c]));
  const earned = new Map(inviteBonuses().map((b) => [b.inviteId, b]));
  const items = listInvites().filter((i) => i.inviterId === id).map((i) => {
    const friend = people.get(i.inviteeId);
    const bonus = earned.get(i.id);
    return {
      id: i.id, name: friend?.fullName ?? "", email: mask(friend?.email ?? ""), registeredAt: i.registeredAt, status: bonus ? ("EARNED" as const) : ("REGISTERED" as const),
      bonus: bonus?.amount ?? 0, ...(bonus ? { bookingCode: bonus.bookingCode, paidAt: bonus.paidAt } : {}),
    };
  }).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  const code = inviteCodeOf(id);
  return Response.json({
    code, link: shareLink(currentShop.slug, request, { invite: code }), bonusBps: getInviteBonusBps(currentShop.id), currency: currentShop.currency, items, total: items.reduce((n, i) => n + i.bonus, 0),
  }, { headers });
}
