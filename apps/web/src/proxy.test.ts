import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

// Host routing: a shop's host is rewritten to /sites/{slug}; the system admin area is only served on the platform's own hosts.

const run = (url: string) => proxy(new NextRequest(url, { headers: { host: new URL(url).host } }));
const rewrittenTo = (res: Response) => res.headers.get("x-middleware-rewrite");

describe("proxy", () => {
  it("rewrites a shop's host to its site", () => {
    expect(rewrittenTo(run("http://whiskladle.localtest.me/ja"))).toBe("http://whiskladle.localtest.me/sites/whiskladle/ja");
  });
  it("serves the system admin area on the platform hosts", () => {
    for (const url of ["http://localtest.me/systemadmin", "http://app.localtest.me/systemadmin/organizations", "http://localhost:3000/systemadmin"]) {
      const res = run(url);
      expect(rewrittenTo(res), url).toBeNull();
      expect(res.headers.get("x-middleware-request-x-ui-area"), url).toBe("systemadmin");
    }
  });
  it("never serves the system admin area on a shop's host: it is a page of the shop site", () => {
    const res = run("http://whiskladle.localtest.me/systemadmin");
    expect(rewrittenTo(res)).toBe("http://whiskladle.localtest.me/sites/whiskladle/systemadmin");
    expect(res.headers.get("x-middleware-request-x-ui-area")).toBeNull();
  });
});
