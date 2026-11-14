import { describe, expect, it } from "vitest";
import { accountLinks, appOrigin } from "./site-url";

// (the platform domain of the tests is localtest.me, the development one)
describe("the address of the platform seen from a shop page", () => {
  it("keeps the development port of a platform host", () => {
    expect(appOrigin("whiskladle.localtest.me:3000")).toBe("http://app.localtest.me:3000");
    expect(appOrigin("localtest.me:3100")).toBe("http://app.localtest.me:3100");
    expect(appOrigin("localhost:3000")).toBe("http://app.localtest.me:3000");
    expect(appOrigin("app.localtest.me")).toBe("http://app.localtest.me");
  });

  it("gives no port for a shop's own domain (the port is not the one of the platform)", () => {
    expect(appOrigin("shop.example.com")).toBe("http://app.localtest.me");
    expect(appOrigin("shop.example.com:8443")).toBe("http://app.localtest.me");
    expect(appOrigin("")).toBe("http://app.localtest.me");
  });

  it("is not fooled by a host that only ends like the platform domain", () => {
    expect(appOrigin("evil-localtest.me:3000")).toBe("http://app.localtest.me");
  });

  it("makes the two popups of the platform: Log in, and Register for a customer only", () => {
    expect(accountLinks("whiskladle.localtest.me:3000")).toEqual({
      login: "http://app.localtest.me:3000/?auth=login",
      signup: "http://app.localtest.me:3000/?auth=signup&only=customer",
    });
  });
});
