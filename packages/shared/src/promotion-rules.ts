import { promotionStatus, type PromotionRecord, type PromotionStatus } from "./promotions";

// Rules that tie promotions to the bookings that used them and to the other promotions of the shop.

/** Booking statuses in which a booking is still "using" its promotions (the guest has not been given the session yet). */
const LIVE_BOOKING_STATUSES: readonly string[] = ["CONFIRMED", "CHECKED_IN"];

/** What the pause rule needs to know about a booking: its promotions, its status and when its session ends. */
export interface BookingUse {
  id: string;
  bookingCode: string;
  status: string;
  promotionIds: readonly string[];
  sessionEndsAt: string;
  sessionStatus: string;
}

/**
 * The bookings that stop a promotion from being paused: the promotion was applied to the booking, the booking is still live
 * (confirmed or checked in) and its session has not ended. A promotion can be paused again once those bookings are cancelled
 * or their sessions are over (a booking not checked in then becomes SESSION_EXPIRED). Sessions that were cancelled do not count.
 */
export function bookingsBlockingPause(promotionId: string, bookings: readonly BookingUse[], now: Date): BookingUse[] {
  return bookings.filter(
    (b) =>
      b.promotionIds.includes(promotionId) &&
      LIVE_BOOKING_STATUSES.includes(b.status) &&
      b.sessionStatus !== "CANCELLED" &&
      new Date(b.sessionEndsAt).getTime() > now.getTime(),
  );
}

/** A promotion can only be deleted while it is paused or over: never while it is active or still to start. */
export const canDeletePromotion = (status: PromotionStatus): boolean => status === "PAUSED" || status === "EXPIRED";

/** An active promotion cannot be edited: the owner pauses it first (so guests never see it change while they book). */
export const canEditPromotion = (status: PromotionStatus): boolean => status !== "ACTIVE";

export function isPromotionDeletable(p: Pick<PromotionRecord, "enabled" | "startDate" | "endDate">, today: string): boolean {
  return canDeletePromotion(promotionStatus(p, today));
}

/**
 * Whether another promotion of the same shop already uses this code (capitals and small letters are the same). Codes only have to be
 * unique inside one shop: the list is the shop's own. `exceptId` leaves out the promotion being edited.
 */
export function isPromotionCodeTaken(list: readonly Pick<PromotionRecord, "id" | "code">[], code: string, exceptId?: string): boolean {
  const wanted = code.trim().toUpperCase();
  return wanted !== "" && list.some((p) => p.id !== exceptId && p.code.toUpperCase() === wanted);
}
