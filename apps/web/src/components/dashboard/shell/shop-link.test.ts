import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let pathname = "/shopowner/whiskladle/site/preview";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { ShopLink } = await import("./shop-link");
const html = (href: string) => renderToStaticMarkup(createElement(ShopLink, { href }, "x"));

describe("ShopLink renders the slug of the shop in the address, also on the server", () => {
  it("adds the slug of the current /shopowner/{slug} address", () => {
    expect(html("/shopowner/site/main")).toContain('href="/shopowner/whiskladle/site/main"');
    expect(html("/shopowner")).toContain('href="/shopowner/whiskladle"');
    expect(html("/shopowner/settings#languages")).toContain('href="/shopowner/whiskladle/settings#languages"');
  });
  it("leaves onboarding and other areas alone", () => {
    expect(html("/shopowner/onboarding")).toContain('href="/shopowner/onboarding"');
    expect(html("/systemadmin/reports")).toContain('href="/systemadmin/reports"');
  });
  it("does nothing outside the shop owner pages", () => {
    pathname = "/shopowner/onboarding";
    expect(html("/shopowner/bookings")).toContain('href="/shopowner/bookings"');
    pathname = "/login";
    expect(html("/shopowner/bookings")).toContain('href="/shopowner/bookings"');
  });
});
