import { describe, expect, it } from "vitest";
import { workshopMatches } from "./customer-workshop-search";

const pasta = { title: { en: "Fresh Pasta from Scratch", vi: "Làm pasta tươi từ đầu", ja: "手打ちパスタ入門" } };

describe("the search of the Workshops page", () => {
  it("finds a workshop by a part of its name, whatever the case", () => {
    expect(workshopMatches(pasta, "Whisk & Ladle Kitchen", "pasta")).toBe(true);
    expect(workshopMatches(pasta, "Whisk & Ladle Kitchen", "  FRESH   pasta ")).toBe(true);
    expect(workshopMatches(pasta, "Whisk & Ladle Kitchen", "cupcake")).toBe(false);
  });
  it("finds it by the name of the shop", () => {
    expect(workshopMatches(pasta, "Whisk & Ladle Kitchen", "ladle")).toBe(true);
    expect(workshopMatches(pasta, "Whisk & Ladle Kitchen", "brew")).toBe(false);
  });
  it("finds it by the name in another language, without the accents", () => {
    expect(workshopMatches(pasta, "Whisk & Ladle Kitchen", "lam pasta tuoi")).toBe(true); // "Làm pasta tươi"
    expect(workshopMatches(pasta, "Whisk & Ladle Kitchen", "手打ち")).toBe(true);
  });
  it("an empty search finds everything", () => {
    expect(workshopMatches(pasta, "Any", "")).toBe(true);
    expect(workshopMatches(pasta, "Any", "   ")).toBe(true);
    expect(workshopMatches({ title: {} }, "Any", "")).toBe(true);
  });
  it("does not look in the description or anywhere else", () => {
    expect(workshopMatches({ ...pasta, description: { en: "secretword" } } as never, "Shop", "secretword")).toBe(false);
  });
});
