import { describe, expect, it } from "vitest";
import { ariaSort, nextSort, sortRows } from "./table-sort";

describe("nextSort", () => {
  it("goes ascending, descending, then back to no sort", () => {
    const a = nextSort(null, "name");
    expect(a).toEqual({ key: "name", dir: "asc" });
    const b = nextSort(a, "name");
    expect(b).toEqual({ key: "name", dir: "desc" });
    expect(nextSort(b, "name")).toBeNull();
  });
  it("another column starts ascending", () => expect(nextSort({ key: "name", dir: "desc" }, "email")).toEqual({ key: "email", dir: "asc" }));
});

describe("sortRows", () => {
  type R = { id: string; name: string | null; n: number | null };
  const rows: R[] = [
    { id: "a", name: "banana", n: 5 }, { id: "b", name: "Apple", n: null }, { id: "c", name: null, n: 1 }, { id: "d", name: "cherry", n: 5 }, { id: "e", name: "apple", n: 9 },
  ];
  const val = (r: R, k: string) => (k === "name" ? r.name : r.n);
  const ids = (s: R[]) => s.map((r) => r.id);
  it("with no sort the rows keep their order (a copy)", () => {
    const out = sortRows(rows, null, val, "en");
    expect(ids(out)).toEqual(["a", "b", "c", "d", "e"]);
    expect(out).not.toBe(rows);
  });
  it("sorts texts ignoring case, keeping the order of equal ones, and puts rows with no value last", () => {
    expect(ids(sortRows(rows, { key: "name", dir: "asc" }, val, "en"))).toEqual(["b", "e", "a", "d", "c"]);
  });
  it("descending reverses the order but the rows with no value stay last", () => {
    expect(ids(sortRows(rows, { key: "name", dir: "desc" }, val, "en"))).toEqual(["d", "a", "b", "e", "c"]);
  });
  it("sorts numbers as numbers, ties in their original order, no value last", () => {
    expect(ids(sortRows(rows, { key: "n", dir: "asc" }, val, "en"))).toEqual(["c", "a", "d", "e", "b"]);
    expect(ids(sortRows(rows, { key: "n", dir: "desc" }, val, "en"))).toEqual(["e", "a", "d", "c", "b"]);
  });
  it("compares the numbers inside a text as numbers", () => {
    const codes = ["SES-0010-001", "SES-0002-001", "SES-0002-010", "SES-0002-002"].map((id) => ({ id }));
    expect(sortRows(codes, { key: "c", dir: "asc" }, (r) => r.id, "en").map((r) => r.id)).toEqual(["SES-0002-001", "SES-0002-002", "SES-0002-010", "SES-0010-001"]);
  });
  it("sorts Vietnamese by its own alphabet", () => {
    const names = ["Đức", "An", "Ân", "Bình"].map((id) => ({ id }));
    expect(sortRows(names, { key: "n", dir: "asc" }, (r) => r.id, "vi").map((r) => r.id)).toEqual(["An", "Ân", "Bình", "Đức"]);
  });
});

describe("ariaSort", () => {
  it("says which column is sorted and how", () => {
    expect(ariaSort({ key: "a", dir: "asc" }, "a")).toBe("ascending");
    expect(ariaSort({ key: "a", dir: "desc" }, "a")).toBe("descending");
    expect(ariaSort({ key: "a", dir: "asc" }, "b")).toBe("none");
    expect(ariaSort(null, "a")).toBe("none");
  });
});
