import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import type { Locale } from "@workshop/shared";
import builder from "../../../messages/en/builder.json";
import catalog from "../../../messages/en/catalog.json";
import common from "../../../messages/en/common.json";
import ops from "../../../messages/en/ops.json";
import { workshops } from "@/lib/mock/data";
import { WorkshopForm } from "@/components/catalog/workshop-form";
import { LanguageBar } from "./LanguageBar";

const messages = { builder, catalog, common, ops };
const Provider = NextIntlClientProvider as unknown as ComponentType<{ locale: string; messages: typeof messages; children?: ReactNode }>;
const render = (node: ReactNode) => renderToStaticMarkup(createElement(Provider, { locale: "en", messages }, node));

const NAMES: Record<Locale, string> = { en: "English", vi: "Vietnamese", ko: "Korean", ja: "Japanese", zh: "Chinese" };
const offered = (html: string) => (Object.keys(NAMES) as Locale[]).filter((l) => html.includes(`>${NAMES[l]}`));

describe("language bar follows the shop's language setting", () => {
  const bar = (enabled: Locale[], value: Locale = "en", defaultLocale: Locale = "en") =>
    render(createElement(LanguageBar, { value, onChange: () => {}, enabled, defaultLocale, missingByLocale: {} }));

  it("offers exactly the enabled languages", () => {
    expect(offered(bar(["en", "vi"]))).toEqual(["en", "vi"]);
    expect(offered(bar(["en", "ko", "zh"]))).toEqual(["en", "ko", "zh"]);
    expect(offered(bar(["en", "vi", "ko", "ja", "zh"]))).toHaveLength(5);
  });
  it("a single-language shop gets a single chip", () => {
    expect(offered(bar(["ja"], "ja", "ja"))).toEqual(["ja"]);
  });
  it("marks the default language and the selected one", () => {
    const html = bar(["en", "vi"], "vi", "en");
    expect(html).toContain("(default)");
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  });
  it("shows how many texts are missing per language", () => {
    const html = render(createElement(LanguageBar, { value: "en", onChange: () => {}, enabled: ["en", "vi"], defaultLocale: "en", missingByLocale: { vi: 7 } }));
    expect(html).toMatch(/<span aria-label="[^"]+">7<\/span>/);
    // English has nothing missing, so only Vietnamese carries a counter.
    expect(html.match(/lucide-triangle-alert/g)).toHaveLength(1);
  });
});

describe("workshop form follows the shop's language setting", () => {
  const form = (enabledLocales: Locale[], defaultLocale: Locale = "en") =>
    render(createElement(WorkshopForm, {
      workshop: workshops[0], bookingCount: 0,
      shop: { currency: "VND", timezone: "Asia/Ho_Chi_Minh", defaultLocale, enabledLocales },
    }));
  const fieldLangs = (html: string) => [...new Set([...html.matchAll(/<(?:input|textarea)[^>]*\blang="([a-z-]+)"/g)].map((m) => m[1]))];

  it("shows the fields of one language only: the default language first", () => {
    expect(fieldLangs(form(["en", "vi", "ko"]))).toEqual(["en"]);
    expect(fieldLangs(form(["en", "vi", "ko"], "vi"))).toEqual(["vi"]);
  });
  it("never offers or shows a language the shop turned off", () => {
    const html = form(["en", "vi"]);
    expect(offered(html)).toEqual(["en", "vi"]);
    expect(html).not.toContain('lang="ko"');
    expect(html).not.toContain('lang="ja"');
    expect(html).not.toContain('lang="zh"');
    expect(html).not.toContain("(disabled)");
  });
  it("a single-language shop only has that language's fields and no other chip", () => {
    const html = form(["ko"], "ko");
    expect(offered(html)).toEqual(["ko"]);
    expect(fieldLangs(html)).toEqual(["ko"]);
  });
  it("only the title in the default language is required; the other texts are optional", () => {
    const html = form(["en", "vi"]);
    const tag = (id: string) => html.match(new RegExp(`<(?:input|textarea)[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
    expect(tag("title-en")).toContain('aria-required="true"');
    for (const id of ["short-en", "desc-en", "inc-en", "notes-en"]) {
      expect(tag(id), id).not.toBe("");
      expect(tag(id), id).not.toContain("aria-required");
    }
  });
});
