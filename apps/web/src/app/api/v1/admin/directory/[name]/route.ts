import { apiError } from "@/lib/api-error";
import { adminAffiliate, adminAuditRows, adminEmails, adminMedia, adminMessages, adminVouchers, adminBookings, adminCustomers, adminLandingPages, adminReferralLinks, adminSessions, adminShops, adminUsers, adminWithdrawals, adminWorkshops } from "@/lib/mock/admin-directory";

// The lists of the system admin area: GET /api/v1/admin/directory/{users|shops|workshops|bookings|customers|sessions|landing-pages|affiliate|referrals|withdrawals|audit-logs}?q=... (audit-logs: email, org, action, entity, role instead of q)
// Filters: q (the search typed), type / status (users, shops, sessions), shopId (workshops, sessions), from / to ("YYYY-MM-DD": bookings, affiliate and referrals). MOCK implementation
// inside Next until apps/api exists. TODO(api): SUPER_ADMIN only; page and pageSize; the audit log of the reads of personal data.

const NAMES = ["users", "shops", "workshops", "bookings", "customers", "sessions", "landing-pages", "affiliate", "referrals", "withdrawals", "audit-logs", "messages", "emails", "promotions", "media"] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request, ctx: RouteContext<"/api/v1/admin/directory/[name]">) {
  const { name } = await ctx.params;
  if (!(NAMES as readonly string[]).includes(name)) return apiError(404, "NOT_FOUND", "Unknown list.");
  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").slice(0, 200);
  const get = (k: string) => sp.get(k) ?? "";
  const from = get("from"), to = get("to");
  if ((from && !DAY.test(from)) || (to && !DAY.test(to))) return apiError(422, "VALIDATION", "Dates are YYYY-MM-DD.", { fields: { [from && !DAY.test(from) ? "from" : "to"]: "invalid" } });
  if (from && to && from > to) return apiError(422, "VALIDATION", "From is after To.", { fields: { to: "order" } });
  const items =
    name === "users" ? adminUsers(q, get("type"), get("status"))
    : name === "shops" ? adminShops(q, get("status"))
    : name === "workshops" ? adminWorkshops(q, get("shopId"))
    : name === "bookings" ? adminBookings(q, from, to)
    : name === "customers" ? adminCustomers(q)
    : name === "sessions" ? adminSessions(q, get("status"), get("shopId"))
    : name === "affiliate" ? adminAffiliate(q, from, to)
    : name === "referrals" ? adminReferralLinks(q, from, to)
    : name === "withdrawals" ? adminWithdrawals(q, get("status"), from, to, get("source"))
    : name === "messages" ? adminMessages(q, get("status"), get("topic"))
    : name === "media" ? adminMedia(q, get("kind"), get("source"))
    : name === "promotions" ? adminVouchers(q, get("status"))
    : name === "emails" ? adminEmails(q, get("type"), get("status"))
    : name === "audit-logs" ? adminAuditRows({ email: get("email").slice(0, 200), org: get("org").slice(0, 200), action: get("action"), entity: get("entity"), role: get("role"), from, to })
    : adminLandingPages(q);
  return Response.json({ items }, { headers: { "cache-control": "no-store" } });
}
