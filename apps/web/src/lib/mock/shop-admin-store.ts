// SERVER-ONLY: what a system administrator did to the shops (activate / deactivate, show on the Workshops page of the guests), until apps/api exists. The rest of the
// mock reads the shops through `liveShops`. Lives on globalThis like the other mock stores. TODO(api): SUPER_ADMIN only, audited, one transaction.
import type { OrgStatus } from "@workshop/shared";
import type { Shop } from "@/lib/types";
import { shops } from "./data";

interface Change { status?: OrgStatus; statusReason?: string | null; showOnCustomerPage?: boolean }
const g = globalThis as unknown as { __shopAdmin?: Map<string, Change> };
const changes = () => (g.__shopAdmin ??= new Map<string, Change>());

/** Test helper: no change of an administrator. */
export function resetShopAdminStore(): void {
  g.__shopAdmin = new Map();
}

/** The shops with the changes of the administrators applied. */
export function liveShops(): Shop[] {
  return shops.map((s) => {
    const c = changes().get(s.id);
    if (!c) return s;
    const { statusReason: _reason, ...rest } = s;
    void _reason;
    const reason = c.statusReason === undefined ? s.statusReason : (c.statusReason ?? undefined);
    return { ...rest, status: c.status ?? s.status, ...(reason ? { statusReason: reason } : {}), ...(c.showOnCustomerPage === undefined ? (s.showOnCustomerPage === undefined ? {} : { showOnCustomerPage: s.showOnCustomerPage }) : { showOnCustomerPage: c.showOnCustomerPage }) };
  });
}

export const liveShop = (id: string): Shop | undefined => liveShops().find((s) => s.id === id);

export type ShopStatusResult = { ok: true; shop: Shop } | { ok: false; code: "NOT_FOUND" | "NOT_ALLOWED" | "REASON_REQUIRED" };

/** Deactivate (SUSPENDED, with a reason) an ACTIVE shop or activate a SUSPENDED one. A shop in draft becomes ACTIVE when its owner publishes (publishShop), not here. */
export function setShopActive(id: string, active: boolean, reason = ""): ShopStatusResult {
  const shop = liveShop(id);
  if (!shop) return { ok: false, code: "NOT_FOUND" };
  if (active ? shop.status !== "SUSPENDED" : shop.status !== "ACTIVE") return { ok: false, code: "NOT_ALLOWED" };
  if (!active && !reason.trim()) return { ok: false, code: "REASON_REQUIRED" };
  changes().set(id, { ...changes().get(id), status: active ? "ACTIVE" : "SUSPENDED", statusReason: active ? null : reason.trim().slice(0, 300) });
  return { ok: true, shop: liveShop(id)! };
}

export type PublishShopResult = { ok: true; shop: Shop; changed: boolean } | { ok: false; code: "NOT_FOUND" | "SUSPENDED" };

/** The shop owner publishes the landing page. There is no review: a DRAFT shop becomes ACTIVE at once; an ACTIVE shop stays so (`changed` false); a SUSPENDED shop cannot publish. */
export function publishShop(id: string): PublishShopResult {
  const shop = liveShop(id);
  if (!shop) return { ok: false, code: "NOT_FOUND" };
  if (shop.status === "SUSPENDED") return { ok: false, code: "SUSPENDED" };
  if (shop.status === "ACTIVE") return { ok: true, shop, changed: false };
  changes().set(id, { ...changes().get(id), status: "ACTIVE", statusReason: null });
  return { ok: true, shop: liveShop(id)!, changed: true };
}

/** Whether the workshops of the shop are listed on the Workshops page of the guests (only an ACTIVE shop appears there anyway). */
export function setShowOnCustomerPage(id: string, show: boolean): boolean {
  if (!shops.some((s) => s.id === id)) return false;
  changes().set(id, { ...changes().get(id), showOnCustomerPage: show });
  return true;
}
