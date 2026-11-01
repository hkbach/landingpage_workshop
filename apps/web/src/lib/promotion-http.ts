import { MAX_CONCURRENT_PROMOTIONS, MAX_PROMOTIONS_PER_SHOP } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import type { SaveResult } from "@/lib/mock/promotion-store";

/** The HTTP answer for a promotion that could not be saved (shared by the collection and item routes). */
export function saveFailure(res: Extract<SaveResult, { ok: false }>): Response {
  switch (res.code) {
    case "NOT_FOUND":
      return apiError(404, "NOT_FOUND", "Promotion not found.");
    case "LIMIT":
      return apiError(409, "LIMIT_REACHED", `A shop can have at most ${MAX_PROMOTIONS_PER_SHOP} promotions.`);
    case "CONCURRENT_LIMIT":
      return apiError(409, "CONCURRENT_LIMIT", `At most ${MAX_CONCURRENT_PROMOTIONS} promotions can run at the same time.`, { date: res.date, max: MAX_CONCURRENT_PROMOTIONS });
    case "FULL_DISCOUNT":
      return apiError(422, "FULL_DISCOUNT", "A guest could get 100% off a workshop with this promotion, so it cannot be saved.", { fields: { discountValue: "fullDiscount" }, workshopIds: res.workshopIds });
    case "CODE_TAKEN":
      return apiError(422, "VALIDATION", "Another promotion of your shop already uses this code.", { fields: { code: "codeTaken" } });
    case "END_IN_PAST":
      return apiError(422, "VALIDATION", "The last day cannot be before today.", { fields: { endDate: "endInPast" } });
    case "EDIT_ACTIVE":
      return apiError(409, "EDIT_NOT_ALLOWED", "An active promotion cannot be edited. Pause it first.");
    case "IN_USE":
      return apiError(409, "PROMOTION_IN_USE", "Guests are using this promotion in bookings of sessions that have not ended, so it cannot be paused yet.", { count: res.bookingCodes.length, bookingCodes: res.bookingCodes.slice(0, 20) });
    case "UNKNOWN_IMAGE":
      return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { imageUrl: "imageInvalid" } });
    case "UNKNOWN_WORKSHOP":
      return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { workshopIds: "workshopUnknown" } });
  }
}
