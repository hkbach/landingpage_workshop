import { createElement, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import site from "../../../messages/en/site.json";
import { ReportActionsContext } from "@/components/sections/report-context";
import type { RenderContext } from "@/components/sections/context";
import { createSection } from "@/components/sections/registry";
import { SectionRenderer } from "@/components/sections/SectionRenderer";
import { sitePage } from "@/lib/mock/data";
import { buildReportsQuery } from "@/lib/reports-api";
import { ReportForm } from "./ReportForm";
import { ReportProvider } from "./ReportProvider";

// next/font only works inside the Next build; here every font is a stand-in with the same shape.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font-stub", className: "font-stub", style: { fontFamily: "stub" } });
  return { Inter: font, Lora: font, Noto_Sans: font, Noto_Serif: font, Poppins: font };
});

const Provider = NextIntlClientProvider as unknown as ComponentType<{ locale: string; messages: { site: typeof site }; children?: ReactNode }>;
const render = (node: ReactNode) => renderToStaticMarkup(createElement(Provider, { locale: "en", messages: { site } }, node));

const ctx: RenderContext = {
  locale: "en",
  shop: { name: "Shop", defaultLocale: "en", enabledLocales: ["en"], timezone: "UTC", currency: "VND" },
  workshops: [], reportHref: "/report", privacyHref: "#privacy",
};
const footer = createSection("footer");
const renderFooter = (open: (() => void) | null) =>
  render(createElement(ReportActionsContext.Provider, { value: { open } }, createElement(SectionRenderer, { section: footer, ctx, theme: sitePage.theme })));
const reportLink = (html: string) => html.match(/<a[^>]*href="\/report"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";

describe("the footer link 'Report this site'", () => {
  it("opens the popup where one exists: it announces a dialog and keeps the page as its fallback href", () => {
    const link = reportLink(renderFooter(vi.fn()));
    expect(link).toContain("Report this site");
    expect(link).toContain('aria-haspopup="dialog"');
    expect(link).toContain('href="/report"');
  });
  it("stays a plain link to the report page where there is no popup", () => {
    const link = reportLink(renderFooter(null));
    expect(link).toContain("Report this site");
    expect(link).not.toContain("aria-haspopup");
  });
});

describe("ReportForm", () => {
  const form = (props: Partial<Parameters<typeof ReportForm>[0]> = {}) => render(createElement(ReportForm, { slug: "clayco", ...props }));

  it("has labelled reason, description and email fields, the Turnstile placeholder and a submit button", () => {
    const html = form({ variant: "dialog" });
    for (const label of ["Reason", "Description", "Your email (optional)"]) expect(html).toContain(label);
    expect(html).toContain("data-turnstile-placeholder");
    expect(html).toContain("Send report");
    for (const r of ["Scam or fraud", "Phishing", "Inappropriate content", "Other"]) expect(html).toContain(r);
    expect(html).toContain('aria-required="true"');
  });
  it("the page variant has its own heading, the popup variant leaves the heading to the dialog and offers Cancel", () => {
    expect(form({ variant: "page" })).toContain("<h1");
    const dialog = form({ variant: "dialog" });
    expect(dialog).not.toContain("<h1");
    expect(dialog).toContain("Cancel");
    expect(form({ variant: "page" })).not.toContain("Cancel");
  });
  it("in the builder preview nothing can be sent: the submit button is disabled and says so", () => {
    const html = form({ variant: "dialog", preview: true });
    expect(html).toContain("Preview: reports are not sent from the builder.");
    expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toMatch(/\bdisabled=""/);
    expect(form({ variant: "dialog" }).match(/<button[^>]*type="submit"[^>]*>/)?.[0]).not.toMatch(/\bdisabled=""/);
  });
  it("every error text the form can show exists", () => {
    const errors = site.report.errors as Record<string, string>;
    for (const code of ["required", "descriptionShort", "tooLong", "email", "rateLimited", "network", "failed"]) expect(errors[code], code).toBeTruthy();
  });
});

describe("ReportProvider", () => {
  it("renders the page and no dialog until the popup is opened", () => {
    const html = render(createElement(ReportProvider, { slug: "clayco", theme: sitePage.theme } as ComponentProps<typeof ReportProvider>, createElement("p", null, "page content")));
    expect(html).toContain("page content");
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Send report");
  });
});

// The popup lives in the footer, which every template renders through the shared kit.
describe("every page layout reaches the popup", () => {
  const dir = join(process.cwd(), "src/components/sections/frames");
  const frames = readdirSync(dir).filter((f) => /Frame\.tsx$/.test(f));
  it.each(frames)("%s renders the footer", (file) => {
    expect(readFileSync(join(dir, file), "utf8")).toMatch(/<Footer\b/);
  });
  it("the public page and the builder preview both mount the popup provider", () => {
    expect(readFileSync(join(process.cwd(), "src/components/site/SiteBody.tsx"), "utf8")).toMatch(/<ReportProvider\b/);
    const preview = readFileSync(join(process.cwd(), "src/components/builder/SitePreview.tsx"), "utf8");
    expect(preview).toMatch(/<ReportProvider\b[^>]*\bpreview\b/);
  });
});

describe("buildReportsQuery", () => {
  it("is empty for the default view and only holds what is set", () => {
    expect(buildReportsQuery({})).toBe("");
    expect(buildReportsQuery({ sort: "newest" })).toBe("");
    expect(buildReportsQuery({ status: "OPEN" })).toBe("?status=OPEN");
    expect(buildReportsQuery({ status: "OPEN", reason: "SCAM", shop: "clayco", q: "card", sort: "oldest" })).toBe("?status=OPEN&reason=SCAM&shop=clayco&q=card&sort=oldest");
  });
  it("trims and encodes the search text, and ignores a blank one", () => {
    expect(buildReportsQuery({ q: "  charged twice & more  " })).toBe("?q=charged+twice+%26+more");
    expect(buildReportsQuery({ q: "   " })).toBe("");
  });
});
