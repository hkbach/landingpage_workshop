import { beforeEach, describe, expect, it } from "vitest";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { adminAffiliate, adminReferralLinks } from "@/lib/mock/admin-directory";
import { resetAccountsStore } from "@/lib/mock/accounts-store";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { inviteCodeOf, recordInvite, resetInviteStore } from "@/lib/mock/invite-store";
import { attributeBooking, listReferrals, resetReferralStore } from "@/lib/mock/referral-store";
import { GET as myLinks } from "./customer/[id]/referrals/route";
import { GET as myInvites } from "./customer/[id]/invites/route";
import { POST as clickRoute } from "./public/sites/[slug]/referrals/click/route";
import { POST as switchLink } from "./admin/affiliate/[id]/route";
import { POST as switchCode } from "./admin/referrals/[accountId]/route";

const post = (handler: (r: Request, c: never) => Promise<Response>, body: unknown, params: Record<string, string>) =>
  handler(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve(params) } as never);
const get = (handler: (r: Request, c: never) => Promise<Response>, id: string) => handler(new Request("http://app.localtest.me:3000/x"), { params: Promise.resolve({ id }) } as never);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as any;

beforeEach(() => { resetBookingStore(); resetAccountsStore(); resetReferralStore(); resetInviteStore(); resetAdminAudit(); });

describe("an administrator switches an affiliate link off", () => {
  const link = () => listReferrals().find((r) => r.code === "EMMA-FRESH")!;

  it("needs a reason to switch off, and none to switch on; 404 for an unknown link", async () => {
    expect((await post(switchLink, { disabled: true }, { id: link().id })).status).toBe(422);
    expect((await post(switchLink, { disabled: true, reason: "  " }, { id: link().id })).status).toBe(422);
    expect((await post(switchLink, { disabled: true, reason: "Used for spam" }, { id: "rf-nope" })).status).toBe(404);
    expect((await post(switchLink, { disabled: true, reason: "Used for spam" }, { id: link().id })).status).toBe(200);
    expect((await post(switchLink, { disabled: false }, { id: link().id })).status).toBe(200);
    expect(link().disabled).toBeUndefined();
  });

  it("the admin list shows it off with the reason, the customer sees it as Deactive, and switching it on brings it back", async () => {
    await post(switchLink, { disabled: true, reason: "Used for spam" }, { id: link().id });
    expect(adminAffiliate().find((r) => r.code === "EMMA-FRESH")).toMatchObject({ disabled: true, disabledReason: "Used for spam" });
    const mine = (await json(await get(myLinks, "cu-1"))).items ?? (await json(await get(myLinks, "cu-1")));
    const row = (Array.isArray(mine) ? mine : mine.items).find((r: { code: string }) => r.code === "EMMA-FRESH");
    expect(row.status).toBe("DEACTIVE");
    await post(switchLink, { disabled: false }, { id: link().id });
    const again = await json(await get(myLinks, "cu-1"));
    expect((Array.isArray(again) ? again : again.items).find((r: { code: string }) => r.code === "EMMA-FRESH").status).toBe("ON_GOING");
  });

  it("the landing page is told it is DEACTIVE, and a booking made with the code is not attributed", async () => {
    await post(switchLink, { disabled: true, reason: "Used for spam" }, { id: link().id });
    const res = await post(clickRoute, { code: "EMMA-FRESH" }, { slug: currentShop.slug });
    expect((await json(res)).status).toBe("DEACTIVE");
    expect(attributeBooking("bk-x", "EMMA-FRESH", link().workshopId, "cu-9")).toBe(false);
  });

  it("writes an audit line by the administrator with the reason", async () => {
    await post(switchLink, { disabled: true, reason: "Used for spam" }, { id: link().id });
    expect(liveAuditLogs()[0]).toMatchObject({ action: "affiliate.disable", actorRole: "SYSTEM_ADMIN", details: "reason: Used for spam" });
  });
});

describe("an administrator switches an invite link (referral) off", () => {
  it("a friend who registers with a code that is off is not counted; on again, a new friend is", async () => {
    const code = inviteCodeOf("cu-9");
    expect((await post(switchCode, { disabled: true }, { accountId: "cu-9" })).status).toBe(422);
    expect((await post(switchCode, { disabled: true, reason: "Fake accounts" }, { accountId: "cu-9" })).status).toBe(200);
    expect(recordInvite(code, "cu-3")).toBe(false);
    expect(adminReferralLinks().find((r) => r.inviterId === "cu-9")).toMatchObject({ disabled: true, disabledReason: "Fake accounts" });
    expect((await json(await get(myInvites, "cu-9"))).disabled).toBe(true);
    await post(switchCode, { disabled: false }, { accountId: "cu-9" });
    expect(recordInvite(code, "cu-3")).toBe(true);
    expect((await json(await get(myInvites, "cu-9"))).disabled).toBe(false);
  });

  it("keeps the friends and bonuses earned before, 404 for a customer without an account, and writes a line", async () => {
    const before = adminReferralLinks().find((r) => r.inviterId === "cu-1")!.registered;
    await post(switchCode, { disabled: true, reason: "Review" }, { accountId: "cu-1" });
    expect(adminReferralLinks().find((r) => r.inviterId === "cu-1")!.registered).toBe(before);
    expect((await post(switchCode, { disabled: true, reason: "x" }, { accountId: "nobody" })).status).toBe(404);
    expect(liveAuditLogs()[0]).toMatchObject({ action: "referral.disable", actorRole: "SYSTEM_ADMIN" });
  });
});
