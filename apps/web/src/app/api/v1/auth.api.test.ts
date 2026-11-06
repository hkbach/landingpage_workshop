import { beforeEach, describe, expect, it } from "vitest";
import { resetAccountStatus } from "@/lib/mock/account-status";
import { DEMO_PASSWORD, findAccountByEmail, resetAccountsStore } from "@/lib/mock/accounts-store";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { outboxEmails, resetOutbox } from "@/lib/mock/outbox-store";
import { POST as resetByAdmin } from "./admin/users/[id]/reset-password/route";
import { POST as setStatus } from "./admin/users/[id]/status/route";
import { PATCH as editUser } from "./admin/users/[id]/route";
import { POST as login } from "./auth/login/route";
import { GET as linkValid, POST as chooseNew } from "./auth/reset-password/route";

const OWNER = currentShop.ownerEmail;
const NEW_PASSWORD = "A-new-secret-2026";
const req = (url: string, body?: unknown, method = "POST") =>
  new Request(url, { method, headers: { "content-type": "application/json", host: "app.localtest.me:3000" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (res: Response) => (await res.json()) as Record<string, any>;

beforeEach(() => { resetBookingStore(); resetOutbox(); resetAccountsStore(); resetAccountStatus(); });

describe("POST /auth/login", () => {
  it("logs a shop owner in with email + password and says where their shop is", async () => {
    const res = await login(req("http://x/api/v1/auth/login", { email: ` ${OWNER.toUpperCase()}`, password: DEMO_PASSWORD }));
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ type: "SHOP_OWNER", slug: currentShop.slug, email: OWNER });
  });
  it("401 for a wrong password and for an unknown email alike; 422 when something is missing", async () => {
    const wrong = await login(req("http://x", { email: OWNER, password: "nope-nope-nope" }));
    const unknown = await login(req("http://x", { email: "nobody@example.com", password: "nope-nope-nope" }));
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(await body(wrong)).toEqual(await body(unknown));
    const empty = await login(req("http://x", { email: "", password: "" }));
    expect(empty.status).toBe(422);
    expect((await body(empty)).error.details.fields).toEqual({ email: "required", password: "required" });
  });
  it("403 for a deactivated account (after the right password), 429 after 5 failures", async () => {
    await setStatus(req("http://x", { status: "DEACTIVATED" }), idCtx(findAccountByEmail(OWNER)!.id));
    expect((await login(req("http://x", { email: OWNER, password: DEMO_PASSWORD }))).status).toBe(403);
    for (let i = 0; i < 5; i++) await login(req("http://x", { email: "a@example.com", password: "wrong-password" }));
    expect((await login(req("http://x", { email: "a@example.com", password: "wrong-password" }))).status).toBe(429);
  });
});

describe("the reset of a password by an administrator", () => {
  it("deactivates the account, emails the temporary password, and the link page sets the new password", async () => {
    const id = findAccountByEmail(OWNER)!.id;
    const res = await resetByAdmin(req(`http://app.localtest.me:3000/api/v1/admin/users/${id}/reset-password`), idCtx(id));
    expect(res.status).toBe(200);
    expect(JSON.stringify(await body(res))).not.toMatch(/token|password/i);
    expect((await login(req("http://x", { email: OWNER, password: DEMO_PASSWORD }))).status).toBe(403);

    const mail = outboxEmails().find((e) => e.type === "PASSWORD_RESET")!;
    expect(mail.to).toBe(OWNER);
    const token = /reset-password\?token=([\w-]+)/.exec(mail.text)![1]!;
    expect(mail.text).toContain(`http://app.localtest.me:3000/reset-password?token=${token}`);
    const temp = /Temporary password[^A-Za-z0-9]+([A-Za-z0-9]{14})\b/.exec(mail.text)![1]!;

    expect(await body(await linkValid(req(`http://x/api/v1/auth/reset-password?token=${token}`, undefined, "GET")))).toEqual({ valid: true });
    const wrongTemp = await chooseNew(req("http://x", { token, tempPassword: "wrong-temp-123", newPassword: NEW_PASSWORD }));
    expect(wrongTemp.status).toBe(422);
    expect((await body(wrongTemp)).error.details.fields).toEqual({ tempPassword: "wrong" });
    const weak = await chooseNew(req("http://x", { token, tempPassword: temp, newPassword: "short" }));
    expect((await body(weak)).error.details.fields).toEqual({ newPassword: "weak" });
    expect((await chooseNew(req("http://x", { token, tempPassword: temp, newPassword: NEW_PASSWORD }))).status).toBe(204);

    expect((await login(req("http://x", { email: OWNER, password: NEW_PASSWORD }))).status).toBe(200);
    expect((await chooseNew(req("http://x", { token, tempPassword: temp, newPassword: NEW_PASSWORD }))).status).toBe(400); // the link works once
    expect(await body(await linkValid(req(`http://x?token=${token}`, undefined, "GET")))).toEqual({ valid: false });
  });
  it("404 for an unknown account; an unknown token is an invalid link", async () => {
    expect((await resetByAdmin(req("http://x"), idCtx("nobody"))).status).toBe(404);
    const res = await chooseNew(req("http://x", { token: "nope", tempPassword: "x", newPassword: NEW_PASSWORD }));
    expect(res.status).toBe(400);
    expect((await body(res)).error.code).toBe("INVALID_LINK");
  });
});

describe("the admin edits an account", () => {
  it("changes the name and the phone, never the email", async () => {
    const id = findAccountByEmail(OWNER)!.id;
    const res = await editUser(req("http://x", { fullName: "  Linh T.  ", phone: "+84 1", email: "other@example.com" }, "PATCH"), idCtx(id));
    expect(await body(res)).toMatchObject({ fullName: "Linh T.", phone: "+84 1", email: OWNER });
    expect((await editUser(req("http://x", { fullName: " " }, "PATCH"), idCtx(id))).status).toBe(422);
    expect((await editUser(req("http://x", { fullName: "x" }, "PATCH"), idCtx("nobody"))).status).toBe(404);
  });
});
