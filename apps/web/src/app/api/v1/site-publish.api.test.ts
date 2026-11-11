import { beforeEach, describe, expect, it } from "vitest";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { liveShop, resetShopAdminStore, setShopActive } from "@/lib/mock/shop-admin-store";
import { currentShop, shops } from "@/lib/mock/data";
import { POST as publish } from "./site/publish/route";
import { POST as shopStatus } from "./admin/organizations/[id]/status/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (res: Response) => (await res.json()) as Record<string, any>;

beforeEach(() => { resetShopAdminStore(); resetAdminAudit(); });

describe("POST /site/publish: the shop owner publishes, there is no review", () => {
  it("an ACTIVE shop only publishes the page and the status does not change", async () => {
    const res = await publish();
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ status: "ACTIVE", changed: false });
    expect(liveAuditLogs()[0]).toMatchObject({ action: "shop.publish", actorRole: "SHOP_OWNER", organizationId: currentShop.id });
  });

  it("a SUSPENDED shop cannot publish: 403 and no line", async () => {
    expect(setShopActive(currentShop.id, false, "Reported").ok).toBe(true);
    const before = liveAuditLogs().length;
    const res = await publish();
    expect(res.status).toBe(403);
    expect((await body(res)).error.code).toBe("SUSPENDED");
    expect(liveAuditLogs()).toHaveLength(before);
  });

  it("the statuses of a shop are DRAFT, ACTIVE and SUSPENDED: nothing is pending review", () => {
    expect(new Set(shops.map((s) => s.status))).toEqual(new Set(["ACTIVE", "DRAFT", "SUSPENDED"]));
    expect(liveShop("org-2")?.status).toBe("DRAFT");
  });

  it("an administrator cannot activate a draft shop any more: it goes live when its owner publishes", async () => {
    const res = await shopStatus(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "ACTIVE" }) }), { params: Promise.resolve({ id: "org-2" }) } as never);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(liveShop("org-2")?.status).toBe("DRAFT");
  });
});
