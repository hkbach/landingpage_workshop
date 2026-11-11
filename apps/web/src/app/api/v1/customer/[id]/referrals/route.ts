import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { customerLoginRequired } from "@/lib/customer-access";
import { workshopsWithShop } from "@/lib/mock/admin-directory";
import { referralEarnings } from "@/lib/mock/admin-income";
import { accountOfGuest } from "@/lib/mock/booking-store";
import { getReferralBps } from "@/lib/mock/fee-rates-store";
import { createReferral, listReferrals } from "@/lib/mock/referral-store";
import { shareLink } from "@/lib/mock/share-link";
import { liveShops } from "@/lib/mock/shop-admin-store";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { customerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// The referral (affiliate) links of a customer: they pick a workshop and share the link; a booking that comes through it earns them a referral fee. MOCK implementation
// inside Next until apps/api exists. Identified like the rest of /customer/{id}: the email of the account in `x-guest-email`. TODO(api): the account of the session.

const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const emailOf = (request: Request): string | null => (customerLoginRequired() ? (request.headers.get("x-guest-email") ?? "") : null);
const notFound = () => apiError(404, "NOT_FOUND", "Account not found.", {}, headers);
const titleOf = (l: Record<string, string | undefined>): string => l.en ?? Object.values(l).find(Boolean) ?? "";
const bodySchema = z.object({ workshopId: z.string().min(1, "required").max(100, "invalid") });

/**
 * The link as the customer shares it: the landing page of the shop with `?ref=CODE&book=WORKSHOP`. It opens the booking of that workshop at once, and the booking made
 * through it is the link's (the port of the server is kept in development).
 */
function linkOf(slug: string, code: string, workshopId: string, request: Request): string {
  return shareLink(slug, request, { ref: code, book: workshopId });
}

function view(request: Request, accountId: string) {
  const ws = new Map(workshopsWithShop().map((x) => [x.workshop.id, x]));
  const earned = referralEarnings();
  return listReferrals().filter((r) => r.accountId === accountId).flatMap((r) => {
    const w = ws.get(r.workshopId);
    const e = earned.get(r.id) ?? { bookings: 0, fee: 0 };
    return w ? [{
      id: r.id, code: r.code, workshopId: r.workshopId, workshopTitle: titleOf(w.workshop.title), shopName: w.shop.name, link: linkOf(w.shop.slug, r.code, r.workshopId, request), createdAt: r.createdAt, clicks: r.clicks,
      // What the customer earns: the referral rate of the shop x the original price of the paid bookings that came through the link.
      referralBps: getReferralBps(w.shop.id), bookings: e.bookings, referralFee: e.fee, currency: w.shop.currency,
      // ON_GOING while the workshop and its shop are active; DEACTIVE once the workshop was deactivated (or its shop): the link stays in the list but no longer leads to a booking.
      status: w.workshop.status === "ACTIVE" && w.shop.status === "ACTIVE" ? "ON_GOING" as const : "DEACTIVE" as const,
    }] : [];
  });
}

/** GET -> { items }: the links of the customer. 404 NOT_FOUND. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/customer/[id]/referrals">) {
  const { id } = await ctx.params;
  if (!accountOfGuest(id, emailOf(request))) return notFound();
  // The affiliate fee of every shop (basis points of the original price of a booking), so the page can say what a workshop would earn before the guest registers for it.
  const rates = Object.fromEntries(liveShops().map((s) => [s.id, getReferralBps(s.id)]));
  return Response.json({ items: view(request, id), rates, shopOfWorkshop: Object.fromEntries(workshopsWithShop().map((x) => [x.workshop.id, x.shop.id])) }, { headers });
}

/** POST { workshopId } -> 201 (a new link) or 200 (the link they already had): { id, code, link, ... }. 404 NOT_FOUND, 404 NO_WORKSHOP, 409 SHOP_INACTIVE, 422 with `fields`. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/customer/[id]/referrals">) {
  const { id } = await ctx.params;
  if (!accountOfGuest(id, emailOf(request))) return notFound();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.", {}, headers);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) }, headers);
  const res = createReferral(id, parsed.data.workshopId);
  if (!res.ok) return res.code === "SHOP_INACTIVE" || res.code === "WORKSHOP_INACTIVE" ? apiError(409, res.code, "This workshop is not active.", {}, headers) : apiError(404, res.code === "NO_WORKSHOP" ? "NO_WORKSHOP" : "NOT_FOUND", "Not found.", {}, headers);
  if (res.created) recordAudit({ ...customerActor(id), action: "affiliate.register", entityType: "AffiliateLink", entityId: res.referral.id, organizationId: DEMO_ORG, details: `workshop ${parsed.data.workshopId}` });
  const mine = view(request, id).find((x) => x.id === res.referral.id)!;
  return Response.json(mine, { status: res.created ? 201 : 200, headers });
}
