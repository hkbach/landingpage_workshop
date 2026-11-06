// The shops whose workshops the guests see on the Workshops page of their area (/customer/{id}/workshops). Mock of what the API will give once apps/api exists.
import type { PromotionRecord } from "@workshop/shared";
import type { Shop } from "../types";
import { currentShop } from "./data";
import { liveShops } from "./shop-admin-store";
import { publicPromotions } from "./promotion-store";
import { getPublicSite, type PublicSite } from "./site";

export interface ListedShop extends PublicSite {
  /** Promotions active today that the booking form of this shop offers. */
  promotions: PromotionRecord[];
  /**
   * Whether a booking made at this shop is really created. The mock backend only keeps the bookings of the demo shop; for the other shops the booking popup works
   * but makes no booking. TODO(api): every shop is bookable.
   */
  bookable: boolean;
}

/**
 * A shop is listed when it is ACTIVE and the platform administrator chose it (`showOnCustomerPage`); a listed shop with no public site is left out. Each one comes
 * with what its landing page shows: its theme, its ACTIVE workshops, their sessions (with the seats really left) and the promotions active today.
 * TODO(api): the promotions of each shop (organization_id); the mock store only holds the demo shop's.
 */
export function listedShops(candidates: readonly Shop[] = liveShops()): ListedShop[] {
  return candidates
    .filter((s) => s.status === "ACTIVE" && s.showOnCustomerPage === true)
    .flatMap((s): ListedShop[] => {
      const site = getPublicSite(s.slug);
      return site ? [{ ...site, promotions: s.id === currentShop.id ? publicPromotions() : [], bookable: s.id === currentShop.id }] : [];
    })
    .sort((a, b) => a.shop.name.localeCompare(b.shop.name));
}
