import { describe, expect, it } from "vitest";
import { needsAttention } from "@/components/sections/instance";
import type { PageContent } from "@/lib/types";
import { draftOf, type ServerPageDetail } from "./server-pages";

// A page the API keeps with sections that have only some of their fields (written by a script or an older builder): the builder used to mark them "needs attention" and block Publish.
const thin: PageContent = {
  schemaVersion: 1,
  sections: [
    { id: "h", type: "hero", enabled: true, props: { title: { en: "Whisk & Ladle" }, subtitle: { en: "Baking classes" }, ctaText: { en: "Book now" } } },
    { id: "w", type: "workshops", enabled: true, props: { heading: { en: "Our workshops" } } },
    { id: "f", type: "footer", enabled: true, props: {} },
  ],
  seo: { title: { en: "Whisk & Ladle" }, description: { en: "Baking classes" } },
};
const page = (content: PageContent | null): ServerPageDetail => ({
  id: "p", name: "Main", templateKey: "classic", isLive: false, version: 0, hasDraft: true, hasUnpublishedChanges: false, publishedAt: null, updatedAt: "2026-11-14T00:00:00Z", theme: {}, content, source: "DRAFT",
});

describe("a saved page with sections that lack fields", () => {
  it("opens with nothing marked as needing attention (the missing fields come from the defaults)", () => {
    const d = draftOf(page(thin), { name: "Shop", defaultLocale: "en" });
    expect(d.content.sections.filter((s) => needsAttention(s, d.theme))).toEqual([]);
  });

  it("keeps what the owner wrote: a saved field is never replaced by its default", () => {
    const d = draftOf(page(thin), { name: "Shop", defaultLocale: "en" });
    const hero = d.content.sections.find((s) => s.type === "hero")!;
    expect(hero.props.title).toEqual({ en: "Whisk & Ladle" });
    expect(hero.props.ctaText).toEqual({ en: "Book now" });
    expect(hero.props.imageUrl).toBe("");
    expect(d.content.sections.map((s) => s.id)).toEqual(["h", "w", "f"]); // the sections and their order are the saved ones
  });

  it("does not change the saved page itself", () => {
    const before = JSON.stringify(thin);
    draftOf(page(thin), { name: "Shop", defaultLocale: "en" });
    expect(JSON.stringify(thin)).toBe(before);
  });
});
