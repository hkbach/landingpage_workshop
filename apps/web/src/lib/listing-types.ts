// A shop listed on the Workshops page of the customers.
import type { PromotionRecord } from "@workshop/shared";
import type { PublicSite } from "@/lib/public-site";

export interface ListedShop extends PublicSite {
  /** Promotions active today that the booking form of this shop offers. */
  promotions: PromotionRecord[];
  /**
   * Whether a booking made at this shop is really created. The mock backend only keeps the bookings of the demo shop; for the other shops the booking popup works
   * but makes no booking. TODO(api): every shop is bookable.
   */
  bookable: boolean;
}
