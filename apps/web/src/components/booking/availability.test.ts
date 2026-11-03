import { describe, expect, it } from "vitest";
import { slotState } from "./availability";

const NOW = Date.parse("2026-11-02T09:00:00Z");
const at = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const s = (over: Partial<Parameters<typeof slotState>[0]> = {}) => ({ status: "RUNNING" as const, startsAt: at(5), capacity: 8, reservedCount: 2, bookingCutoffMinutes: 60, ...over });

describe("slotState", () => {
  it("is OK for an open session in the future with a free spot", () => expect(slotState(s(), NOW)).toBe("OK"));
  it("is PAST once the session has started", () => {
    expect(slotState(s({ startsAt: at(-1) }), NOW)).toBe("PAST");
    expect(slotState(s({ startsAt: at(0) }), NOW)).toBe("PAST");
  });
  it("is CUTOFF inside the booking cut-off", () => {
    expect(slotState(s({ startsAt: at(0.5) }), NOW)).toBe("CUTOFF");
    expect(slotState(s({ startsAt: at(1) }), NOW)).toBe("CUTOFF");
    expect(slotState(s({ startsAt: at(1.01) }), NOW)).toBe("OK");
  });
  it("each session has its own cut-off", () => {
    expect(slotState(s({ startsAt: at(3), bookingCutoffMinutes: 240 }), NOW)).toBe("CUTOFF");
    expect(slotState(s({ startsAt: at(3), bookingCutoffMinutes: 0 }), NOW)).toBe("OK");
  });
  it("is FULL with no spot left, and CLOSED when the session is closed", () => {
    expect(slotState(s({ reservedCount: 8 }), NOW)).toBe("FULL");
    expect(slotState(s({ status: "CLOSED" }), NOW)).toBe("CLOSED");
  });
  it("the past wins over full", () => expect(slotState(s({ startsAt: at(-2), reservedCount: 8 }), NOW)).toBe("PAST"));
});
