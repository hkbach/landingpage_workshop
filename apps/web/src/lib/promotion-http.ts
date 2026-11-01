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
    case "UNKNOWN_IMAGE":
      return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { imageUrl: "imageInvalid" } });
    case "UNKNOWN_WORKSHOP":
      return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { workshopIds: "workshopUnknown" } });
  }
}
