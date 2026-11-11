import { describe, expect, it } from "vitest";
import { checkCustomDomain } from "./custom-domain";

const P = "workshopkit.com";
const ok = (input: string) => { const r = checkCustomDomain(input, P); return r.ok ? r.domain : r.error; };

describe("checkCustomDomain", () => {
  it("accepts a host name, cleaned: trimmed, lower case", () => {
    expect(ok("  Class.MyStudio.com ")).toBe("class.mystudio.com");
    expect(ok("mystudio.vn")).toBe("mystudio.vn");
    expect(ok("www.my-studio.co.uk")).toBe("www.my-studio.co.uk");
  });

  it("cleans a pasted address: the scheme, a path, a query, a port and a trailing dot are taken away", () => {
    expect(ok("https://www.mystudio.com/")).toBe("www.mystudio.com");
    expect(ok("http://mystudio.com/workshops?x=1#top")).toBe("mystudio.com");
    expect(ok("mystudio.com:8443")).toBe("mystudio.com");
    expect(ok("mystudio.com.")).toBe("mystudio.com");
  });

  it("an empty value is allowed: no own domain", () => {
    expect(ok("")).toBe("");
    expect(ok("   ")).toBe("");
  });

  it("converts an international name to punycode and accepts punycode", () => {
    expect(ok("xn--bcher-kva.example")).toBe("xn--bcher-kva.example");
    expect(ok("bücher.example")).toBe("xn--bcher-kva.example");
  });

  it("rejects what is not a host name", () => {
    for (const bad of ["localhost", "mystudio", "my studio.com", "-bad.com", "bad-.com", "a..com", "mystudio.c", "mystudio.123", "10.0.0.1", "user@mystudio.com", "https://", "_x.com", "a".repeat(64) + ".com", `${"a.".repeat(130)}com`]) {
      expect(ok(bad), bad).toBe("INVALID");
    }
  });

  it("rejects the domain of the platform and its subdomains", () => {
    expect(ok("workshopkit.com")).toBe("PLATFORM");
    expect(ok("whiskladle.workshopkit.com")).toBe("PLATFORM");
    expect(ok("https://APP.workshopkit.com/")).toBe("PLATFORM");
    expect(ok("notworkshopkit.com")).toBe("notworkshopkit.com");
  });
});
