import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, paginate } from "./pagination";

const list = Array.from({ length: 25 }, (_, i) => i + 1);

describe("paginate", () => {
  it("offers 10, 20 and 50 rows to a page, 10 by default", () => {
    expect([...PAGE_SIZES]).toEqual([10, 20, 50]);
    expect(DEFAULT_PAGE_SIZE).toBe(10);
  });
  it("cuts the list in pages and tells which rows are on the page", () => {
    expect(paginate(list, 1, 10)).toMatchObject({ items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], page: 1, pages: 3, total: 25, from: 1, to: 10 });
    expect(paginate(list, 3, 10)).toMatchObject({ items: [21, 22, 23, 24, 25], page: 3, from: 21, to: 25 });
  });
  it("a bigger page size gives fewer pages", () => {
    expect(paginate(list, 1, 20)).toMatchObject({ pages: 2, to: 20 });
    expect(paginate(list, 1, 50)).toMatchObject({ pages: 1, from: 1, to: 25 });
  });
  it("a page that does not exist is the nearest one (a list that got shorter)", () => {
    expect(paginate(list, 9, 10).page).toBe(3);
    expect(paginate(list, 0, 10).page).toBe(1);
    expect(paginate(list, -4, 10).page).toBe(1);
    expect(paginate(list, Number.NaN, 10).page).toBe(1);
  });
  it("an empty list is one empty page", () => {
    expect(paginate([], 1, 10)).toMatchObject({ items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });
  it("a list that fits one page is that page, and the list given is not changed", () => {
    const short = [1, 2, 3];
    expect(paginate(short, 1, 10)).toMatchObject({ items: [1, 2, 3], pages: 1, from: 1, to: 3 });
    expect(short).toEqual([1, 2, 3]);
  });
  it("a size that is not a positive whole number falls back to 10", () => {
    expect(paginate(list, 1, 0).size).toBe(10);
    expect(paginate(list, 1, Number.NaN).size).toBe(10);
  });
});
