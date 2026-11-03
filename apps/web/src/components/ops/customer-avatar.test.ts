import { describe, expect, it } from "vitest";
import { initials } from "./customer-avatar";

describe("initials", () => {
  it("the first letter of the first and the last word", () => {
    expect(initials("Emma Johnson")).toBe("EJ");
    expect(initials("Kim Min-jun")).toBe("KM");
    expect(initials("  anna   maria   lopez ")).toBe("AL");
  });
  it("one letter for a single word, and a character for names without spaces", () => {
    expect(initials("Walk-in")).toBe("W");
    expect(initials("田中")).toBe("田");
    expect(initials("Đức")).toBe("Đ");
  });
  it("a question mark when there is no name", () => expect(initials("   ")).toBe("?"));
});
