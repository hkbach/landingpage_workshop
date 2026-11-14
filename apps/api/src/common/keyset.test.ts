import { describe, expect, it } from "vitest";
import { isKeyset, nextKeyset, readKeyset, writeKeyset } from "./keyset";

const ID = "11111111-1111-4111-8111-111111111111";

describe("the keyset cursor", () => {
  it("round-trips the time to the microsecond and the id", () => {
    expect(readKeyset(writeKeyset("2026-11-14T17:09:03.090123Z", ID))).toEqual({ t: "2026-11-14T17:09:03.090123Z", id: ID });
    expect(readKeyset(undefined)).toBeUndefined();
  });
  it("accepts the times with fewer digits that older cursors carried", () => {
    expect(isKeyset("2026-11-14T17:09:03.090Z", ID)).toBe(true);
    expect(isKeyset("2026-11-14T17:09:03Z", ID)).toBe(true);
  });
  it("refuses anything that is not a time and an id: it would reach the SQL as a value", () => {
    expect(isKeyset("yesterday", ID)).toBe(false);
    expect(isKeyset("2026-11-14T17:09:03.090123Z'; drop table users; --", ID)).toBe(false);
    expect(isKeyset("2026-11-14T17:09:03.090123Z", "not-a-uuid")).toBe(false);
    expect(isKeyset(1, ID)).toBe(false);
    expect(() => readKeyset("%%%")).toThrow();
    expect(() => readKeyset(writeKeyset("yesterday", ID))).toThrow();
  });
  it("makes the cursor of the next page from the last row shown, only when there is one more row", () => {
    const rows = [{ ts: "2026-11-14T17:09:03.000003Z", id: ID }, { ts: "2026-11-14T17:09:03.000002Z", id: ID }, { ts: "2026-11-14T17:09:03.000001Z", id: ID }];
    expect(readKeyset(nextKeyset(rows, 2)!)).toEqual({ t: "2026-11-14T17:09:03.000002Z", id: ID });
    expect(nextKeyset(rows, 3)).toBeNull();
    expect(nextKeyset([], 2)).toBeNull();
  });
});
