import { beforeEach, describe, expect, it } from "vitest";
import { resetAccountStatus } from "@/lib/mock/account-status";
import { resetAccountsStore } from "@/lib/mock/accounts-store";
import { liveBookings, resetBookingStore } from "@/lib/mock/booking-store";
import { sessions, workshops } from "@/lib/mock/data";
import { resetOutbox } from "@/lib/mock/outbox-store";
import { attributedBookings, createReferral, listReferrals, resetReferralStore } from "@/lib/mock/referral-store";
import { POST as book } from "./public/sites/[slug]/bookings/route";
import { POST as click } from "./public/sites/[slug]/referrals/click/route";
import { GET as myLinks, POST as makeLink } from "./customer/[id]/referrals/route";

const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
const json = (body: unknown) => new Request("http://whiskladle.localtest.me:3000/x", { method: "POST", headers: { "content-type": "application/json", host: "whiskladle.localtest.me:3000" }, body: JSON.stringify(body) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (res: Response) => (await res.json()) as Record<string, any>;
const FREE = sessions.find((s) => s.status === "RUNNING" && Date.parse(s.startsAt) > Date.now() + 86_400_000 && s.capacity - s.reservedCount >= 4 && workshops.find((w) => w.id === s.workshopId)?.status === "ACTIVE")!;
const guest = (email: string, ref?: string) => ({ sessionId: FREE.id, quantity: 1, fullName: "Guest", email, phone: "+84 90 111 2222", ...(ref ? { ref } : {}) });

beforeEach(() => { resetBookingStore(); resetOutbox(); resetAccountsStore(); resetAccountStatus(); resetReferralStore(); });

describe("an affiliate link", () => {
  it("opens the booking of its workshop at its shop and carries the code", async () => {
    const made = await body(await makeLink(json({ workshopId: FREE.workshopId }), ctx({ id: "cu-9" })));
    const url = new URL(made.link);
    expect(url.origin).toBe("http://whiskladle.localtest.me:3000");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("ref")).toBe(made.code);
    expect(url.searchParams.get("book")).toBe(FREE.workshopId);
  });
  it("counts a click, once for each call, and ignores a code that is not a link", async () => {
    const { referral } = createReferral("cu-9", FREE.workshopId) as { ok: true; referral: { code: string } };
    expect((await click(json({ code: referral.code }), ctx({ slug: "whiskladle" }))).status).toBe(204);
    expect((await click(json({ code: referral.code }), ctx({ slug: "whiskladle" }))).status).toBe(204);
    expect(listReferrals().find((r) => r.code === referral.code)!.clicks).toBe(2);
    expect((await click(json({ code: "NOPE" }), ctx({ slug: "whiskladle" }))).status).toBe(404);
    expect((await click(json({}), ctx({ slug: "whiskladle" }))).status).toBe(422);
    expect((await click(json({ code: referral.code }), ctx({ slug: "other" }))).status).toBe(404);
    expect((await click(json({ code: referral.code }), ctx({ slug: "brewbean" }))).status).toBe(404); // the link belongs to another shop
    const brew = (createReferral("cu-9", "ws-b1") as { ok: true; referral: { code: string } }).referral;
    expect((await click(json({ code: brew.code }), ctx({ slug: "brewbean" }))).status).toBe(204); // a link of another shop is counted at its own shop
  });
});

describe("a booking made with the code of a link", () => {
  it("counts for the link, and the person who shares it earns the affiliate fee on it", async () => {
    const link = (createReferral("cu-9", FREE.workshopId) as { ok: true; referral: { id: string; code: string } }).referral;
    const res = await book(json(guest("newfriend@example.com", link.code)), ctx({ slug: "whiskladle" }));
    expect(res.status).toBe(201);
    const code = (await body(res)).code;
    const booking = liveBookings().find((b) => b.bookingCode === code)!;
    expect(attributedBookings().get(booking.id)).toBe(link.id);
  });
  it("does not count for another workshop, for the booking of the person who shares the link, or for a wrong code; the booking is made all the same", async () => {
    const link = (createReferral("cu-9", FREE.workshopId) as { ok: true; referral: { id: string; code: string } }).referral;
    const other = (createReferral("cu-9", workshops.find((w) => w.id !== FREE.workshopId && w.status === "ACTIVE")!.id) as { ok: true; referral: { code: string } }).referral;
    const wrongWorkshop = await book(json(guest("a@example.com", other.code)), ctx({ slug: "whiskladle" }));
    const own = await book(json(guest("oliver@example.com", link.code)), ctx({ slug: "whiskladle" })); // cu-9 is Oliver Smith
    const wrong = await book(json(guest("b@example.com", "NOT-A-CODE")), ctx({ slug: "whiskladle" }));
    expect([wrongWorkshop.status, own.status, wrong.status]).toEqual([201, 201, 201]);
    const attributed = attributedBookings();
    const codes = [(await body(wrongWorkshop)).code, (await body(own)).code, (await body(wrong)).code];
    for (const code of codes) {
      const b = liveBookings().find((x) => x.bookingCode === code)!;
      expect([link.id].includes(attributed.get(b.id) ?? "")).toBe(false);
    }
  });
  it("rejects a code that is too long", async () => {
    expect((await book(json(guest("c@example.com", "x".repeat(41))), ctx({ slug: "whiskladle" }))).status).toBe(422);
  });
});

describe("the affiliate fee of every shop is given with the links", () => {
  it("says what a workshop would earn before the guest registers for it", async () => {
    const res = await body(await myLinks(new Request("http://x/api/v1/customer/cu-9/referrals"), ctx({ id: "cu-9" })));
    expect(res.rates["org-1"]).toBe(1000);
    expect(res.shopOfWorkshop[FREE.workshopId]).toBe("org-1");
  });
});
