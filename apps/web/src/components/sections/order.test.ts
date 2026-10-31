import { describe, expect, it } from "vitest";
import type { SectionType } from "@workshop/shared";
import type { SectionInstance } from "@/lib/types";
import { canMove, isPositionLocked, movablePosition, moveSection, normalizeOrder } from "./order";
import { createSection } from "./registry";
import { applyTemplate, TEMPLATE_KEYS } from "./templates";

const mk = (type: SectionType): SectionInstance => ({ ...createSection(type), id: type });
const page = (...types: SectionType[]) => types.map(mk);
const types = (s: readonly SectionInstance[]) => s.map((x) => x.type);

describe("position locks", () => {
  it("only hero and footer are locked", () => {
    expect(isPositionLocked("hero")).toBe(true);
    expect(isPositionLocked("footer")).toBe(true);
    const others: SectionType[] = ["about", "workshops", "gallery", "video", "team", "testimonials", "location", "contact", "faq"];
    for (const t of others) expect(isPositionLocked(t), t).toBe(false);
  });
});

describe("normalizeOrder", () => {
  it("puts the hero first and the footer last, keeping the rest in order", () => {
    expect(types(normalizeOrder(page("about", "footer", "gallery", "hero", "faq")))).toEqual(["hero", "about", "gallery", "faq", "footer"]);
  });
  it("is idempotent and leaves a valid order untouched", () => {
    const ok = page("hero", "about", "faq", "footer");
    expect(types(normalizeOrder(ok))).toEqual(types(ok));
    const once = normalizeOrder(page("faq", "hero", "footer", "about"));
    expect(types(normalizeOrder(once))).toEqual(["hero", "faq", "about", "footer"]);
  });
  it("works without a hero or without a footer", () => {
    expect(types(normalizeOrder(page("about", "footer", "faq")))).toEqual(["about", "faq", "footer"]);
    expect(types(normalizeOrder(page("faq", "hero", "about")))).toEqual(["hero", "faq", "about"]);
  });
  it("does not mutate its input", () => {
    const input = page("faq", "hero", "footer");
    const copy = [...input];
    normalizeOrder(input);
    expect(input).toEqual(copy);
  });
});

describe("moveSection / canMove", () => {
  const base = () => page("hero", "about", "gallery", "faq", "footer");

  it("moves a section down and up by one step", () => {
    expect(types(moveSection(base(), "about", 1))).toEqual(["hero", "gallery", "about", "faq", "footer"]);
    expect(types(moveSection(base(), "faq", -1))).toEqual(["hero", "about", "faq", "gallery", "footer"]);
  });
  it("the first movable section cannot go up and the last cannot go down: hero and footer are walls", () => {
    expect(canMove(base(), "about", -1)).toBe(false);
    expect(canMove(base(), "faq", 1)).toBe(false);
    expect(types(moveSection(base(), "about", -1))).toEqual(types(base()));
    expect(types(moveSection(base(), "faq", 1))).toEqual(types(base()));
  });
  it("the hero and the footer cannot be moved at all", () => {
    for (const dir of [-1, 1] as const) {
      expect(canMove(base(), "hero", dir)).toBe(false);
      expect(canMove(base(), "footer", dir)).toBe(false);
      expect(types(moveSection(base(), "hero", dir))).toEqual(types(base()));
      expect(types(moveSection(base(), "footer", dir))).toEqual(types(base()));
    }
  });
  it("an unknown id changes nothing", () => {
    expect(canMove(base(), "nope", 1)).toBe(false);
    expect(types(moveSection(base(), "nope", 1))).toEqual(types(base()));
  });
  it("a single movable section cannot move at all", () => {
    const one = page("hero", "about", "footer");
    expect(canMove(one, "about", -1)).toBe(false);
    expect(canMove(one, "about", 1)).toBe(false);
  });
  it("moves hidden (disabled) sections too and never mutates the input", () => {
    const input = base().map((s) => (s.type === "gallery" ? { ...s, enabled: false } : s));
    const copy = [...input];
    const out = moveSection(input, "gallery", 1);
    expect(types(out)).toEqual(["hero", "about", "faq", "gallery", "footer"]);
    expect(input).toEqual(copy);
  });
  it("walking a section all the way down and back up restores the order", () => {
    let s = base();
    s = moveSection(s, "about", 1);
    s = moveSection(s, "about", 1);
    expect(types(s)).toEqual(["hero", "gallery", "faq", "about", "footer"]);
    s = moveSection(s, "about", -1);
    s = moveSection(s, "about", -1);
    expect(types(s)).toEqual(types(base()));
  });
  it("reports positions among the movable sections", () => {
    expect(movablePosition(base(), "gallery")).toEqual({ position: 2, total: 3 });
    expect(movablePosition(base(), "hero")).toBeNull();
    expect(movablePosition(base(), "footer")).toBeNull();
  });
});

describe("templates keep the hero first and the footer last", () => {
  it.each(TEMPLATE_KEYS)("%s", (key) => {
    // Even from a page whose hero sits in the middle and whose footer is not last.
    const messy = { schemaVersion: 1 as const, layout: "classic" as const, seo: { title: {}, description: {} }, sections: page("about", "footer", "hero", "faq") };
    const out = applyTemplate(messy, key).sections;
    expect(out[0]!.type).toBe("hero");
    expect(out[out.length - 1]!.type).toBe("footer");
    expect(out.filter((s) => s.type === "hero")).toHaveLength(1);
    expect(out.filter((s) => s.type === "footer")).toHaveLength(1);
  });
});
