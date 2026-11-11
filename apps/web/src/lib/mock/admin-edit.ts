// SERVER-ONLY: an administrator who edits a shop in the admin area (landing page, workshops, sessions) must give a REASON, and the shop owner is told by email. The banner of the admin shop pages keeps the
// reason in a cookie that the same routes the shop owner uses read (the pages are shared, so the routes are too). Nothing here is a secret, and it is never logged beyond the audit line.
// TODO(api): the reason travels in the body or a header of the admin endpoints, the role comes from the session, and the email is queued in the same transaction as the change.
import { apiError } from "@/lib/api-error";
import { findAccount } from "./accounts-store";
import { currentShop } from "./data";
import { sendAdminEmail } from "./outbox-store";
import { ADMIN_EMAIL, recordAdminAction } from "./admin-audit-store";
import { isAdminRequest } from "./audit-actors";
import { ADMIN_REASON_COOKIE, MAX_ADMIN_REASON } from "../admin-edit-reason";

export { ADMIN_REASON_COOKIE, MAX_ADMIN_REASON };

/** The reason the administrator typed (trimmed, at most 300 characters), or "" when there is none. */
export function adminEditReason(request?: Request): string {
  const cookie = request?.headers.get("cookie") ?? "";
  const part = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${ADMIN_REASON_COOKIE}=`));
  if (!part) return "";
  try {
    return decodeURIComponent(part.slice(ADMIN_REASON_COOKIE.length + 1)).trim().slice(0, MAX_ADMIN_REASON);
  } catch {
    return "";
  }
}

/** Null for the shop owner, and for an administrator who gave a reason; otherwise the 422 the route returns (the change is not made). */
export function adminEditGate(request?: Request): Response | null {
  if (!isAdminRequest(request) || adminEditReason(request)) return null;
  return apiError(422, "ADMIN_REASON_REQUIRED", "Enter the reason for your changes before you edit this shop.", { fields: { reason: "required" } });
}

/** After a change an administrator made to a shop: the audit line (who, what and why) and an email to the owner of the shop. Nothing happens for the shop owner's own changes. */
export function noteAdminEdit(request: Request | undefined, change: { action: string; entityType: string; entityId: string; summary: string }): void {
  if (!isAdminRequest(request)) return;
  const reason = adminEditReason(request);
  recordAdminAction({ action: "admin_edit.reason", entityType: change.entityType, entityId: change.entityId, organizationId: currentShop.id, details: `${change.action}; reason: ${reason}`.slice(0, 200) });
  const owner = findAccount(`owner-${currentShop.id}`);
  if (!owner) return;
  sendAdminEmail({
    to: owner.email,
    subject: `A platform administrator changed ${currentShop.name}`,
    body: `Hello ${owner.fullName},\n\nA platform administrator made a change to ${currentShop.name}: ${change.summary}.\n\nReason given: ${reason}\n\nIf you have a question, please use the support contact in your dashboard.`,
    sentBy: ADMIN_EMAIL,
  });
}
