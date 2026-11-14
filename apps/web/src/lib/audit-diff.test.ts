import { describe, expect, it } from "vitest";
import { diffChanges, shortValue } from "./audit-diff";

describe("what a line of the audit log changed", () => {
  it("lists only the fields that differ, with both values", () => {
    expect(diffChanges({ status: "ACTIVE", name: "A", n: 1 }, { status: "SUSPENDED", name: "A", n: 1, reason: "spam" })).toEqual([
      { field: "status", before: "ACTIVE", after: "SUSPENDED" },
      { field: "reason", before: null, after: "spam" },
    ]);
  });
  it("a creation has no before and a deletion no after", () => {
    expect(diffChanges(null, { title: "T" })).toEqual([{ field: "title", before: null, after: "T" }]);
    expect(diffChanges({ title: "T" }, undefined)).toEqual([{ field: "title", before: "T", after: null }]);
    expect(diffChanges(null, null)).toEqual([]);
  });
  it("goes into a nested record by its path and writes other values as JSON", () => {
    expect(diffChanges({ rates: { service: 10 }, tags: ["a"] }, { rates: { service: 12 }, tags: ["a", "b"] })).toEqual([
      { field: "rates.service", before: "10", after: "12" },
      { field: "tags", before: '["a"]', after: '["a","b"]' },
    ]);
  });
  it("never shows a secret and cuts a long value", () => {
    expect(diffChanges({ passwordHash: "x", apiToken: "y" }, { passwordHash: "z", apiToken: "y" })).toEqual([{ field: "passwordHash", before: "•••", after: "•••" }]);
    const cut = shortValue("x".repeat(500))!;
    expect(cut.length).toBe(80);
    expect(cut.endsWith("…")).toBe(true);
  });
});
