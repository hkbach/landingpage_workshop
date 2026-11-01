import { describe, expect, it } from "vitest";
import { trimDeep } from "./trim";

describe("trimDeep", () => {
  it("trims a string at both ends and keeps what is inside", () => {
    expect(trimDeep("  hello   world \n")).toBe("hello   world");
    expect(trimDeep("\t x \u00a0")).toBe("x");
    expect(trimDeep("   ")).toBe("");
    expect(trimDeep("")).toBe("");
  });
  it("trims every string in objects and arrays, however deep", () => {
    const input = { a: " x ", n: [" 1", { b: " y " }], deep: { l: { m: "  z  " } }, loc: { en: " Hi ", vi: " Chào " } };
    expect(trimDeep(input)).toEqual({ a: "x", n: ["1", { b: "y" }], deep: { l: { m: "z" } }, loc: { en: "Hi", vi: "Chào" } });
  });
  it("leaves numbers, booleans, null, undefined and dates alone", () => {
    const d = new Date(0);
    expect(trimDeep({ n: 5, b: false, z: null, u: undefined, d })).toEqual({ n: 5, b: false, z: null, u: undefined, d });
    expect(trimDeep({ d }).d).toBe(d);
    expect(trimDeep(0)).toBe(0);
    expect(trimDeep(null)).toBeNull();
  });
  it("does not change the original", () => {
    const input = { a: " x ", list: [" y "] };
    trimDeep(input);
    expect(input).toEqual({ a: " x ", list: [" y "] });
  });
  it("keeps the line breaks inside a long text", () => {
    expect(trimDeep("  first\n\nsecond  ")).toBe("first\n\nsecond");
  });
  it("is the same value when there is nothing to trim", () => {
    const input = { a: "x", list: ["y"], n: 1 };
    expect(trimDeep(input)).toEqual(input);
  });
});
