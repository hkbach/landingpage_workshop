import { apiError } from "@/lib/api-error";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { DEMO_ORG, ownerActor } from "@/lib/mock/audit-actors";
import { publishShop } from "@/lib/mock/shop-admin-store";

// POST /api/v1/site/publish (the shop owner publishes the landing page): there is no admin review. A DRAFT shop becomes ACTIVE at once -> 200 { status: "ACTIVE", changed: true };
// an ACTIVE shop only publishes the page -> 200 { status: "ACTIVE", changed: false }; a SUSPENDED shop -> 403 SUSPENDED. MOCK inside Next until apps/api exists.
// TODO(api): the organization of the session, the checklist checked on the server (identity, hero, contact, one workshop with a session), one transaction with the audit line.
export async function POST() {
  const res = publishShop(DEMO_ORG);
  if (!res.ok) {
    return res.code === "SUSPENDED" ? apiError(403, "SUSPENDED", "This shop is suspended and cannot publish.") : apiError(404, "NOT_FOUND", "Shop not found.");
  }
  recordAudit({ ...ownerActor(), action: "shop.publish", entityType: "Organization", entityId: res.shop.id, organizationId: res.shop.id, details: res.changed ? "first publish: the shop is now ACTIVE" : "landing page published" });
  return Response.json({ status: res.shop.status, changed: res.changed }, { headers: { "cache-control": "no-store" } });
}
