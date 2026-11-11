import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { clientKey } from "@/lib/client-ip";
import { readBodyText } from "@/lib/read-body";
import { login, resetAccountsStore } from "@/lib/mock/accounts-store";
import { resetAccountStatus } from "@/lib/mock/account-status";

const OWNER = "linh@whiskladle.example";
beforeEach(() => { resetAccountsStore(); resetAccountStatus(); });

describe("security fixes of the review", () => {
  it("the client of a request is the address the proxy appended (the last one), never the one the client wrote first", () => {
    const r = (h: Record<string, string>) => new Request("http://x", { headers: h });
    expect(clientKey(r({ "x-forwarded-for": "6.6.6.6, 10.0.0.7" }))).toBe("10.0.0.7");
    expect(clientKey(r({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientKey(r({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientKey(r({}))).toBe("local");
  });

  it("a body is read up to its limit only, even when it says nothing about its size (chunked)", async () => {
    const stream = (n: number) => new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < n; i++) c.enqueue(new Uint8Array(1000)); c.close(); } });
    const big = new Request("http://x", { method: "POST", body: stream(50), duplex: "half" } as RequestInit);
    expect(await readBodyText(big, 10_000)).toBeNull();
    expect(await readBodyText(new Request("http://x", { method: "POST", body: "{\"a\":1}" }), 100)).toBe("{\"a\":1}");
    expect(await readBodyText(new Request("http://x", { method: "POST", body: "x", headers: { "content-length": "999999" } }), 100)).toBeNull();
  });

  it("failures from one client do not lock the owner out on another client", () => {
    for (let i = 0; i < 5; i++) expect(login(OWNER, "wrong-password-1", 1_000, "6.6.6.6").ok).toBe(false);
    expect(login(OWNER, "wrong-password-1", 1_000, "6.6.6.6")).toEqual({ ok: false, code: "TOO_MANY_ATTEMPTS" });
    expect(login(OWNER, "wrong-password-1", 1_000, "10.0.0.7")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
  });

  it("security headers: no X-Powered-By, nosniff and a strict referrer everywhere, and the private areas cannot be framed by another site", () => {
    const config = readFileSync(join(__dirname, "..", "..", "..", "..", "next.config.ts"), "utf8");
    expect(config).toContain("poweredByHeader: false");
    expect(config).toContain('"X-Content-Type-Options", value: "nosniff"');
    expect(config).toContain("frame-ancestors 'self'");
    for (const area of ["/systemadmin/:path*", "/shopowner/:path*", "/customer/:path*"]) expect(config).toContain(area);
  });
});
