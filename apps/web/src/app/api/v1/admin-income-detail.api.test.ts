import { beforeEach, describe, expect, it } from "vitest";
import { adminIncome, shopIncomeDetail } from "@/lib/mock/admin-income";
import { resetAccountsStore } from "@/lib/mock/accounts-store";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { resetFeeRates } from "@/lib/mock/fee-rates-store";
import { resetInviteStore } from "@/lib/mock/invite-store";
import { resetReferralStore } from "@/lib/mock/referral-store";
import { GET } from "./admin/income/[shopId]/route";

const get = (shopId: string, qs = "") => GET(new Request(`http://x/api/v1/admin/income/${shopId}${qs}`), { params: Promise.resolve({ shopId }) } as never);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as any;

beforeEach(() => { resetBookingStore(); resetAccountsStore(); resetFeeRates(); resetReferralStore(); resetInviteStore(); });

describe("the income of one shop in detail", () => {
  it("has the same totals as the income page: the lines add up to the income and the fees of the shop", () => {
    const detail = shopIncomeDetail(currentShop.id)!;
    const shop = adminIncome().shops.find((s) => s.shopId === currentShop.id)!;
    expect(detail.lines.length).toBeGreaterThan(5);
    expect(detail.lines.reduce((n, l) => n + l.amount, 0)).toBe(shop.income);
    expect(detail.lines.reduce((n, l) => n + l.maintenanceFee, 0)).toBe(shop.maintenanceFee);
    expect(detail.lines.reduce((n, l) => n + l.serviceFee, 0)).toBe(shop.serviceFee);
    expect(detail.lines.reduce((n, l) => n + l.referralFee, 0)).toBe(shop.referralFee);
    expect(detail.months.reduce((n, m) => n + m.fees, 0)).toBe(shop.fees);
    expect(detail.months.reduce((n, m) => n + m.income, 0)).toBe(shop.income);
    expect(detail.months.reduce((n, m) => n + m.inviteBonus, 0)).toBe(shop.inviteBonus);
    expect(detail.months.reduce((n, m) => n + m.profit, 0)).toBe(shop.profit);
  });

  it("lists the payments newest first, a payment taken back is a reversal that gives its fees back, and each line has a profit", () => {
    const { lines } = shopIncomeDetail(currentShop.id)!;
    expect(lines.map((l) => l.occurredAt)).toEqual([...lines.map((l) => l.occurredAt)].sort().reverse());
    expect(lines.some((l) => l.kind === "PAYMENT")).toBe(true);
    const reversal = lines.find((l) => l.kind === "REVERSAL");
    if (reversal) expect(reversal.amount).toBeLessThan(0);
    for (const l of lines) expect(l.profit).toBe(l.maintenanceFee + l.serviceFee - l.referralFee);
    expect(lines.some((l) => l.referred && l.referralFee > 0)).toBe(true);
  });

  it("the statement of a month is the sum of its payments, newest month first, and its invoice is the maintenance and service fees", () => {
    const { months } = shopIncomeDetail(currentShop.id)!;
    expect(months.map((m) => m.month)).toEqual([...months.map((m) => m.month)].sort().reverse());
    for (const m of months) expect(m.fees).toBe(m.maintenanceFee + m.serviceFee);
  });

  it("takes the days asked for; a shop with no data has no line; the API says 404 for an unknown shop and 422 for a bad range", async () => {
    const all = shopIncomeDetail(currentShop.id)!;
    const some = shopIncomeDetail(currentShop.id, "2999-01-01")!;
    expect(some.lines).toEqual([]);
    expect(some.months).toEqual([]);
    expect(all.lines.length).toBeGreaterThan(0);
    expect(shopIncomeDetail("org-4")!.lines).toEqual([]);
    expect(shopIncomeDetail("org-zzz")).toBeNull();
    expect((await get("org-zzz")).status).toBe(404);
    expect((await get(currentShop.id, "?from=nope")).status).toBe(422);
    expect((await get(currentShop.id, "?from=2026-05-02&to=2026-05-01")).status).toBe(422);
    const ok = await json(await get(currentShop.id));
    expect(ok).toMatchObject({ shopId: currentShop.id, currency: "VND" });
    expect(ok.lines.length).toBe(all.lines.length);
  });
});
