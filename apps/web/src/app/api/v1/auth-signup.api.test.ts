import { beforeEach, describe, expect, it } from "vitest";
import { resetAccountStatus } from "@/lib/mock/account-status";
import { findAccountByEmail, resetAccountsStore } from "@/lib/mock/accounts-store";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { resetRegisteredShops } from "@/lib/mock/registered-shops-store";
import { liveShops, resetShopAdminStore } from "@/lib/mock/shop-admin-store";
import { adminShops, adminUsers } from "@/lib/mock/admin-directory";
import { POST as login } from "./auth/login/route";
import { POST as signup } from "./auth/signup/route";

const post = (handler: (r: Request) => Promise<Response>, body: unknown) => handler(new Request("http://app.localtest.me:3000/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const PW = "A-strong-pass-2026";
const customer = (over: Record<string, unknown> = {}) => ({ type: "CUSTOMER", email: "New.Person@Example.com ", password: PW, confirmPassword: PW, ...over });
const owner = (over: Record<string, unknown> = {}) => ({ type: "SHOP_OWNER", email: "maker@example.com", password: PW, confirmPassword: PW, shopName: "  Clay & Co Studio ", ...over });

beforeEach(() => { resetBookingStore(); resetAccountsStore(); resetAccountStatus(); resetRegisteredShops(); resetShopAdminStore(); resetAdminAudit(); });

describe("POST /auth/signup: a customer", () => {
  it("creates the account with an email and a password, and answers like the login (the person is logged in)", async () => {
    const res = await post(signup, customer());
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body).toMatchObject({ type: "CUSTOMER", email: "new.person@example.com" });
    expect(body.id).toMatch(/^cu-/);
    expect(findAccountByEmail("new.person@example.com")).toMatchObject({ type: "CUSTOMER", fullName: "new.person" });
  });

  it("the new customer can log in with that password, and is told to go to the customer area", async () => {
    await post(signup, customer());
    const res = await post(login, { email: "new.person@example.com", password: PW });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ type: "CUSTOMER" });
    expect((await post(login, { email: "new.person@example.com", password: "wrong-wrong-1" })).status).toBe(401);
  });

  it("does not need a shop name, and a shop name sent by a customer is ignored", async () => {
    expect((await post(signup, customer({ shopName: "Ignored" }))).status).toBe(201);
    expect(liveShops().some((s) => s.name === "Ignored")).toBe(false);
  });
});

describe("POST /auth/signup: a shop owner", () => {
  it("creates the shop (DRAFT) with the slug made from its name and the owner account, and answers with the slug", async () => {
    const res = await post(signup, owner());
    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({ type: "SHOP_OWNER", email: "maker@example.com", slug: "clay-co-studio" });
    const shop = liveShops().find((s) => s.slug === "clay-co-studio")!;
    expect(shop).toMatchObject({ name: "Clay & Co Studio", status: "DRAFT", ownerEmail: "maker@example.com" });
  });

  it("gives another slug when the name is already taken or reserved", async () => {
    await post(signup, owner());
    const second = await json(await post(signup, owner({ email: "other@example.com" })));
    expect(second.slug).toBe("clay-co-studio-2");
    const reserved = await json(await post(signup, owner({ email: "third@example.com", shopName: "Admin" })));
    expect(reserved.slug).toBe("admin-2");
    expect((await json(await post(signup, owner({ email: "fourth@example.com", shopName: "한국어" })))).slug).toBe("shop");
  });

  it("the owner can log in and is told the slug of the shop; the admin lists show the shop and the account", async () => {
    await post(signup, owner());
    const res = await post(login, { email: "maker@example.com", password: PW });
    expect(await json(res)).toMatchObject({ type: "SHOP_OWNER", slug: "clay-co-studio" });
    expect(adminShops().some((s) => s.slug === "clay-co-studio")).toBe(true);
    expect(adminUsers().some((u) => u.email === "maker@example.com")).toBe(true);
  });

  it("422 when the shop name is missing", async () => {
    const res = await post(signup, owner({ shopName: "   " }));
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields).toEqual({ shopName: "required" });
    expect(liveShops().some((s) => s.ownerEmail === "maker@example.com")).toBe(false);
  });
});

describe("POST /auth/signup: checks for both kinds", () => {
  it("422 for a wrong email, a password that is too weak and a confirmation that does not match", async () => {
    const res = await post(signup, customer({ email: "nope", password: "short", confirmPassword: "other" }));
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields).toEqual({ email: "invalid" });
    const weak = await post(signup, customer({ password: "short", confirmPassword: "other" }));
    expect((await json(weak)).error.details.fields).toEqual({ password: "weak", confirmPassword: "mismatch" });
  });

  it("409 when the email already has an account (a demo shop owner, or a customer who signed up)", async () => {
    expect((await post(signup, customer({ email: "linh@whiskladle.example" }))).status).toBe(409);
    await post(signup, customer());
    const again = await post(signup, owner({ email: "NEW.person@example.com" }));
    expect(again.status).toBe(409);
    expect((await json(again)).error.code).toBe("EMAIL_TAKEN");
  });

  it("422 for an unknown kind, 400 for a body that is not JSON", async () => {
    expect((await post(signup, { type: "ADMIN", email: "a@example.com", password: PW, confirmPassword: PW })).status).toBe(422);
    const bad = await signup(new Request("http://x", { method: "POST", body: "nope" }));
    expect(bad.status).toBe(400);
  });

  it("writes an audit line (the kind, the shop) and never the password", async () => {
    await post(signup, owner());
    const [line] = liveAuditLogs();
    expect(line).toMatchObject({ action: "auth.signup", actorRole: "SHOP_OWNER", actorEmail: "maker@example.com", details: "shop clay-co-studio" });
    expect(JSON.stringify(line)).not.toContain(PW);
  });
});
