// SERVER-ONLY: who did it, for the audit log: the actor of a line, worked out from what the route knows. The mock has no session yet, so a route of a customer knows the id of the
// customer (the path), a route of the shop owner area is the owner of the demo shop, and a public route only knows the email the guest typed.
// TODO(api): the actor of the session (user id, email, role, organization) for every route.
import type { AuditActor } from "./admin-audit-store";
import { ADMIN_EMAIL } from "./admin-audit-store";
import { findAccount, type Account } from "./accounts-store";
import { currentShop } from "./data";

/** A customer of the demo shop (the id of their account); an unknown id is a guest. */
export function customerActor(id: string): AuditActor {
  const a = findAccount(id);
  return a ? accountActor(a) : { actor: "Customer", actorRole: "CUSTOMER", actorId: id };
}

export function accountActor(a: Account): AuditActor {
  return { actor: a.fullName, actorEmail: a.email, actorRole: a.type === "SHOP_OWNER" ? "SHOP_OWNER" : "CUSTOMER", actorId: a.id };
}

/** Whether the request comes from a page of the admin area (an administrator editing a shop on the admin site). TODO(api): the role of the session decides, not the address of the page. */
export function isAdminRequest(request?: Request): boolean {
  const referer = request?.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).pathname.startsWith("/systemadmin/");
  } catch {
    return false;
  }
}

/** The owner of the shop (the routes of the shop owner area, until they have a session); the administrator when the request comes from the admin area. */
export function ownerActor(request?: Request, orgId: string = currentShop.id): AuditActor {
  if (isAdminRequest(request)) return { actor: "Platform Admin", actorEmail: ADMIN_EMAIL, actorRole: "SYSTEM_ADMIN", actorId: "admin" };
  const a = findAccount(`owner-${orgId}`);
  return a ? accountActor(a) : { actor: "Shop owner", actorRole: "SHOP_OWNER", actorId: `owner-${orgId}` };
}

/** Someone who is not logged in and typed an email (a booking, a cancellation, a report). */
export function guestActor(email: string | undefined, name?: string): AuditActor {
  return { actor: name?.trim() || "Guest", ...(email ? { actorEmail: email.trim().toLowerCase() } : {}), actorRole: "GUEST" };
}

/** The system itself (a timer closes a session whose time is over). */
export const SYSTEM_ACTOR: AuditActor = { actor: "System", actorRole: "SYSTEM" };

/** The organization of everything a customer or a guest does in the prototype: the demo shop. */
export const DEMO_ORG = currentShop.id;
