import { PromotionsView } from "@/components/promotions/promotions-view";
import { currentShop, workshops } from "@/lib/mock/data";

// Promotion management of the shop. The promotions themselves come from /api/v1/promotions (see lib/mock/promotion-store.ts).
export default function PromotionsPage() {
  return (
    <PromotionsView
      shop={{ defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales, currency: currentShop.currency }}
      workshops={workshops.map((w) => ({ id: w.id, title: w.title, priceAmount: w.priceAmount }))}
    />
  );
}
