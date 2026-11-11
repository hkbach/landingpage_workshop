import { beforeEach, describe, expect, it } from "vitest";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { currentShop } from "@/lib/mock/data";
import { getCustomDomain, resetShopDomainStore, setCustomDomain, shopOrigin, slugForDomain } from "@/lib/mock/shop-domain-store";
import { shareLink } from "@/lib/mock/share-link";
import { GET, PUT } from "./shop/domain/route";

const put = (body: unknown, referer?: string) => PUT(new Request("http://app.localtest.me:3000/api/v1/shop/domain", { method: "PUT", headers: { "content-type": "application/json", ...(referer ? { referer } : {}) }, body: JSON.stringify(body) }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const SLUG = currentShop.slug;

beforeEach(() => { resetShopDomainStore(); resetAdminAudit(); });

describe("the own domain of a shop", () => {
  it("starts with none and shows the address the shop always has", async () => {
    const body = await json(await GET());
    expect(body.domain).toBe("");
    expect(body.systemHost).toMatch(new RegExp(`^${SLUG}\\.`));
  });

  it("saves a domain cleaned (pasted address, upper case), and the landing page address becomes that domain", async () => {
    const res = await put({ domain: " HTTPS://Www.Whisk-Ladle.com/workshops " });
    expect(res.status).toBe(200);
    expect((await json(res)).domain).toBe("www.whisk-ladle.com");
    expect(getCustomDomain(SLUG)).toBe("www.whisk-ladle.com");
    expect(shopOrigin(SLUG)).toMatch(/^https?:\/\/www\.whisk-ladle\.com$/);
    expect(slugForDomain("WWW.whisk-ladle.com:3000")).toBe(SLUG);
    expect(slugForDomain("other.com")).toBeUndefined();
  });

  it("the links the shop shares (affiliate, referral) use the domain", async () => {
    await put({ domain: "www.whisk-ladle.com" });
    const link = shareLink(SLUG, new Request("http://app.localtest.me/x"), { ref: "ABC" });
    expect(link).toMatch(/^https?:\/\/www\.whisk-ladle\.com\/\?ref=ABC$/);
  });

  it("an empty value removes the domain and the system address is used again", async () => {
    await put({ domain: "www.whisk-ladle.com" });
    const res = await put({ domain: "  " });
    expect(res.status).toBe(200);
    expect(getCustomDomain(SLUG)).toBe("");
    expect(shopOrigin(SLUG)).toContain(`${SLUG}.`);
    expect(slugForDomain("www.whisk-ladle.com")).toBeUndefined();
  });

  it("422 for something that is not a domain and for the domain of the platform; nothing is saved", async () => {
    const bad = await put({ domain: "not a domain" });
    expect(bad.status).toBe(422);
    expect((await json(bad)).error.details.fields).toEqual({ domain: "invalid" });
    const platform = await put({ domain: `${SLUG}.localtest.me` });
    expect(platform.status).toBe(422);
    expect((await json(platform)).error.details.fields).toEqual({ domain: "platform" });
    expect((await put({ domain: 5 })).status).toBe(422);
    expect(getCustomDomain(SLUG)).toBe("");
  });

  it("another shop cannot take a domain that is used (409), and can once it is released", () => {
    expect(setCustomDomain("other-shop", "www.shared.com").ok).toBe(true);
    expect(setCustomDomain(SLUG, "WWW.shared.com")).toEqual({ ok: false, code: "TAKEN" });
    expect(setCustomDomain("other-shop", "").ok).toBe(true);
    expect(setCustomDomain(SLUG, "www.shared.com").ok).toBe(true);
  });

  it("the same shop can save its own domain again without a conflict and without an audit line", async () => {
    await put({ domain: "www.whisk-ladle.com" });
    const n = liveAuditLogs().length;
    expect((await put({ domain: "WWW.whisk-ladle.com" })).status).toBe(200);
    expect(liveAuditLogs()).toHaveLength(n);
  });

  it("writes an audit line for a change: by the shop owner, or by the administrator from the admin area", async () => {
    await put({ domain: "www.whisk-ladle.com" });
    expect(liveAuditLogs()[0]).toMatchObject({ action: "shop.domain_set", actorRole: "SHOP_OWNER", details: "- -> www.whisk-ladle.com" });
    await put({ domain: "" }, `http://app.localtest.me:3000/systemadmin/shops/${SLUG}/site`);
    expect(liveAuditLogs()[0]).toMatchObject({ action: "shop.domain_remove", actorRole: "SYSTEM_ADMIN" });
  });
});
