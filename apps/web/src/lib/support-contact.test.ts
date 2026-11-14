import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import builder from "../../messages/en/builder.json";
import { SupportContactBox } from "@/components/builder/SupportContactBox";
import { platformSupport } from "@/lib/sample/platform";
import { supportLinks, type SupportContact } from "./support-contact";

const by = (c: SupportContact) => Object.fromEntries(supportLinks(c).map((l) => [l.channel, l]));

describe("supportLinks", () => {
  it("the demo data produces the four channels in the order WhatsApp, Phone, Zalo, Email", () => {
    expect(supportLinks(platformSupport).map((l) => l.channel)).toEqual(["whatsapp", "phone", "zalo", "email"]);
  });

  it("builds the right link for each channel", () => {
    const l = by({ whatsapp: "+84 90 123 4567", phone: "+84 28 3822 1234", zalo: "090 123 4567", email: "help@example.com" });
    expect(l.whatsapp).toMatchObject({ href: "https://wa.me/84901234567", external: true, value: "+84 90 123 4567" });
    expect(l.phone).toMatchObject({ href: "tel:+842838221234", external: false });
    expect(l.zalo).toMatchObject({ href: "https://zalo.me/0901234567", external: true });
    expect(l.email).toMatchObject({ href: "mailto:help@example.com", external: false });
  });

  it("a national phone number keeps no plus sign", () => {
    expect(by({ phone: "(028) 3822-1234" }).phone?.href).toBe("tel:02838221234");
  });

  it("leaves out empty, missing or whitespace-only channels", () => {
    expect(supportLinks({})).toEqual([]);
    expect(supportLinks({ whatsapp: "", phone: "   ", zalo: undefined, email: "" })).toEqual([]);
    expect(supportLinks(null)).toEqual([]);
    expect(supportLinks(undefined)).toEqual([]);
  });

  it("shows only the channels that are configured", () => {
    expect(supportLinks({ email: "help@example.com", zalo: "0900000003" }).map((l) => l.channel)).toEqual(["zalo", "email"]);
  });

  it("rejects numbers that are not phone numbers", () => {
    for (const bad of ["abc", "12345", "javascript:alert(1)", "+84 (90) <script>", "1".repeat(16), "https://evil.example"]) {
      expect(supportLinks({ phone: bad, whatsapp: bad, zalo: bad }), bad).toEqual([]);
    }
  });

  it("rejects unsafe or malformed emails", () => {
    for (const bad of ["no-at-sign", "a@b", "a b@example.com", "a@example.com?subject=x", "a@example.com,b@example.com", "<a@example.com>", "javascript:alert(1)@x.co", `${"x".repeat(250)}@example.com`]) {
      expect(supportLinks({ email: bad }), bad).toEqual([]);
    }
  });

  it("never produces a link with a dangerous scheme", () => {
    const nasty: SupportContact = { whatsapp: "javascript:1", phone: "data:text/html,1234567", zalo: "vbscript:1234567", email: "javascript:alert(1)" };
    for (const l of supportLinks(nasty)) expect(l.href).toMatch(/^(tel:|mailto:|https:\/\/(wa|zalo)\.me\/)/);
    expect(supportLinks(nasty)).toEqual([]);
  });

  it("trims the displayed value", () => {
    expect(by({ email: "  help@example.com  " }).email?.value).toBe("help@example.com");
  });
});

describe("SupportContactBox", () => {
  const Provider = NextIntlClientProvider as unknown as ComponentType<{ locale: string; messages: { builder: typeof builder }; children?: ReactNode }>;
  const render = (contact: SupportContact | null | undefined) =>
    renderToStaticMarkup(createElement(Provider, { locale: "en", messages: { builder } }, createElement(SupportContactBox, { contact })));

  it("shows WhatsApp, Phone, Zalo and Email with their values", () => {
    const html = render(platformSupport);
    for (const label of ["WhatsApp", "Phone", "Zalo", "Email"]) expect(html).toContain(label);
    for (const v of Object.values(platformSupport)) expect(html).toContain(v);
    expect(html).toContain("Need help?");
  });

  it("chat links open in a new tab safely and say so for screen readers; phone and email do not", () => {
    const html = render(platformSupport);
    const tag = (href: string) => html.match(new RegExp(`<a[^>]*href="${href.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"[^>]*>`))?.[0] ?? "";
    expect(tag("https://wa.me/84900000001")).toContain('target="_blank"');
    expect(tag("https://wa.me/84900000001")).toContain('rel="noopener noreferrer"');
    expect(tag("https://zalo.me/0900000003")).toContain('target="_blank"');
    expect(tag("tel:+842800000002")).not.toContain("target=");
    expect(tag("mailto:support@workshopkit.example")).not.toContain("target=");
    expect(html.match(/opens in a new tab/g)).toHaveLength(2);
  });

  it("renders nothing when no channel is configured", () => {
    expect(render({})).toBe("");
    expect(render(null)).toBe("");
    expect(render({ email: "not an email" })).toBe("");
  });

  it("shows only the configured channels", () => {
    const html = render({ email: "help@example.com" });
    expect(html).toContain("Email");
    expect(html).not.toContain("WhatsApp");
    expect(html).not.toContain("Zalo");
  });
});
