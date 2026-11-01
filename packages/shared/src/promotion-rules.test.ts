import { describe, expect, it } from "vitest";
import { bookingsBlockingPause, canDeletePromotion, canEditPromotion, isPromotionCodeTaken, isPromotionDeletable, type BookingUse } from "./promotion-rules";

const NOW = new Date("2026-11-10T10:00:00Z");
const use = (over: Partial<BookingUse> & { id: string }): BookingUse => ({
  bookingCode: over.id.toUpperCase(), status: "CONFIRMED", promotionIds: ["pr-1"], sessionEndsAt: "2026-11-10T12:00:00Z", sessionStatus: "OPEN", ...over,
});
const ids = (l: BookingUse[]) => l.map((b) => b.id);

describe("bookingsBlockingPause", () => {
  it("a confirmed booking of a session that has not ended blocks the pause", () => {
    expect(ids(bookingsBlockingPause("pr-1", [use({ id: "a" })], NOW))).toEqual(["a"]);
  });
  it("so does a booking that is already checked in, as long as the session runs", () => {
    expect(ids(bookingsBlockingPause("pr-1", [use({ id: "a", status: "CHECKED_IN" })], NOW))).toEqual(["a"]);
  });
  it("a session that is running right now has not ended", () => {
    expect(ids(bookingsBlockingPause("pr-1", [use({ id: "a", sessionEndsAt: "2026-11-10T10:00:01Z" })], NOW))).toEqual(["a"]);
  });
  it("is free once the session has ended, even for a guest who never checked in", () => {
    expect(bookingsBlockingPause("pr-1", [use({ id: "a", sessionEndsAt: "2026-11-10T10:00:00Z" }), use({ id: "b", sessionEndsAt: "2026-11-09T12:00:00Z" })], NOW)).toEqual([]);
  });
  it("is free once the booking is cancelled, expired, a no-show, released or completed", () => {
    for (const status of ["CANCELLED", "SESSION_EXPIRED", "NO_SHOW", "LATE_RELEASED", "COMPLETED"]) {
      expect(bookingsBlockingPause("pr-1", [use({ id: "a", status })], NOW), status).toEqual([]);
    }
  });
  it("a cancelled session does not block", () => {
    expect(bookingsBlockingPause("pr-1", [use({ id: "a", sessionStatus: "CANCELLED" })], NOW)).toEqual([]);
  });
  it("only the promotions the booking used count", () => {
    expect(bookingsBlockingPause("pr-2", [use({ id: "a", promotionIds: ["pr-1"] }), use({ id: "b", promotionIds: [] })], NOW)).toEqual([]);
    expect(ids(bookingsBlockingPause("pr-2", [use({ id: "a", promotionIds: ["pr-1", "pr-2"] })], NOW))).toEqual(["a"]);
  });
  it("lists every booking in the way", () => {
    expect(ids(bookingsBlockingPause("pr-1", [use({ id: "a" }), use({ id: "b", status: "CHECKED_IN" }), use({ id: "c", status: "CANCELLED" })], NOW))).toEqual(["a", "b"]);
  });
});

describe("deleting a promotion", () => {
  const p = { enabled: true, startDate: "2026-11-01", endDate: "2026-11-30" };
  it("is only allowed when it is paused or over", () => {
    expect(canDeletePromotion("PAUSED")).toBe(true);
    expect(canDeletePromotion("EXPIRED")).toBe(true);
    expect(canDeletePromotion("ACTIVE")).toBe(false);
    expect(canDeletePromotion("SCHEDULED")).toBe(false);
  });
  it("follows the dates and the pause", () => {
    expect(isPromotionDeletable(p, "2026-11-10")).toBe(false); // active
    expect(isPromotionDeletable(p, "2026-10-20")).toBe(false); // still to start
    expect(isPromotionDeletable(p, "2026-12-01")).toBe(true); // over
    expect(isPromotionDeletable({ ...p, enabled: false }, "2026-11-10")).toBe(true); // paused
  });
});

describe("a promotion code is unique inside a shop", () => {
  const list = [{ id: "a", code: "SUMMER20" }, { id: "b", code: "EARLY10" }];
  it("finds a code another promotion of the shop uses, ignoring case and the spaces at the ends", () => {
    expect(isPromotionCodeTaken(list, "SUMMER20")).toBe(true);
    expect(isPromotionCodeTaken(list, "summer20")).toBe(true);
    expect(isPromotionCodeTaken(list, "  Summer20 ")).toBe(true);
    expect(isPromotionCodeTaken(list, "SUMMER21")).toBe(false);
  });
  it("lets a promotion keep its own code when it is edited", () => {
    expect(isPromotionCodeTaken(list, "SUMMER20", "a")).toBe(false);
    expect(isPromotionCodeTaken(list, "SUMMER20", "b")).toBe(true);
  });
  it("is free in a shop that has no promotion with the code (another shop's codes are not in the list)", () => {
    expect(isPromotionCodeTaken([], "SUMMER20")).toBe(false);
  });
  it("an empty code is never 'taken' (it is refused as required instead)", () => {
    expect(isPromotionCodeTaken(list, "   ")).toBe(false);
  });
});

describe("canEditPromotion", () => {
  it("is false only for an active promotion", () => {
    expect(canEditPromotion("ACTIVE")).toBe(false);
    for (const st of ["SCHEDULED", "PAUSED", "EXPIRED"] as const) expect(canEditPromotion(st)).toBe(true);
  });
});
