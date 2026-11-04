import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customerLoginRequired } from "@/lib/customer-access";
import { liveBookings, liveCustomers, resetBookingStore } from "@/lib/mock/booking-store";
import { GET, PATCH } from "./customer/[id]/route";

// The account of a guest, seen by the guest (/customer/{id}): with the login required, only with the email of the account; the profile can be changed, the email cannot.
// While the prototype is tested the login is switched off (the id alone is enough), but never in production.

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const get = (id: string, email?: string) => GET(new Request("http://x", { headers: email === undefined ? {} : { "x-guest-email": email } }), ctx(id));
const patch = (id: string, email: string | undefined, body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json", ...(email === undefined ? {} : { "x-guest-email": email }) }, body: typeof body === "string" ? body : JSON.stringify(body) }), ctx(id));

const EMMA = "emma@example.com"; // cu-1: an account with a phone, a gender, social accounts and a picture
const input = {
  fullName: "Emma J. Johnson", phone: "+44 7000 111111", preferredLocale: "vi", country: "VN", birthDate: "1991-05-13", gender: "OTHER",
  socials: { ZALO: "0901 000 111", INSTAGRAM: "@emma.cooks" }, avatarUrl: "https://picsum.photos/seed/emma2/200/200",
};

beforeEach(() => { resetBookingStore(); vi.stubEnv("CUSTOMER_LOGIN_REQUIRED", "true"); }); // the suites below are about the login; the last one switches it off
afterEach(() => vi.unstubAllEnvs());

describe("GET /customer/{id}", () => {
  it("gives the profile to the guest who has the email of the account (whatever the case and the spaces)", async () => {
    for (const email of [EMMA, "  EMMA@Example.com "]) {
      const res = await get("cu-1", email);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        id: "cu-1", fullName: "Emma Johnson", email: EMMA, phone: "+44 7000 000000", preferredLocale: "en",
        account: { country: "GB", birthDate: "1990-04-12", gender: "FEMALE", socials: { INSTAGRAM: "@emma.makes" } },
      });
    }
    expect(res0(await get("cu-1", EMMA))).toBe("no-store");
  });
  it("is the same answer for a missing email, a wrong email, an id that does not exist and a customer without an account", async () => {
    const answers = [await get("cu-1"), await get("cu-1", "someone.else@example.com"), await get("cu-nope", EMMA), await get("cu-2", "minjun@example.com")]; // cu-2 booked without an account
    for (const a of answers) expect(a.status).toBe(404);
    const bodies = await Promise.all(answers.map((a) => a.json()));
    for (const b of bodies) expect(b).toEqual(bodies[0]);
  });
  it("does not give the profile of one guest to another guest's email", async () => {
    expect((await get("cu-1", "thu@example.com")).status).toBe(404); // the email of cu-4
  });
});

describe("PATCH /customer/{id}", () => {
  it("saves the profile: the guest sees it, and so does the shop", async () => {
    const res = await patch("cu-1", EMMA, input);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ fullName: "Emma J. Johnson", phone: "+44 7000 111111", preferredLocale: "vi", account: { country: "VN", birthDate: "1991-05-13", gender: "OTHER", socials: { ZALO: "0901 000 111", INSTAGRAM: "@emma.cooks" } } });
    expect(await (await get("cu-1", EMMA)).json()).toMatchObject({ fullName: "Emma J. Johnson", preferredLocale: "vi" });
    expect(liveCustomers().find((c) => c.id === "cu-1")).toMatchObject({ fullName: "Emma J. Johnson", phone: "+44 7000 111111", preferredLocale: "vi", account: { country: "VN" } });
  });
  it("never changes the email, whatever is sent", async () => {
    await patch("cu-1", EMMA, { ...input, email: "new@example.com" });
    expect(liveCustomers().find((c) => c.id === "cu-1")!.email).toBe(EMMA);
    expect((await get("cu-1", "new@example.com")).status).toBe(404);
    expect((await get("cu-1", EMMA)).status).toBe(200);
  });
  it("trims the texts, and what is left out is removed (the profile is replaced as a whole)", async () => {
    const res = await patch("cu-1", EMMA, { fullName: "  Emma  ", phone: "   ", preferredLocale: "en", country: "GB", birthDate: "1990-04-12", socials: { TIKTOK: "  @e  ", ZALO: "   " }, avatarUrl: " " });
    expect(res.status).toBe(200);
    const profile = (await res.json()) as { fullName: string; phone?: string; account: { gender?: string; socials?: Record<string, string>; avatarUrl?: string } };
    expect(profile.fullName).toBe("Emma");
    expect(profile.phone).toBeUndefined();
    expect(profile.account.gender).toBeUndefined();
    expect(profile.account.avatarUrl).toBeUndefined();
    expect(profile.account.socials).toEqual({ TIKTOK: "@e" });
    expect(liveCustomers().find((c) => c.id === "cu-1")!.phone).toBeUndefined(); // the phone of the seed does not come back
  });
  it("keeps what the guest agreed to at registration, and the bookings keep the name typed when they were made", async () => {
    const before = liveBookings().filter((b) => b.customerId === "cu-1").map((b) => b.guestName);
    await patch("cu-1", EMMA, input);
    expect(liveBookings().filter((b) => b.customerId === "cu-1").map((b) => b.guestName)).toEqual(before);
  });
  it("says which field is wrong, and saves nothing", async () => {
    const bad = async (over: Record<string, unknown>) => {
      const res = await patch("cu-1", EMMA, { ...input, ...over });
      expect(res.status).toBe(422);
      return ((await res.json()) as { error: { details: { fields: Record<string, string> } } }).error.details.fields;
    };
    expect(await bad({ fullName: "   " })).toEqual({ fullName: "required" });
    expect(await bad({ fullName: "x".repeat(121) })).toEqual({ fullName: "tooLong" });
    expect(await bad({ country: "ZZ" })).toEqual({ country: "required" });
    expect(await bad({ birthDate: "2999-01-01" })).toEqual({ birthDate: "invalid" });
    expect(await bad({ birthDate: "13/05/1991" })).toEqual({ birthDate: "invalid" });
    expect(await bad({ preferredLocale: "xx" })).toEqual({ preferredLocale: "required" });
    expect(await bad({ avatarUrl: "http://example.com/a.png" })).toEqual({ avatarUrl: "urlInvalid" });
    expect(await bad({ avatarUrl: "javascript:alert(1)" })).toEqual({ avatarUrl: "urlInvalid" });
    expect(await bad({ gender: "ROBOT" })).toHaveProperty("gender");
    expect(await bad({ socials: { ZALO: "z".repeat(101) } })).toHaveProperty("socials");
    expect(liveCustomers().find((c) => c.id === "cu-1")!.fullName).toBe("Emma Johnson");
  });
  it("is the same 404 for a wrong email, a missing email, an unknown id and a customer without an account, even for a body that is not valid", async () => {
    for (const [id, email] of [["cu-1", "someone.else@example.com"], ["cu-1", undefined], ["cu-nope", EMMA], ["cu-2", "minjun@example.com"]] as const) {
      expect((await patch(id, email, input)).status, `${id} ${email}`).toBe(404);
      expect((await patch(id, email, { fullName: "" })).status, `${id} ${email} invalid`).toBe(404);
    }
    expect(liveCustomers().find((c) => c.id === "cu-1")!.fullName).toBe("Emma Johnson");
  });
  it("refuses a body that is not JSON", async () => {
    expect((await patch("cu-1", EMMA, "not json")).status).toBe(400);
  });
});

describe("with the login switched off (testing only)", () => {
  beforeEach(() => vi.stubEnv("CUSTOMER_LOGIN_REQUIRED", "false"));

  it("is off by default outside production, and only a variable set to true turns it on", () => {
    vi.stubEnv("CUSTOMER_LOGIN_REQUIRED", "");
    expect(customerLoginRequired()).toBe(false);
    vi.stubEnv("CUSTOMER_LOGIN_REQUIRED", "true");
    expect(customerLoginRequired()).toBe(true);
  });
  it("is always on in production, whatever the variable says", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CUSTOMER_LOGIN_REQUIRED", "false");
    expect(customerLoginRequired()).toBe(true);
    expect((await get("cu-1")).status).toBe(404);
  });
  it("the id alone gives the profile (an email is not needed, and a wrong one does not matter)", async () => {
    expect((await get("cu-1")).status).toBe(200);
    expect(await (await get("cu-1", "someone.else@example.com")).json()).toMatchObject({ id: "cu-1", email: EMMA });
  });
  it("an unknown id and a customer without an account are still 404", async () => {
    expect((await get("cu-nope")).status).toBe(404);
    expect((await get("cu-2")).status).toBe(404); // booked without an account
  });
  it("the profile can be saved with the id alone, and the email still cannot change", async () => {
    const res = await patch("cu-1", undefined, { ...input, email: "new@example.com" });
    expect(res.status).toBe(200);
    expect(liveCustomers().find((c) => c.id === "cu-1")).toMatchObject({ fullName: "Emma J. Johnson", email: EMMA });
    expect((await patch("cu-2", undefined, input)).status).toBe(404);
  });
});

function res0(res: Response): string | null {
  return res.headers.get("cache-control");
}
