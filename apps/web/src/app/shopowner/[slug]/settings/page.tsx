import { getTranslations } from "next-intl/server";
import { liveBookings } from "@/lib/mock/booking-store";
import { PLATFORM_DOMAIN } from "@/components/site/site-url";
import { currentShop } from "@/lib/mock/data";
import { getCustomDomain } from "@/lib/mock/shop-domain-store";
import { apiGet, realApi } from "@/lib/api-server";
import { loadOwnShop } from "@/lib/own-shop";
import { notFound } from "next/navigation";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const t = await getTranslations("dashboard.settings");
  const own = await loadOwnShop();
  if (realApi() && !own) notFound();
  const shop = own ?? currentShop;
  // A change of the time zone or the currency is risky when the shop has bookings: the screen warns about it.
  const hasBookings = realApi() ? ((await apiGet<{ items: unknown[] }>("/bookings?limit=1"))?.items.length ?? 0) > 0 : liveBookings().length > 0;
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <SettingsForm
        viaApi={realApi()}
        hasBookings={hasBookings}
        readOnly={shop.status === "SUSPENDED"}
        systemHost={`${shop.slug}.${PLATFORM_DOMAIN}`}
        initial={{
          name: shop.name,
          contactEmail: shop.contactEmail,
          contactPhone: shop.contactPhone,
          whatsapp: shop.whatsapp ?? "",
          address: shop.address,
          mapsUrl: shop.mapsUrl,
          country: shop.country,
          timezone: shop.timezone,
          currency: shop.currency,
          defaultLocale: shop.defaultLocale,
          enabledLocales: shop.enabledLocales,
          customDomain: own ? own.customDomain : getCustomDomain(shop.slug),
        }}
      />
    </div>
  );
}
