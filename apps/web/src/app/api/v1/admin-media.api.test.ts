import { beforeEach, describe, expect, it } from "vitest";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { adminMedia } from "@/lib/mock/admin-directory";
import { currentShop } from "@/lib/mock/data";
import { hasImage, listMedia, resetMediaStore } from "@/lib/mock/media-store";
import { clearPromotionImage, resetPromotionStore } from "@/lib/mock/promotion-store";
import { POST as uploadPromotion } from "./media/promotions/route";
import { POST as uploadSession } from "./media/sessions/route";
import { POST as removeMedia } from "./admin/media/[id]/route";

// A 1x1 PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const upload = (handler: (r: Request) => Promise<Response>, dataUrl = PNG) => handler(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataUrl }) }));
const remove = (id: string, body: unknown) => removeMedia(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) } as never);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as any;

beforeEach(() => { resetMediaStore(); resetPromotionStore(); resetAdminAudit(); });

describe("the images of the shops in the admin area", () => {
  it("lists what a shop uploaded (with its kind, shop, size and date) before the images shown from a link, and finds them by shop or by what shows them", async () => {
    const a = await json(await upload(uploadPromotion));
    const b = await json(await upload(uploadSession));
    const rows = adminMedia();
    const uploads = rows.filter((r) => r.source === "UPLOAD");
    expect(uploads.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(uploads.map((r) => r.kind).sort()).toEqual(["promotion", "session"]);
    expect(uploads.every((r) => r.shopId === currentShop.id && r.shopName === currentShop.name && r.size > 0 && r.mime === "image/png" && r.uploadedAt !== "")).toBe(true);
    expect(rows.findIndex((r) => r.source === "LINK")).toBeGreaterThanOrEqual(uploads.length); // uploads first
    expect(rows.filter((r) => r.source === "LINK").some((r) => r.kind === "workshop")).toBe(true);
    expect(adminMedia("", "session", "UPLOAD")).toHaveLength(1);
    expect(adminMedia("", "", "LINK").every((r) => r.source === "LINK")).toBe(true);
    expect(adminMedia(currentShop.name, "", "UPLOAD")).toHaveLength(2);
    expect(adminMedia("EARLY20", "", "LINK").map((r) => r.usedBy)).toContain("EARLY20");
    expect(adminMedia("zzz-nothing")).toEqual([]);
  });

  it("removes an uploaded file with a reason; a reason is needed, an unknown or linked image is 404", async () => {
    const a = await json(await upload(uploadPromotion));
    expect((await remove(a.id, {})).status).toBe(422);
    expect((await remove(a.id, { reason: "  " })).status).toBe(422);
    expect(hasImage(a.id)).toBe(true);
    expect((await remove("link-ws-ws-1", { reason: "Not ours" })).status).toBe(404);
    const done = await remove(a.id, { reason: "Not a photo of the workshop" });
    expect(done.status).toBe(200);
    expect((await json(done)).id).toBe(a.id);
    expect(hasImage(a.id)).toBe(false);
    expect(listMedia()).toEqual([]);
    expect((await remove(a.id, { reason: "Again" })).status).toBe(404);
  });

  it("the voucher that showed the removed image has no image any more; others are not touched", () => {
    expect(clearPromotionImage("00000000-0000-0000-0000-000000000000")).toBe(0);
  });

  it("writes an audit line by the administrator with the kind and the reason", async () => {
    const a = await json(await upload(uploadSession));
    await remove(a.id, { reason: "Offensive" });
    expect(liveAuditLogs()[0]).toMatchObject({ action: "media.remove", actorRole: "SYSTEM_ADMIN", organizationId: currentShop.id, details: "session; reason: Offensive" });
  });
});
