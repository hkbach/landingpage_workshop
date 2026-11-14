import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import site from "../../../../messages/en/site.json";
import type { RenderContext } from "../context";
import { LAYOUT_KEYS } from "../layouts";
import { AccountButtons, HeaderMenu } from "./kit";
import type { NavItem } from "./logic";

const Provider = NextIntlClientProvider as unknown as ComponentType<{ locale: string; messages: { site: typeof site }; children?: ReactNode }>;
const render = (node: ReactNode) => renderToStaticMarkup(createElement(Provider, { locale: "en", messages: { site } }, node));

const ctx = (languages: RenderContext["languages"]): RenderContext => ({
  locale: "en",
  shop: { name: "Shop", defaultLocale: "en", enabledLocales: ["en", "vi"], timezone: "UTC", currency: "VND" },
  workshops: [], reportHref: "#", privacyHref: "#", languages,
});
const two = [{ locale: "en", href: "/" }, { locale: "vi", href: "/vi" }] as const;
const items: NavItem[] = [{ id: "a", type: "about", href: "#s-a" }, { id: "w", type: "workshops", href: "#s-w" }];

describe("HeaderMenu (closed)", () => {
  const menu = (props: { items?: NavItem[]; languages?: RenderContext["languages"]; until?: "3xl" | "4xl" | "5xl"; showBook?: boolean }) =>
    render(createElement(HeaderMenu, { items: props.items ?? items, ctx: ctx(props.languages ?? [...two]), until: props.until, showBook: props.showBook }));

  it("is a three-bar button that is collapsed and labelled", () => {
    const html = menu({});
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Open menu"');
    expect(html).toContain("lucide-menu");
    expect(html.match(/<button/g)).toHaveLength(1);
  });
  it("does not render the panel until it is opened", () => {
    const html = menu({});
    expect(html).not.toContain("Workshops");
    expect(html).not.toContain("Book now");
    expect(html).not.toContain("aria-controls");
  });
  it("is hidden from the width where the frame shows its inline items", () => {
    expect(menu({})).toContain("@3xl:hidden");
    expect(menu({ until: "4xl" })).toContain("@4xl:hidden");
    expect(menu({ until: "5xl" })).toContain("@5xl:hidden");
  });
  it("has a comfortable tap target (44px)", () => {
    expect(menu({})).toContain("size-11");
  });
  it("renders nothing when there is nothing to put in the menu", () => {
    expect(menu({ items: [], languages: [], showBook: false })).toBe("");
    expect(menu({ items: [], languages: [two[0]], showBook: false })).toBe(""); // a single language is not a choice
  });
  it("is still there when only the languages, only the links or only Book would be in it", () => {
    expect(menu({ items: [], showBook: false })).toContain("aria-expanded");
    expect(menu({ languages: [], showBook: false })).toContain("aria-expanded");
    expect(menu({ items: [], languages: [] })).toContain("aria-expanded");
  });
});

describe("Log in and Register buttons (a customer account of the platform)", () => {
  const withLinks = (accountLinks?: RenderContext["accountLinks"]): RenderContext => ({ ...ctx([...two]), ...(accountLinks ? { accountLinks } : {}) });
  const links = { login: "http://app.localtest.me:3000/?auth=login", signup: "http://app.localtest.me:3000/?auth=signup&only=customer" };

  it("are two links to the popups of the platform", () => {
    const html = render(createElement(AccountButtons, { ctx: withLinks(links) }));
    expect(html).toContain(`href="${links.login}"`);
    expect(html).toContain(`href="${links.signup.replace("&", "&amp;")}"`); // (static markup escapes the & of the address)
    expect(html).toContain(">Log in<");
    expect(html).toContain(">Register<");
    expect(html).toContain('data-testid="site-register"');
  });
  it("are not offered to a shop owner: the Register address asks for a customer only", () => {
    const html = render(createElement(AccountButtons, { ctx: withLinks(links) }));
    expect(html).toContain("only=customer");
    expect(html).not.toContain("tab=owner");
  });
  it("show nothing where there are no addresses (the customer area, a person who is signed in)", () => {
    expect(render(createElement(AccountButtons, { ctx: withLinks() }))).toBe("");
  });
  it("look the same and do nothing in the builder preview (empty addresses)", () => {
    const html = render(createElement(AccountButtons, { ctx: withLinks({ login: "", signup: "" }) }));
    expect(html).not.toContain("<a ");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain(">Register<");
  });
  it("keep the menu there even when it would hold nothing else, and stay out of its closed state", () => {
    const only = { ...withLinks(links), languages: [] };
    expect(render(createElement(HeaderMenu, { items: [], ctx: only, showBook: false }))).toContain("aria-expanded");
    expect(render(createElement(HeaderMenu, { items: [], ctx: only, showBook: false }))).not.toContain("Register");
  });
  it("every frame that shows the language switch in its header also has them", () => {
    const dir = join(process.cwd(), "src/components/sections/frames");
    for (const file of readdirSync(dir).filter((f) => /Frame\.tsx$/.test(f) && f !== "QuickLinksFrame.tsx")) {
      expect(readFileSync(join(dir, file), "utf8"), file).toMatch(/<AccountButtons\b/);
    }
  });
});

// The menu replaces the inline header items on narrow views in every template: a template that forgets it would keep the
// crowded header on phones.
describe("every page layout has the menu", () => {
  const dir = join(process.cwd(), "src/components/sections/frames");
  const frames = readdirSync(dir).filter((f) => /Frame\.tsx$/.test(f));

  it("there is one frame file per layout", () => {
    expect(frames).toHaveLength(LAYOUT_KEYS.length);
  });
  it.each(frames)("%s renders <HeaderMenu", (file) => {
    expect(readFileSync(join(dir, file), "utf8")).toMatch(/<HeaderMenu\b/);
  });
  it("no frame keeps a horizontally scrolling link row in its header for phones", () => {
    for (const file of frames) {
      expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/order-last -mx-4 w-\[calc\(100%\+2rem\)\] overflow-x-auto/);
    }
  });
});
