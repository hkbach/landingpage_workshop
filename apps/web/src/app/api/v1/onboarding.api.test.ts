import { beforeEach, describe, expect, it } from "vitest";
import { resetAccountStatus } from "@/lib/mock/account-status";
import { resetAccountsStore } from "@/lib/mock/accounts-store";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { isOnboarded, registeredShops, resetRegisteredShops } from "@/lib/mock/registered-shops-store";
import { resetShopAdminStore } from "@/lib/mock/shop-admin-store";
import { POST as onboard } from "./onboarding/route";
import { POST as signup } from "./auth/signup/route";

const post = (handler: (r: Request) => Promise<Response>, body: unknown) => handler(new Request("http://app.localtest.me:3000/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const PW = "A-strong-pass-2026";
const answers = (over: Record<string, unknown> = {}) => ({
  slug: "clay-co-studio", country: "SG", timezone: "Asia/Singapore", currency: "SGD", defaultLocale: "vi", enabledLocales: ["vi", "en"],
  contactEmail: " hello@clay.example ", contactPhone: " +65 6000 0000 ", whatsapp: "", address: " 1 Clay Road ", mapsUrl: "", ...over,
});

beforeEach(() => { resetBookingStore(); resetAccountsStore(); resetAccountStatus(); resetRegisteredShops(); resetShopAdminStore(); resetAdminAudit(); });

async function newShop() {
  return json(await post(signup, { type: "SHOP_OWNER", email: "maker@example.com", password: PW, confirmPassword: PW, shopName: "Clay & Co Studio" }));
}

describe("the setup wizard of a shop that just signed up (POST /onboarding)", () => {
  it("the signup answer tells the owner to finish the setup, and the new shop is not set up yet", async () => {
    const me = await newShop();
    expect(me).toMatchObject({ type: "SHOP_OWNER", slug: "clay-co-studio", setup: true });
    expect(isOnboarded(registeredShops()[0]!.id)).toBe(false);
  });

  it("saves the region, languages and contact (trimmed) on the shop, keeps its name and slug, audits it, and works once", async () => {
    await newShop();
    const res = await post(onboard, answers());
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ slug: "clay-co-studio" });
    const shop = registeredShops()[0]!;
    expect(shop).toMatchObject({ name: "Clay & Co Studio", slug: "clay-co-studio", country: "SG", timezone: "Asia/Singapore", currency: "SGD", defaultLocale: "vi", enabledLocales: ["vi", "en"], contactEmail: "hello@clay.example", contactPhone: "+65 6000 0000", address: "1 Clay Road" });
    expect(isOnboarded(shop.id)).toBe(true);
    expect(liveAuditLogs()[0]).toMatchObject({ action: "shop.onboarding", actorRole: "SHOP_OWNER", organizationId: shop.id });
    const again = await post(onboard, answers());
    expect(again.status).toBe(409);
    expect((await json(again)).error.code).toBe("ALREADY_DONE");
  });

  it("refuses wrong answers with the fields (422) and a shop that did not sign up with 404", async () => {
    await newShop();
    for (const [field, value] of [["country", "Vietnam"], ["timezone", "Mars/Base"], ["currency", "XXXX"], ["defaultLocale", "fr"], ["enabledLocales", []], ["enabledLocales", ["en"]], ["contactEmail", "nope"], ["contactPhone", "12"], ["address", "   "], ["mapsUrl", "http://insecure.example"]] as const) {
      const res = await post(onboard, answers({ [field]: value }));
      expect(res.status, field).toBe(422);
      expect((await json(res)).error.details.fields[field], field).toBeTruthy();
    }
    expect(isOnboarded(registeredShops()[0]!.id)).toBe(false);
    expect((await post(onboard, answers({ slug: "whiskladle" }))).status).toBe(404); // a demo shop is set up already
    expect((await post(onboard, answers({ slug: "nobody" }))).status).toBe(404);
    expect(isOnboarded("org-1")).toBe(true);
  });
});
