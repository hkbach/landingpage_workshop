import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapsSearchUrl } from "@workshop/shared";
import type { CustomerBooking } from "@/lib/customer-bookings";
import { liveBookings, resetBookingStore } from "@/lib/mock/booking-store";
import { currentShop, sessions, shops, workshops } from "@/lib/mock/data";
import { outboxEmails, resetOutbox, type BookingConfirmationEmail } from "@/lib/mock/outbox-store";
import { otherShopSites } from "@/lib/mock/other-shops";
import { getPublicSite } from "@/lib/mock/site";
import { GET as customerBookings } from "./customer/[id]/bookings/route";
import { POST as book } from "./public/sites/[slug]/bookings/route";

// Where a workshop takes place: its own address, or the address of the shop. Guests see the one that applies, on the site, in the emails and in My Booking.

const ctx = { params: Promise.resolve({ slug: currentShop.slug }) } as never;
const post = (body: unknown) => book(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx);
const OWN = "88 Pasteur Street, District 3, Ho Chi Minh City"; // Dim Sum Night (ws-4) is held at another place
const future = (s: (typeof sessions)[number]) => s.status === "RUNNING" && Date.parse(s.startsAt) > Date.now() + 86_400_000 && s.capacity - s.reservedCount >= 2;
const sessionOf = (workshopId: string) => sessions.find((s) => s.workshopId === workshopId && future(s))!;

beforeEach(() => { resetBookingStore(); resetOutbox(); vi.stubEnv("CUSTOMER_LOGIN_REQUIRED", "false"); });
afterEach(() => vi.unstubAllEnvs());

describe("the address guests see on the site", () => {
  it("is the address of the workshop when it has one, and the address of the shop when it has none", () => {
    const site = getPublicSite(currentShop.slug)!;
    const byId = (id: string) => site.workshops.find((w) => w.id === id)!;
    expect(byId("ws-4").address).toBe(OWN);
    expect(byId("ws-1").address).toBe(currentShop.address);
    expect(byId("ws-2").address).toBe(currentShop.address);
    for (const w of site.workshops) expect(w.address, w.id).toBeTruthy();
  });
  it("comes with the note of the workshop, whichever address applies, and only when there is a note", () => {
    const site = getPublicSite(currentShop.slug)!;
    const byId = (id: string) => site.workshops.find((w) => w.id === id)!;
    expect(byId("ws-4").addressNote).toContain("ring the bell of the green door"); // its own address and its note
    expect(byId("ws-1").addressNote).toContain("first floor"); // the shop's address, with a note of the workshop
    expect(byId("ws-2").addressNote).toBeUndefined(); // no note
    expect("addressNote" in byId("ws-2")).toBe(false);
    expect(getPublicSite("brewbean")!.workshops.find((w) => w.id === "ws-b3")!.addressNote).toContain("red brick");
    expect(getPublicSite("greentable")!.workshops.find((w) => w.id === "ws-g2")!.addressNote).toContain("level 2");
  });
  it("works the same for the other shops", () => {
    for (const shop of shops.filter((s) => otherShopSites[s.id])) {
      const site = getPublicSite(shop.slug)!;
      for (const w of site.workshops) expect(w.address, w.id).toBe(otherShopSites[shop.id]!.workshops.find((x) => x.id === w.id)!.address || shop.address);
    }
    expect(getPublicSite("brewbean")!.workshops.find((w) => w.id === "ws-b3")!.address).toContain("Roastery");
    expect(getPublicSite("brewbean")!.workshops.find((w) => w.id === "ws-b1")!.address).toBe(shops.find((s) => s.slug === "brewbean")!.address);
  });
  it("does not change the workshop the shop owner sees: its address stays empty when it has none", () => {
    expect(workshops.find((w) => w.id === "ws-1")!.address).toBeUndefined();
    expect(workshops.find((w) => w.id === "ws-4")!.address).toBe(OWN);
    expect(workshops.find((w) => w.id === "ws-1")!.addressNote).toContain("first floor"); // a note, and still no address of its own
  });
});

describe("the address in the emails of a booking", () => {
  const guest = (sessionId: string) => ({ sessionId, quantity: 1, fullName: "Where Guest", email: "where.guest@example.com", phone: "+84 90 111 2222" });

  it("the confirmation email says where: the address of the workshop", async () => {
    expect((await post(guest(sessionOf("ws-4").id))).status).toBe(201);
    const mail = outboxEmails().find((e): e is BookingConfirmationEmail => e.type === "BOOKING_CONFIRMATION")!;
    expect(mail.address).toBe(OWN);
    expect(mail.html).toContain("88 Pasteur Street");
    expect(mail.addressNote).toContain("ring the bell of the green door");
    expect(mail.html).toContain("ring the bell of the green door");
    expect(mail.html).toContain("Ghi chú địa chỉ"); // the label of the note, in the six languages
    expect([...mail.html.matchAll(/Địa điểm/g)].length).toBeGreaterThan(0); // the label is in the six languages
    expect(mail.text).toContain(OWN);
  });
  it("or the address of the shop when the workshop has none", async () => {
    expect((await post(guest(sessionOf("ws-1").id))).status).toBe(201);
    const mail = outboxEmails().find((e): e is BookingConfirmationEmail => e.type === "BOOKING_CONFIRMATION")!;
    expect(mail.address).toBe(currentShop.address);
    expect(mail.html).toContain("Nguyen Hue");
    expect(mail.addressNote).toContain("first floor"); // the note of the workshop goes with the shop's address too
  });
});

describe("the address in My Booking", () => {
  const mine = async () => ((await (await customerBookings(new Request("http://x"), { params: Promise.resolve({ id: "cu-1" }) } as never)).json()) as { bookings: CustomerBooking[] }).bookings;

  it("each booking has the address of its workshop and the way there", async () => {
    for (const workshopId of ["ws-4", "ws-1"]) {
      const res = await post({ sessionId: sessionOf(workshopId).id, quantity: 1, fullName: "Emma Johnson", email: "emma@example.com", phone: "+44 7000 000000" });
      expect(res.status, workshopId).toBe(201);
    }
    const codes = liveBookings().filter((b) => b.customerId === "cu-1" && ["ws-4", "ws-1"].includes(b.workshopId)).map((b) => b.bookingCode);
    const list = await mine();
    const own = list.find((b) => b.workshopId === "ws-4" && codes.includes(b.code))!;
    expect(own.address).toBe(OWN);
    expect(own.directionsUrl).toBe(mapsSearchUrl(OWN)); // a search of its own address (not of the note)
    expect(own.addressNote).toContain("ring the bell of the green door");
    const shopWide = list.find((b) => b.workshopId === "ws-1" && codes.includes(b.code))!;
    expect(shopWide.address).toBe(currentShop.address);
    expect(shopWide.directionsUrl).toBe(currentShop.mapsUrl); // the map link of the shop
    expect(shopWide.addressNote).toContain("first floor");
    expect(list.find((b) => b.workshopId === "ws-2")?.addressNote).toBeUndefined();
    for (const b of list) expect(b.address, b.code).toBeTruthy();
  });
});
