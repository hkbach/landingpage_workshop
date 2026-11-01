import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The platform support contact (WhatsApp, Phone, Zalo, Email) is for shop owners to reach the platform admin team.
// It is unrelated to the shop's own contact details and must never reach the shop's landing page or any public page.

const SRC = join(process.cwd(), "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}
const rel = (p: string) => p.slice(SRC.length + 1).replace(/\\/g, "/");
const read = (p: string) => readFileSync(p, "utf8");

/** Everything that renders or serves the landing page or another page seen by travellers. */
const PUBLIC_AREAS = ["components/sections", "components/site", "components/booking", "app/sites"];
const SUPPORT_IDENTIFIERS = /support-contact|mock\/platform|SupportContactBox|platformSupport|SupportContact\b/;

describe("platform support contact stays out of the public landing page", () => {
  const all = files(SRC);

  it("no landing page, public site or booking file uses the support contact code or data", () => {
    const offenders = all.filter((f) => PUBLIC_AREAS.some((a) => rel(f).startsWith(a + "/")) && SUPPORT_IDENTIFIERS.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("only the shop owner builder (and its page) use it", () => {
    const users = all.filter((f) => SUPPORT_IDENTIFIERS.test(read(f))).map(rel).filter((f) => f !== "lib/support-contact.ts" && f !== "lib/mock/platform.ts");
    expect(users.sort()).toEqual([
      "app/shopowner/[slug]/site/[pageId]/page.tsx",
      "components/builder/SiteBuilder.tsx",
      "components/builder/SupportContactBox.tsx",
    ]);
  });

  it("the page content and the shop model have no support contact field", () => {
    const types = read(join(SRC, "lib/types.ts"));
    expect(types).not.toMatch(/support|zalo/i);
    expect(read(join(SRC, "components/sections/instance.ts"))).not.toMatch(/support|zalo/i);
  });

  it("the shop's own contact data does not come from the platform settings", () => {
    const platform = read(join(SRC, "lib/mock/platform.ts"));
    expect(platform).not.toMatch(/currentShop|shops\b|contactEmail|contactPhone/);
  });

  it("the contact section of the landing page only offers the shop's own phone, WhatsApp and email", () => {
    const registry = read(join(SRC, "components/sections/registry.ts"));
    const contact = registry.slice(registry.indexOf("contact: {"), registry.indexOf("video: {"));
    expect(contact).toMatch(/phone/);
    expect(contact).not.toMatch(/zalo|support/i);
  });
});
