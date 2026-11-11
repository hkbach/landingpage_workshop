import { beforeEach, describe, expect, it } from "vitest";
import { feeOf } from "@workshop/shared";
import { resetAccountStatus } from "@/lib/mock/account-status";
import { resetAccountsStore } from "@/lib/mock/accounts-store";
import { adminReferralLinks } from "@/lib/mock/admin-directory";
import { adminIncome } from "@/lib/mock/admin-income";
import { liveBookings, recordPaid, resetBookingStore } from "@/lib/mock/booking-store";
import { sessions, workshops } from "@/lib/mock/data";
import { resetFeeRates, setAllRates } from "@/lib/mock/fee-rates-store";
import { inviteBonuses, inviteCodeOf, listInvites, recordInvite, resetInviteStore } from "@/lib/mock/invite-store";
import { resetOutbox } from "@/lib/mock/outbox-store";
import { resetReferralStore } from "@/lib/mock/referral-store";
import { GET as myInvites } from "./customer/[id]/invites/route";
import { POST as register } from "./public/sites/[slug]/accounts/route";
import { POST as book } from "./public/sites/[slug]/bookings/route";

const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
const json = (body: unknown) => new Request("http://whiskladle.localtest.me:3000/x", { method: "POST", headers: { "content-type": "application/json", host: "whiskladle.localtest.me:3000" }, body: JSON.stringify(body) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (res: Response) => (await res.json()) as Record<string, any>;
const FREE = sessions.find((s) => s.status === "RUNNING" && Date.parse(s.startsAt) > Date.now() + 86_400_000 && s.capacity - s.reservedCount >= 4 && workshops.find((w) => w.id === s.workshopId)?.status === "ACTIVE")!;
const PROFILE = { password: "a-long-password-1", fullName: "Friend", country: "VN", birthDate: "1995-05-20", categories: ["COOKING", "BAKING", "COFFEE_TEA"], consent: true };
const signUp = async (email: string, inviteCode?: string) => body(await register(json({ ...PROFILE, email, ...(inviteCode ? { inviteCode } : {}) }), ctx({ slug: "whiskladle" })));
const guest = (email: string, quantity = 2) => ({ sessionId: FREE.id, quantity, fullName: "Friend", email, phone: "+84 90 111 2222" });
/** The friend books and the booking is paid. */
async function bookAndPay(email: string, quantity = 2) {
  const res = await body(await book(json(guest(email, quantity)), ctx({ slug: "whiskladle" })));
  const booking = liveBookings().find((b) => b.bookingCode === res.code)!;
  expect(recordPaid(booking.id, true, "test")).toBe(true);
  return booking;
}
/** The bonuses of cu-9 (the demo data has referrals of its own). */
const mineOnly = () => inviteBonuses().filter((b) => b.inviterId === "cu-9");
const listFor = async (id: string) => body(await myInvites(new Request("http://whiskladle.localtest.me:3000/x", { headers: { host: "whiskladle.localtest.me:3000" } }), ctx({ id })));

beforeEach(() => { resetBookingStore(); resetOutbox(); resetAccountsStore(); resetAccountStatus(); resetFeeRates(); resetReferralStore(); resetInviteStore(); });

describe("the invite link of a customer", () => {
  it("is one link for good, with the code of the customer", async () => {
    const first = await listFor("cu-9");
    const again = await listFor("cu-9");
    expect(first.code).toMatch(/^I[0-9A-F]{8}$/);
    expect(again.code).toBe(first.code);
    expect(first.link).toBe(`http://whiskladle.localtest.me:3000/?invite=${first.code}`);
    expect(inviteCodeOf("cu-9")).toBe(first.code);
    expect((await listFor("cu-14")).code).not.toBe(first.code);
  });
  it("404 for a customer who does not exist", async () => {
    expect((await myInvites(new Request("http://x"), ctx({ id: "nobody" }))).status).toBe(404);
  });
});

describe("a friend registers through the link", () => {
  it("becomes a referral of the customer who owns the code, waiting for a paid booking", async () => {
    const { code } = await listFor("cu-9");
    const made = await signUp("friend1@example.com", code);
    expect(made.customerId).toBeTruthy();
    const mine = await listFor("cu-9");
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({ status: "REGISTERED", bonus: 0, email: "f***@example.com" });
    expect(mine.total).toBe(0);
  });
  it("is ignored for an unknown code, and a friend counts for one customer only", async () => {
    const { code } = await listFor("cu-9");
    const other = await listFor("cu-14");
    await signUp("a@example.com", "NOT-A-CODE");
    const f = await signUp("b@example.com", code);
    expect(recordInvite(other.code, f.customerId)).toBe(false); // already a referral of cu-9
    expect(listInvites().filter((i) => i.inviteeId === f.customerId)).toHaveLength(1);
    expect((await listFor("cu-14")).items).toHaveLength(0);
    expect((await listFor("cu-9")).items).toHaveLength(1);
  });
  it("cannot invite oneself", async () => {
    const { code } = await listFor("cu-9");
    expect(recordInvite(code, "cu-9")).toBe(false);
  });
});

describe("the bonus", () => {
  it("is earned when the friend pays a booking made after registering: the rate x the ORIGINAL price", async () => {
    setAllRates("org-1", { maintenanceBps: 1000, serviceBps: 1000, referralBps: 1000, inviteBonusBps: 500 });
    const { code } = await listFor("cu-9");
    await signUp("friend2@example.com", code);
    expect((await listFor("cu-9")).total).toBe(0); // registered only
    const booking = await bookAndPay("friend2@example.com", 2);
    const mine = await listFor("cu-9");
    expect(mine.items[0]).toMatchObject({ status: "EARNED", bookingCode: booking.bookingCode });
    expect(mine.items[0].bonus).toBe(feeOf(booking.unitPriceAmount * 2, 500));
    expect(mine.total).toBe(mine.items[0].bonus);
    expect(mine.bonusBps).toBe(500);
  });
  it("is not earned while the booking is not paid", async () => {
    const { code } = await listFor("cu-9");
    await signUp("friend3@example.com", code);
    await body(await book(json(guest("friend3@example.com")), ctx({ slug: "whiskladle" })));
    expect((await listFor("cu-9")).total).toBe(0);
    expect(mineOnly()).toHaveLength(0);
  });
  it("is earned ONCE for each referral: a second paid booking of the friend earns nothing more", async () => {
    const { code } = await listFor("cu-9");
    await signUp("friend4@example.com", code);
    const first = await bookAndPay("friend4@example.com", 1);
    const afterFirst = (await listFor("cu-9")).total;
    expect(afterFirst).toBeGreaterThan(0);
    await bookAndPay("friend4@example.com", 3);
    const mine = await listFor("cu-9");
    expect(mine.total).toBe(afterFirst);
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0].bookingCode).toBe(first.bookingCode);
    expect(mineOnly()).toHaveLength(1);
  });
  it("does not count a booking the friend made before registering", async () => {
    // The friend booked as a guest, then registers through the link: that booking came first, so it earns nothing; a later one does.
    const before = await bookAndPay("late@example.com", 1);
    const { code } = await listFor("cu-9");
    await signUp("late@example.com", code);
    expect((await listFor("cu-9")).total).toBe(0);
    expect(mineOnly()).toHaveLength(0);
    const later = await bookAndPay("late@example.com", 1);
    expect(mineOnly().map((b) => b.bookingId)).toEqual([later.id]);
    expect(before.id).not.toBe(later.id);
  });
});

describe("the admin sees the referrals and the income pays the bonus", () => {
  it("lists the links with the friends, searches by the email of the customer and counts the bonus", async () => {
    const { code } = await listFor("cu-9");
    await signUp("friend5@example.com", code);
    await bookAndPay("friend5@example.com", 2);
    const row = adminReferralLinks("oliver@example.com")[0]!;
    expect(row).toMatchObject({ inviterId: "cu-9", code, registered: 1, earned: 1 });
    expect(row.bonusTotal).toBeGreaterThan(0);
    expect(adminReferralLinks("friend5@example")[0]!.inviterId).toBe("cu-9"); // by the email of a friend
    expect(adminReferralLinks("nobody@example.com")).toEqual([]);
    expect(adminReferralLinks("", "2999-01-01")).toEqual([]);
  });
  it("is taken off the profit of the platform: profit = income of the admin - affiliate fee - referral bonus", async () => {
    const before = adminIncome().shops.find((s) => s.shopId === "org-1")!;
    const { code } = await listFor("cu-9");
    await signUp("friend6@example.com", code);
    await bookAndPay("friend6@example.com", 2);
    const after = adminIncome().shops.find((s) => s.shopId === "org-1")!;
    const bonus = inviteBonuses().find((b) => b.inviterId === "cu-9")!;
    expect(after.inviteBonus - before.inviteBonus).toBe(bonus.amount);
    expect(after.profit).toBe(after.fees - after.referralFee - after.inviteBonus);
    const total = adminIncome().totals.find((t) => t.currency === after.currency)!;
    expect(total.profit).toBe(total.fees - total.referralFee - total.inviteBonus);
  });
  it("follows the referral bonus rate of the shop", async () => {
    setAllRates("org-1", { maintenanceBps: 1000, serviceBps: 1000, referralBps: 1000, inviteBonusBps: 0 });
    const { code } = await listFor("cu-9");
    await signUp("friend7@example.com", code);
    await bookAndPay("friend7@example.com", 2);
    expect(inviteBonuses().find((b) => b.inviterId === "cu-9")!.amount).toBe(0);
    setAllRates("org-1", { maintenanceBps: 1000, serviceBps: 1000, referralBps: 1000, inviteBonusBps: 10_000 });
    const b = inviteBonuses().find((x) => x.inviterId === "cu-9")!;
    expect(b.amount).toBe(b.base); // 100% of the original price
  });
});
