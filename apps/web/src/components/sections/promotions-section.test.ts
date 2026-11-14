import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { PromotionRecord } from "@workshop/shared";
import site from "../../../messages/en/site.json";
import ops from "../../../messages/en/ops.json";
import { createSection, ADDABLE_TYPES, isBookButtonShown } from "./registry";
import type { RenderContext } from "./context";
import { SectionRenderer } from "./SectionRenderer";
import { PageRenderer } from "./PageRenderer";
import { splitSections } from "./frames/logic";
import { TEMPLATES, TEMPLATE_KEYS } from "./templates";
import { sitePage, workshops } from "@/lib/sample/data";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font-stub", className: "font-stub", style: { fontFamily: "stub" } });
  return { Inter: font, Lora: font, Noto_Sans: font, Noto_Serif: font, Poppins: font };
});

const Provider = NextIntlClientProvider as unknown as ComponentType<{ locale: string; timeZone: string; messages: { site: typeof site }; children?: ReactNode }>;
const render = (node: ReactNode) => renderToStaticMarkup(createElement(Provider, { locale: "en", timeZone: "UTC", messages: { site } }, node));

const promo = (over: Partial<PromotionRecord> = {}): PromotionRecord => ({
  id: "pr-x", title: { en: "Early bird" }, description: { en: "Book early and save." }, discountType: "PERCENT", discountValue: 20, code: "EARLY20",
  stacking: "SINGLE", appliesTo: "ALL", workshopIds: [], startDate: "2026-11-01", endDate: "2026-11-30", enabled: true, createdAt: "", updatedAt: "", ...over,
});
const ctx = (promotions: PromotionRecord[]): RenderContext => ({
  locale: "en", shop: { name: "Shop", defaultLocale: "en", enabledLocales: ["en"], timezone: "UTC", currency: "VND" },
  workshops: workshops.filter((w) => w.status === "ACTIVE"), promotions, reportHref: "/report", privacyHref: "#",
});
const section = createSection("promotions");
const html = (promotions: PromotionRecord[], variant?: string) =>
  render(createElement(SectionRenderer, { section: variant ? { ...section, variant } : section, ctx: ctx(promotions), theme: sitePage.theme }));

describe("promotions section", () => {
  it("shows each promotion with its discount, text, validity, scope and code", () => {
    const out = html([promo()]);
    for (const text of ["Special offers", "Early bird", "Book early and save.", "20% off", "Valid until Nov 30, 2026", "Applies to: All workshops", "EARLY20"]) expect(out).toContain(text);
  });
  it("writes a fixed amount in the shop currency and names the workshops it covers", () => {
    const out = html([promo({ discountType: "FIXED_AMOUNT", discountValue: 100_000, appliesTo: "SELECTED", workshopIds: ["ws-2"], code: undefined })]);
    expect(out).toContain("100,000");
    expect(out).toContain("Applies to: Decorate Your Cupcakes");
    expect(out).not.toContain("Code:");
  });
  it("has two layouts that both show every promotion", () => {
    for (const v of ["cards", "banner"]) {
      const out = html([promo(), promo({ id: "pr-y", title: { en: "Second offer" } })], v);
      expect(out, v).toContain("Early bird");
      expect(out, v).toContain("Second offer");
    }
  });
  it("draws nothing without an active promotion", () => {
    const out = html([]);
    expect(out).not.toContain("Special offers");
    expect(out).not.toContain("<h2");
  });
  it("shows shop text as plain text", () => {
    expect(html([promo({ title: { en: "<b>bold</b>" } })])).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });
  it("falls back to the default language when the guest's language has no text", () => {
    const out = render(createElement(SectionRenderer, { section, ctx: { ...ctx([promo({ title: { en: "Early bird" } })]), locale: "vi" }, theme: sitePage.theme }));
    expect(out).toContain("Early bird");
  });
});

describe("promotion image and booking rule note", () => {
  it("shows the promotion image: an https image or one the platform serves", () => {
    for (const url of ["https://cdn.example.com/p.webp", "/api/v1/media/promotions/3f2c9a10-aaaa-bbbb-cccc-000000000000"]) {
      for (const v of ["cards", "banner"]) expect(html([promo({ imageUrl: url })], v), `${v} ${url}`).toContain(`src="${url}"`);
    }
  });
  it("shows no image when there is none or the address is not safe to show", () => {
    expect(html([promo()])).not.toContain("<img");
    for (const bad of ["http://cdn.example.com/p.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "/etc/passwd"]) expect(html([promo({ imageUrl: bad })]), bad).not.toContain("<img");
  });
  it("tells guests, for each promotion, whether it can be combined with others", () => {
    const out = html([promo({ id: "a", title: { en: "Alone" }, stacking: "SINGLE" }), promo({ id: "b", title: { en: "Together" }, stacking: "MULTIPLE" })]);
    expect(out.match(/Cannot be combined with other promotions/g)).toHaveLength(1);
    expect(out.match(/Can be combined with other promotions/g)).toHaveLength(1);
    expect(out.indexOf("Alone")).toBeLessThan(out.indexOf("Cannot be combined"));
    expect(out.indexOf("Together")).toBeLessThan(out.indexOf("Can be combined with"));
  });
});

describe("promotions section in the page", () => {
  const page = (promotions: PromotionRecord[]) =>
    render(createElement(PageRenderer, { content: sitePage.draft, theme: sitePage.theme, ctx: ctx(promotions) }));
  it("is part of every template, and appears on the page only while a promotion is active", () => {
    for (const k of TEMPLATE_KEYS) expect(TEMPLATES[k].sections.some((s) => s.type === "promotions"), k).toBe(true);
    expect(sitePage.draft.sections.some((s) => s.type === "promotions")).toBe(true);
    expect(page([promo()])).toContain("Early bird");
    expect(page([])).not.toContain("Special offers");
  });
  it("leaves the page unchanged for the footer and the other sections", () => {
    expect(splitSections(sitePage.draft.sections).footer.type).toBe("footer");
  });
});

describe("registry", () => {
  it("can be added by the shop owner and has no Book button unless chosen", () => {
    expect(ADDABLE_TYPES).toContain("promotions");
    expect(isBookButtonShown({ type: "promotions" })).toBe(false);
    expect(isBookButtonShown({ type: "promotions", showBook: true })).toBe(true);
  });
});

describe("management page texts", () => {
  const t = ops.promotions as Record<string, unknown> & { status: Record<string, string>; type: Record<string, string>; errors: Record<string, string> };
  it("has a label for every status, discount type and error code", () => {
    for (const s of ["ACTIVE", "SCHEDULED", "PAUSED", "EXPIRED"]) expect(t.status[s], s).toBeTruthy();
    for (const d of ["PERCENT", "FIXED_AMOUNT"]) expect(t.type[d], d).toBeTruthy();
    for (const c of ["titleRequired", "tooLong", "required", "valueInvalid", "percentTooHigh", "codeInvalid", "workshopRequired", "workshopUnknown", "dateInvalid", "endBeforeStart"]) expect(t.errors[c], c).toBeTruthy();
  });
});
