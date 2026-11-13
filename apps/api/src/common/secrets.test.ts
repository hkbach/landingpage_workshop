import { describe, expect, it } from "vitest";
import { Secrets } from "./secrets";

const A = new Secrets("a".repeat(40));
const B = new Secrets("b".repeat(40));

describe("Secrets", () => {
  it("makes a keyed hash that depends on the secret and on the purpose", () => {
    expect(A.hmac("otp", "id:123456")).toMatch(/^[0-9a-f]{64}$/);
    expect(A.hmac("otp", "id:123456")).toBe(A.hmac("otp", "id:123456"));
    expect(A.hmac("otp", "id:123456")).not.toBe(B.hmac("otp", "id:123456")); // another secret: another hash (a copy of the database is not enough)
    expect(A.hmac("otp", "id:123456")).not.toBe(A.hmac("other", "id:123456"));
  });

  it("encrypts and decrypts, with a new iv each time, and keeps an empty value empty", () => {
    const one = A.encrypt("bank-account", "012345678901");
    expect(one).toMatch(/^enc:v1:/);
    expect(one).not.toContain("0123");
    expect(A.encrypt("bank-account", "012345678901")).not.toBe(one);
    expect(A.decrypt("bank-account", one)).toBe("012345678901");
    expect(A.encrypt("bank-account", "")).toBe("");
    expect(A.isEncrypted(one)).toBe(true);
    expect(A.isEncrypted("012345678901")).toBe(false);
  });

  it("reads a value written before the encryption as it is, and refuses a changed text, another secret or another purpose", () => {
    expect(A.decrypt("bank-account", "012345678901")).toBe("012345678901");
    const one = A.encrypt("bank-account", "012345678901");
    expect(() => B.decrypt("bank-account", one)).toThrow();
    expect(() => A.decrypt("other", one)).toThrow();
    const [iv, tag, body] = one.slice("enc:v1:".length).split(":");
    expect(() => A.decrypt("bank-account", `enc:v1:${iv}:${tag}:${body!.slice(0, -2)}AA`)).toThrow();
    expect(() => A.decrypt("bank-account", "enc:v1:broken")).toThrow(/Malformed/);
  });
});
