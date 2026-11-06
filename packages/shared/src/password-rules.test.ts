import { describe, expect, it } from "vitest";
import { checkPassword, PASSWORD_MAX, PASSWORD_MIN } from "./password-rules";

describe("checkPassword", () => {
  it("needs 10 to 72 characters", () => {
    expect(PASSWORD_MIN).toBe(10);
    expect(PASSWORD_MAX).toBe(72);
    expect(checkPassword("a".repeat(9))).toBe("TOO_SHORT");
    expect(checkPassword("")).toBe("TOO_SHORT");
    expect(checkPassword("a".repeat(10))).toBe("OK");
    expect(checkPassword("a".repeat(72))).toBe("OK");
    expect(checkPassword("a".repeat(73))).toBe("TOO_LONG");
  });
  it("does not trim: spaces are characters of the password", () => {
    expect(checkPassword(" ".repeat(10))).toBe("OK");
  });
});
