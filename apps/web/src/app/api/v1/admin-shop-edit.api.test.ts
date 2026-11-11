import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { adminSessions, adminWorkshops } from "@/lib/mock/admin-directory";
import { isAdminRequest, ownerActor } from "@/lib/mock/audit-actors";
import { currentShop } from "@/lib/mock/data";
import { resetShopAdminStore } from "@/lib/mock/shop-admin-store";
import { POST as publish } from "./site/publish/route";

const from = (referer?: string) => new Request("http://app.localtest.me:3000/api/v1/site/publish", { method: "POST", headers: referer ? { referer } : {} });
const SRC = join(__dirname, "..", "..", "..");

beforeEach(() => { resetAdminAudit(); resetShopAdminStore(); });

describe("an administrator edits a shop on the admin site", () => {
  it("only the shop that has data in the mock can be edited, in the Sessions and the Workshops lists", () => {
    const sessions = adminSessions();
    const workshops = adminWorkshops();
    expect(sessions.some((s) => s.editable)).toBe(true);
    expect(sessions.filter((s) => s.editable).every((s) => s.shopSlug === currentShop.slug)).toBe(true);
    expect(sessions.filter((s) => !s.editable).every((s) => s.shopSlug !== currentShop.slug)).toBe(true);
    expect(workshops.filter((w) => w.editable).every((w) => w.shopId === currentShop.id)).toBe(true);
    expect(workshops.some((w) => !w.editable)).toBe(true);
  });

  it("the edits made from a page of the admin area are recorded as made by the administrator, not by the shop owner", async () => {
    expect(isAdminRequest(from(`http://app.localtest.me:3000/systemadmin/shops/${currentShop.slug}/site`))).toBe(true);
    expect(isAdminRequest(from(`http://app.localtest.me:3000/shopowner/${currentShop.slug}/site`))).toBe(false);
    expect(isAdminRequest(from("not a url"))).toBe(false);
    expect(isAdminRequest(from())).toBe(false);
    expect(isAdminRequest()).toBe(false);
    expect(ownerActor(from()).actorRole).toBe("SHOP_OWNER");

    await publish(from(`http://app.localtest.me:3000/systemadmin/shops/${currentShop.slug}/site/main`));
    expect(liveAuditLogs()[0]).toMatchObject({ action: "shop.publish", actorRole: "SYSTEM_ADMIN", organizationId: currentShop.id });
    await publish(from(`http://app.localtest.me:3000/shopowner/${currentShop.slug}/site/main`));
    expect(liveAuditLogs()[0]).toMatchObject({ action: "shop.publish", actorRole: "SHOP_OWNER" });
  });

  it("the admin area has the pages of the shop owner (landing pages, builder, preview, sessions, workshops) and never sends the administrator to /shopowner", () => {
    for (const p of ["site/page.tsx", "site/[pageId]/page.tsx", "site/preview/page.tsx", "sessions/page.tsx", "workshops/page.tsx", "workshops/new/page.tsx", "workshops/[id]/page.tsx", "layout.tsx"]) {
      expect(existsSync(join(SRC, "app/systemadmin/shops/[slug]", p)), p).toBe(true);
    }
    for (const f of ["components/admin/directory/landing-pages-admin.tsx", "components/admin/directory/sessions-admin.tsx", "components/admin/directory/workshops-admin.tsx", "app/systemadmin/shops/[slug]/workshops/new/page.tsx", "app/systemadmin/shops/[slug]/workshops/[id]/page.tsx"]) {
      expect(readFileSync(join(SRC, f), "utf8"), f).not.toMatch(/["'`]\/shopowner/);
    }
  });
});
