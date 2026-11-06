import { beforeEach, describe, expect, it } from "vitest";
import { resetAccountStatus } from "./account-status";
import { completePasswordReset, DEMO_PASSWORD, findAccountByEmail, listAccounts, login, resetAccountsStore, resetLinkValid, setPassword, setStatusByAdmin, startPasswordReset, updateAccount } from "./accounts-store";
import { registerGuestAccount, resetBookingStore } from "./booking-store";
import { outboxEmails } from "./outbox-store";

const OWNER = "linh@whiskladle.example";
const NEW_PASSWORD = "A-new-secret-2026";

beforeEach(() => {
  resetAccountsStore();
  resetAccountStatus();
  resetBookingStore();
});

/** The temporary password and the token of the last reset email: they exist only in its text. */
function lastReset(): { temp: string; token: string; to: string } {
  const e = outboxEmails().filter((x) => x.type === "PASSWORD_RESET").at(-1)!;
  const temp = /Temporary password[^A-Za-z0-9]+([A-Za-z0-9]{14})\b/.exec(e.text)![1]!;
  const token = /reset-password\?token=([\w-]+)/.exec(e.text)![1]!;
  return { temp, token, to: e.to };
}
const url = (t: string) => `http://app.localtest.me:3000/reset-password?token=${t}`;

describe("accounts", () => {
  it("lists the shop owners and the customers with an account, each with its type", () => {
    registerGuestAccount({ email: "Mai@Example.com", fullName: "Mai Nguyen", country: "VN", birthDate: "1995-05-05", categories: ["COOKING"] });
    const all = listAccounts();
    expect(all.filter((a) => a.type === "SHOP_OWNER").map((a) => a.email)).toContain(OWNER);
    expect(all.find((a) => a.email === "mai@example.com")?.type).toBe("CUSTOMER");
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
  });

  it("edits the name and phone only", () => {
    const id = findAccountByEmail(OWNER)!.id;
    expect(updateAccount(id, { fullName: "Linh T.", phone: "+84 1" })).toBe(true);
    expect(findAccountByEmail(OWNER)).toMatchObject({ fullName: "Linh T.", phone: "+84 1", email: OWNER });
    expect(updateAccount("nope", { fullName: "x" })).toBe(false);
  });
});

describe("login", () => {
  it("accepts the demo password, then the one the person chose", () => {
    expect(login(` ${OWNER.toUpperCase()} `, DEMO_PASSWORD)).toMatchObject({ ok: true });
    expect(setPassword(findAccountByEmail(OWNER)!.id, NEW_PASSWORD)).toBe(true);
    expect(login(OWNER, DEMO_PASSWORD)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(login(OWNER, NEW_PASSWORD)).toMatchObject({ ok: true });
  });

  it("gives the same answer for an unknown email and a wrong password, and refuses a password that is too short", () => {
    expect(login("nobody@example.com", DEMO_PASSWORD)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(login(OWNER, "wrong")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(setPassword(findAccountByEmail(OWNER)!.id, "short")).toBe(false);
  });

  it("locks the email for 15 minutes after 5 failures", () => {
    const t = Date.now();
    for (let i = 0; i < 5; i++) login(OWNER, "wrong-password", t);
    expect(login(OWNER, DEMO_PASSWORD, t + 1000)).toEqual({ ok: false, code: "TOO_MANY_ATTEMPTS" });
    expect(login(OWNER, DEMO_PASSWORD, t + 16 * 60_000)).toMatchObject({ ok: true });
  });

  it("tells a deactivated account only after the right password", () => {
    const id = findAccountByEmail(OWNER)!.id;
    setStatusByAdmin(id, "DEACTIVATED");
    expect(login(OWNER, "wrong-password")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(login(OWNER, DEMO_PASSWORD)).toEqual({ ok: false, code: "DEACTIVATED" });
    setStatusByAdmin(id, "ACTIVE");
    expect(login(OWNER, DEMO_PASSWORD)).toMatchObject({ ok: true });
  });
});

describe("reset of the password", () => {
  it("deactivates the account and emails the temporary password with the link; the person then chooses a new password", () => {
    const id = findAccountByEmail(OWNER)!.id;
    const res = startPasswordReset(id, url);
    expect(res.ok).toBe(true);
    expect(JSON.stringify(res)).not.toMatch(/token|temp/i); // the secrets are never returned
    expect(findAccountByEmail(OWNER)).toMatchObject({ status: "DEACTIVATED", deactivationReason: "PASSWORD_RESET" });
    const { temp, token, to } = lastReset();
    expect(to).toBe(OWNER);
    expect(resetLinkValid(token)).toBe(true);
    expect(login(OWNER, DEMO_PASSWORD)).toEqual({ ok: false, code: "DEACTIVATED" });
    expect(completePasswordReset(token, temp, NEW_PASSWORD)).toEqual({ ok: true });
    expect(findAccountByEmail(OWNER)!.status).toBe("ACTIVE");
    expect(login(OWNER, NEW_PASSWORD)).toMatchObject({ ok: true });
    expect(login(OWNER, temp)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
  });

  it("works once, and a new reset replaces the earlier one", () => {
    const id = findAccountByEmail(OWNER)!.id;
    startPasswordReset(id, url);
    const first = lastReset();
    startPasswordReset(id, url);
    const second = lastReset();
    expect(completePasswordReset(first.token, first.temp, NEW_PASSWORD)).toEqual({ ok: false, code: "INVALID_LINK" });
    expect(completePasswordReset(second.token, second.temp, NEW_PASSWORD)).toEqual({ ok: true });
    expect(completePasswordReset(second.token, second.temp, NEW_PASSWORD)).toEqual({ ok: false, code: "INVALID_LINK" });
  });

  it("checks the temporary password, the new password and the expiry", () => {
    startPasswordReset(findAccountByEmail(OWNER)!.id, url);
    const { temp, token } = lastReset();
    expect(completePasswordReset(token, "not-the-temp-1", NEW_PASSWORD)).toEqual({ ok: false, code: "WRONG_TEMP_PASSWORD" });
    expect(completePasswordReset(token, temp, "short")).toEqual({ ok: false, code: "WEAK_PASSWORD" });
    expect(completePasswordReset(token, temp, `${temp}x`)).toMatchObject({ ok: true }); // a new password may start like the temporary one, just not equal it
    startPasswordReset(findAccountByEmail(OWNER)!.id, url);
    const again = lastReset();
    expect(completePasswordReset(again.token, again.temp, again.temp)).toEqual({ ok: false, code: "SAME_PASSWORD" });
    expect(completePasswordReset(again.token, again.temp, NEW_PASSWORD, Date.now() + 4 * 86_400_000)).toEqual({ ok: false, code: "INVALID_LINK" });
  });

  it("burns the link after 5 wrong temporary passwords", () => {
    startPasswordReset(findAccountByEmail(OWNER)!.id, url);
    const { temp, token } = lastReset();
    for (let i = 0; i < 4; i++) expect(completePasswordReset(token, "wrong-temp-0", NEW_PASSWORD)).toEqual({ ok: false, code: "WRONG_TEMP_PASSWORD" });
    expect(completePasswordReset(token, "wrong-temp-0", NEW_PASSWORD)).toEqual({ ok: false, code: "INVALID_LINK" });
    expect(completePasswordReset(token, temp, NEW_PASSWORD)).toEqual({ ok: false, code: "INVALID_LINK" });
  });

  it("is dropped when an administrator activates or deactivates the account after it", () => {
    const id = findAccountByEmail(OWNER)!.id;
    startPasswordReset(id, url);
    const { temp, token } = lastReset();
    setStatusByAdmin(id, "ACTIVE");
    expect(completePasswordReset(token, temp, NEW_PASSWORD)).toEqual({ ok: false, code: "INVALID_LINK" });
  });

  it("keeps the secrets out of the list of the outbox", () => {
    startPasswordReset(findAccountByEmail(OWNER)!.id, url);
    const { temp, token } = lastReset();
    const { html: _h, text: _t, ...visible } = outboxEmails().filter((x) => x.type === "PASSWORD_RESET").at(-1)!;
    void _h; void _t;
    expect(JSON.stringify(visible)).not.toContain(temp);
    expect(JSON.stringify(visible)).not.toContain(token);
  });
});
