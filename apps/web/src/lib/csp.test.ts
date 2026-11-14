import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "./csp";

const dir = (csp: string, name: string): string[] => (csp.split("; ").find((d) => d.startsWith(`${name} `) || d === name) ?? "").split(" ").slice(1);

describe("buildCsp", () => {
  const csp = buildCsp({ nonce: "abc123==", upgradeInsecure: true });

  it("runs only the scripts with the nonce (and what they load), never an inline script, and never eval in production", () => {
    expect(dir(csp, "script-src")).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'", "https://challenges.cloudflare.com"]);
    expect(csp).not.toContain("unsafe-eval");
    expect(dir(csp, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("forbids plugins, a changed base, a form that goes elsewhere and a frame of another site; allows the bot check and the video player only", () => {
    expect(dir(csp, "object-src")).toEqual(["'none'"]);
    expect(dir(csp, "base-uri")).toEqual(["'self'"]);
    expect(dir(csp, "form-action")).toEqual(["'self'"]);
    expect(dir(csp, "frame-ancestors")).toEqual(["'self'"]);
    expect(dir(csp, "frame-src")).toEqual(["https://challenges.cloudflare.com", "https://www.youtube-nocookie.com"]);
    expect(dir(csp, "default-src")).toEqual(["'self'"]);
    expect(csp.split("; ")).toContain("upgrade-insecure-requests");
  });

  it("lets images come from https (the shop writes the address of its pictures) and keeps connections to the app and the bot check", () => {
    expect(dir(csp, "img-src")).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https:"]));
    expect(dir(csp, "connect-src")).toEqual(["'self'", "https://challenges.cloudflare.com"]);
    expect(csp).not.toMatch(/http:(?!\/)/); // no plain http source
  });

  it("opens only what development needs, and an API on another origin", () => {
    const dev = buildCsp({ nonce: "n", dev: true });
    expect(dir(dev, "script-src")).toContain("'unsafe-eval'");
    expect(dir(dev, "connect-src")).toEqual(expect.arrayContaining(["ws:", "wss:"]));
    expect(dev.split("; ")).not.toContain("upgrade-insecure-requests");
    expect(dir(buildCsp({ nonce: "n", apiOrigin: "https://api.example.com" }), "connect-src")).toContain("https://api.example.com");
    expect(dir(buildCsp({ nonce: "n", mediaOrigin: "https://cdn.example.com" }), "img-src")).toContain("https://cdn.example.com");
    // the browser uploads an image to the storage address: that one origin is let through, no other
    expect(dir(buildCsp({ nonce: "n", uploadOrigin: "https://acct.r2.cloudflarestorage.com" }), "connect-src")).toEqual(["'self'", "https://challenges.cloudflare.com", "https://acct.r2.cloudflarestorage.com"]);
  });

  it("makes a different nonce for every request, of 128 bits", () => {
    const a = newNonce();
    expect(a).not.toBe(newNonce());
    expect(atob(a)).toHaveLength(16);
  });
});
