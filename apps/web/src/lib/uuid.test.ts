import { describe, expect, it } from "vitest";
import { newUuid } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** An insecure-context crypto: getRandomValues only, no randomUUID. */
const insecure = { getRandomValues: <T extends ArrayBufferView | null>(a: T): T => { if (a) crypto.getRandomValues(a as unknown as Uint8Array); return a; } };

describe("newUuid", () => {
  it("falls back to getRandomValues when randomUUID is missing, producing a valid v4 UUID", () => {
    for (let i = 0; i < 50; i++) expect(newUuid(insecure)).toMatch(V4);
  });
  it("uses randomUUID when it exists", () => {
    expect(newUuid({ ...insecure, randomUUID: () => "11111111-1111-4111-8111-111111111111" })).toBe("11111111-1111-4111-8111-111111111111");
  });
  it("the default (global crypto) also yields a valid v4 UUID", () => {
    expect(newUuid()).toMatch(V4);
  });
  it("fallback ids are unique", () => {
    expect(new Set(Array.from({ length: 200 }, () => newUuid(insecure))).size).toBe(200);
  });
  it("sets the version and variant bits even for an all-ones and all-zeros source", () => {
    const fixed = (v: number) => ({ getRandomValues: <T extends ArrayBufferView | null>(a: T): T => { (a as unknown as Uint8Array).fill(v); return a; } });
    expect(newUuid(fixed(0xff))).toMatch(V4);
    expect(newUuid(fixed(0x00))).toMatch(V4);
  });
});
