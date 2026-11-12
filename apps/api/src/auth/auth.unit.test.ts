import { describe, expect, it } from "vitest";
import { withoutSecrets } from "../audit/audit.service";
import { RateLimiter } from "../common/limiter";
import { escapeHtml, renderEmail } from "../email/templates";
import { parseCookies, sessionCookie } from "./cookies";
import { hashPassword, hashToken, newToken, safeEqual, verifyPassword } from "./crypto";
import { emailOnlySchema, loginSchema, signupSchema } from "./auth.schemas";

describe("passwords and tokens", () => {
  it("hashes with argon2id, with a salt (the same password gives two hashes), and verifies", async () => {
    const [a, b] = await Promise.all([hashPassword("correct horse battery"), hashPassword("correct horse battery")]);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("correct horse");
    expect(await verifyPassword(a, "correct horse battery")).toBe(true);
    expect(await verifyPassword(a, "Correct horse battery")).toBe(false);
    expect(await verifyPassword("not a hash", "x")).toBe(false); // a broken hash is "no", not an error
  });

  it("makes long random tokens and stores only their hash", () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/); // 256 bits
    expect(newToken()).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });

  it("compares strings in constant time (and different lengths are just different)", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("cookies", () => {
  it("reads the cookies of a request (the first value of a name wins, a broken value is skipped)", () => {
    expect(parseCookies("a=1; wsp_sid=abc%20d; b=%E0%A4%A; a=2")).toEqual({ a: "1", wsp_sid: "abc d" });
    expect(parseCookies(undefined)).toEqual({});
  });

  it("writes the session cookie HttpOnly and SameSite=Lax, Secure over https, and removes it with Max-Age 0", () => {
    const dev = sessionCookie("wsp_sid", "tok", { maxAgeSeconds: 3600, secure: false });
    expect(dev).toBe("wsp_sid=tok; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600");
    expect(sessionCookie("wsp_sid", "tok", { secure: true })).toContain("; Secure");
    expect(sessionCookie("wsp_sid", "", { maxAgeSeconds: 0, secure: false })).toContain("Max-Age=0");
  });
});

describe("the rate limiter", () => {
  it("blocks after the limit, says how long to wait, and forgets after the window", () => {
    const l = new RateLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) { expect(l.retryAfter("k", 1_000)).toBe(0); l.hit("k", 1_000); }
    expect(l.retryAfter("k", 1_000)).toBe(60);
    expect(l.retryAfter("k", 31_000)).toBe(30);
    expect(l.retryAfter("other", 1_000)).toBe(0);
    expect(l.retryAfter("k", 61_001)).toBe(0);
    l.hit("k", 70_000); l.reset("k");
    expect(l.retryAfter("k", 70_000)).toBe(0);
  });
});

describe("the bodies of the auth endpoints", () => {
  it("trims and lowercases the email and the shop name", () => {
    const parsed = signupSchema.parse({ type: "SHOP_OWNER", email: "  Maker@Example.COM ", password: "x", confirmPassword: "x", shopName: "  Clay & Co  " });
    expect(parsed).toMatchObject({ email: "maker@example.com", shopName: "Clay & Co" });
    expect(loginSchema.parse({ email: " A@B.co ", password: "p" }).email).toBe("a@b.co");
  });

  it("refuses a wrong email, a missing shop name and an unknown type", () => {
    expect(emailOnlySchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(signupSchema.safeParse({ type: "SHOP_OWNER", email: "a@b.co", password: "x", confirmPassword: "x" }).success).toBe(false);
    expect(signupSchema.safeParse({ type: "ADMIN", email: "a@b.co", password: "x", confirmPassword: "x" }).success).toBe(false);
  });
});

describe("emails", () => {
  it("escapes what a person typed", () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
    const mail = renderEmail({ name: "verify-email", to: "a@b.co", data: { name: "<script>alert(1)</script>", link: "https://app.example.com/verify-email?token=abc", hours: 48 } });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.text).toContain("https://app.example.com/verify-email?token=abc");
  });
});

describe("the audit log never holds a secret", () => {
  it("drops the keys that look like secrets, at any depth", () => {
    const clean = withoutSecrets({ status: "ACTIVE", password: "p", nested: { apiKey: "k", resetToken: "t", ok: 1 }, list: [{ tokenHash: "h", name: "n" }], cookie: "c" });
    expect(clean).toEqual({ status: "ACTIVE", nested: { ok: 1 }, list: [{ name: "n" }] });
  });
});
