import { beforeEach, describe, expect, it } from "vitest";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { adminShops } from "@/lib/mock/admin-directory";
import { currentShop } from "@/lib/mock/data";
import { getCustomDomain, resetShopDomainStore, setCustomDomain } from "@/lib/mock/shop-domain-store";
import { getPublicSite } from "@/lib/mock/site";
import { liveShop, resetShopAdminStore } from "@/lib/mock/shop-admin-store";
import { PATCH } from "./admin/organizations/[id]/route";

const patch = (id: string, body: unknown) => PATCH(new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) } as never);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const current = () => {
  const s = liveShop(currentShop.id)!;
  return { name: s.name, contactEmail: s.contactEmail, contactPhone: s.contactPhone, whatsapp: s.whatsapp ?? "", address: s.address, mapsUrl: s.mapsUrl, country: s.country, timezone: s.timezone, currency: s.currency, defaultLocale: s.defaultLocale, enabledLocales: s.enabledLocales, customDomain: "" };
};

beforeEach(() => { resetShopAdminStore(); resetShopDomainStore(); resetAdminAudit(); });

describe("PATCH /admin/organizations/{id}: an administrator edits a shop", () => {
  it("saves the profile, never changes the slug, and names the fields that changed", async () => {
    const res = await patch(currentShop.id, { ...current(), name: "  Whisk & Ladle Studio ", address: "99 Dong Khoi, District 1", whatsapp: "+84 90 111 2222" });
    expect(res.status).toBe(200);
    expect((await json(res)).changed).toEqual(["name", "whatsapp", "address"]);
    const shop = liveShop(currentShop.id)!;
    expect(shop).toMatchObject({ name: "Whisk & Ladle Studio", address: "99 Dong Khoi, District 1", whatsapp: "+84 90 111 2222", slug: currentShop.slug });
    expect(adminShops().find((s) => s.id === currentShop.id)).toMatchObject({ name: "Whisk & Ladle Studio" });
  });

  it("the public landing page and the admin rows read what the administrator saved", async () => {
    await patch(currentShop.id, { ...current(), name: "Renamed Kitchen" });
    expect(getPublicSite(currentShop.slug)?.shop.name).toBe("Renamed Kitchen");
  });

  it("an empty WhatsApp removes it; a profile with nothing different changes nothing and writes no line", async () => {
    await patch(currentShop.id, { ...current(), whatsapp: "+84 90 111 2222" });
    const n = liveAuditLogs().length;
    const res = await patch(currentShop.id, { ...current(), whatsapp: "+84 90 111 2222" });
    expect((await json(res)).changed).toEqual([]);
    expect(liveAuditLogs()).toHaveLength(n);
    await patch(currentShop.id, { ...current(), whatsapp: "" });
    expect(liveShop(currentShop.id)!.whatsapp).toBeUndefined();
  });

  it("sets and removes the own domain, shown in the admin list; another shop's domain is refused with 409 and nothing is saved", async () => {
    expect((await patch(currentShop.id, { ...current(), customDomain: "https://WWW.whisk-ladle.com/" })).status).toBe(200);
    expect(getCustomDomain(currentShop.slug)).toBe("www.whisk-ladle.com");
    expect(adminShops().find((s) => s.id === currentShop.id)!.customDomain).toBe("www.whisk-ladle.com");
    expect((await patch(currentShop.id, { ...current(), customDomain: "" })).status).toBe(200);
    expect(getCustomDomain(currentShop.slug)).toBe("");
    setCustomDomain("brewbean", "www.brew.com");
    const taken = await patch(currentShop.id, { ...current(), name: "Should not be saved", customDomain: "www.brew.com" });
    expect(taken.status).toBe(409);
    expect(liveShop(currentShop.id)!.name).not.toBe("Should not be saved");
  });

  it("422 names the wrong fields: the email, a timezone or currency that does not exist, a default language that is not enabled, a domain of the platform", async () => {
    const res = await patch(currentShop.id, { ...current(), contactEmail: "nope", timezone: "Mars/Base", currency: "ZZZ", enabledLocales: ["vi"], defaultLocale: "en", customDomain: "whiskladle.localtest.me" });
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields).toMatchObject({ contactEmail: "invalid", timezone: "invalid", currency: "invalid", enabledLocales: "defaultMustBeEnabled" });
    expect((await json(await patch(currentShop.id, { ...current(), customDomain: "whiskladle.localtest.me" }))).error.details.fields).toEqual({ customDomain: "platform" });
  });

  it("404 for a shop that does not exist; audit lines say the administrator changed which fields and the domain, never the values of the profile", async () => {
    expect((await patch("org-zzz", current())).status).toBe(404);
    await patch(currentShop.id, { ...current(), name: "Another Name", customDomain: "www.whisk-ladle.com" });
    const lines = liveAuditLogs().slice(0, 2);
    expect(lines.map((l) => l.action).sort()).toEqual(["shop.domain_set", "shop.profile_update"]);
    expect(lines.every((l) => l.actorRole === "SYSTEM_ADMIN" && l.organizationId === currentShop.id)).toBe(true);
    expect(lines.find((l) => l.action === "shop.profile_update")!.details).toBe("changed: name");
  });
});
