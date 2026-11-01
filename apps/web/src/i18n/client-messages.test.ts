import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AREA_MESSAGES, pickAreas } from "./client-messages";

const SRC = join(process.cwd(), "src");
const ROOT = join(SRC, "..");

describe("pickAreas", () => {
  const catalogue = { common: { a: "1" }, admin: { b: "2" }, builder: { c: "3" } };
  it("returns only the requested areas", () => {
    expect(pickAreas(catalogue, ["common", "admin"])).toEqual({ common: { a: "1" }, admin: { b: "2" } });
  });
  it("skips areas the catalogue does not have and never invents any", () => {
    expect(pickAreas(catalogue, ["common", "nope"])).toEqual({ common: { a: "1" } });
    expect(pickAreas({}, ["common"])).toEqual({});
  });
  it("returns an empty object for no areas and does not mutate the catalogue", () => {
    expect(pickAreas(catalogue, [])).toEqual({});
    expect(Object.keys(catalogue)).toEqual(["common", "admin", "builder"]);
  });
});

describe("message areas per part of the app", () => {
  const setsWith = (area: string) => Object.entries(AREA_MESSAGES).filter(([, areas]) => (areas as readonly string[]).includes(area)).map(([k]) => k);

  it("the admin texts go only to the admin area", () => expect(setsWith("admin")).toEqual(["admin"]));
  it("the shop owner tool texts go only to the shop owner area", () => {
    for (const a of ["dashboard", "ops", "catalog", "builder"]) expect(setsWith(a), a).toEqual(["shopowner"]);
  });
  it("marketing and auth texts go only to their own area", () => {
    expect(setsWith("marketing")).toEqual(["marketing"]);
    expect(setsWith("auth")).toEqual(["auth"]);
  });
  it("the public site texts are not part of any area set (the site has its own provider)", () => {
    expect(setsWith("site")).toEqual([]);
  });
  it("the root layout sends no messages itself", () => {
    const layout = readFileSync(join(SRC, "app/layout.tsx"), "utf8");
    expect(layout).toMatch(/<NextIntlClientProvider messages=\{\{\}\}>/);
    expect(layout).not.toMatch(/<NextIntlClientProvider>/);
  });
  it("every message area file exists for English", () => {
    const files = new Set(readdirSync(join(ROOT, "messages/en")).map((f) => f.replace(/\.json$/, "")));
    for (const areas of Object.values(AREA_MESSAGES)) for (const a of areas) expect(files.has(a), a).toBe(true);
  });
});

// Client components get only the areas of the provider above them. A component that asks for a namespace its area does not
// send would show raw keys, so each part of the code may only use the namespaces its area sends.
describe("client components only use the namespaces their area sends", () => {
  const PUBLIC_SITE = ["site"]; // components/site/SiteIntlProvider sends only `site`
  const MAP: [string, readonly string[]][] = [
    ["app/(auth)", AREA_MESSAGES.auth],
    ["app/(marketing)", AREA_MESSAGES.marketing],
    ["app/shopowner", AREA_MESSAGES.shopowner],
    ["app/systemadmin", AREA_MESSAGES.admin],
    ["app/sites", PUBLIC_SITE],
    ["components/admin", AREA_MESSAGES.admin],
    ["components/dashboard", AREA_MESSAGES.shopowner],
    ["components/ops", AREA_MESSAGES.shopowner],
    ["components/catalog", AREA_MESSAGES.shopowner],
    ["components/builder", AREA_MESSAGES.shopowner],
    ["components/language", AREA_MESSAGES.shopowner],
    ["components/sections", PUBLIC_SITE],
    ["components/site", PUBLIC_SITE],
    ["components/booking", PUBLIC_SITE],
  ];

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
    });
  }
  const isClient = (source: string) => /^\s*["']use client["']/.test(source);
  const usedNamespaces = (source: string) => [...source.matchAll(/useTranslations\(\s*["']([A-Za-z]+)[."']/g)].map((m) => m[1]!);

  it.each(MAP)("%s", (dir, allowed) => {
    const offenders: string[] = [];
    for (const f of files(join(SRC, dir))) {
      const source = readFileSync(f, "utf8");
      if (!isClient(source)) continue; // server components read the full catalogue on the server
      for (const ns of usedNamespaces(source)) {
        if (!(allowed as readonly string[]).includes(ns)) offenders.push(`${f.slice(SRC.length + 1).replace(/\\/g, "/")} uses "${ns}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the scan sees the client components it is meant to guard", () => {
    const seen = files(join(SRC, "components/builder")).filter((f) => {
      const source = readFileSync(f, "utf8");
      return isClient(source) && usedNamespaces(source).includes("builder");
    });
    expect(seen.length).toBeGreaterThan(5);
  });
});
