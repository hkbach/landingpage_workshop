import { notFound } from "next/navigation";
import { PromotionsView } from "@/components/promotions/promotions-view";
import { currentShop, workshops } from "@/lib/mock/data";
import { realApi } from "@/lib/api-server";
import { loadOwnShop } from "@/lib/own-shop";
import { ownWorkshops } from "@/lib/own-catalog";

// Promotion management of the shop. The promotions themselves come from /api/v1/promotions (the API, or the sample data of lib/mock/promotion-store.ts).
export default async function PromotionsPage() {
  if (realApi()) {
    const shop = await loadOwnShop();
    if (!shop) notFound();
    const list = await ownWorkshops();
    return (
      <PromotionsView
        shop={{ defaultLocale: shop.defaultLocale, enabledLocales: shop.enabledLocales, currency: shop.currency }}
        workshops={list.map((w) => ({ id: w.id, title: w.title, priceAmount: w.priceAmount }))}
      />
    );
  }
  return (
    <PromotionsView
      shop={{ defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales, currency: currentShop.currency }}
      workshops={workshops.map((w) => ({ id: w.id, title: w.title, priceAmount: w.priceAmount }))}
    />
  );
}
