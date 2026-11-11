import { getTranslations } from "next-intl/server";
import { liveBookings } from "@/lib/mock/booking-store";
import { PLATFORM_DOMAIN } from "@/components/site/site-url";
import { currentShop } from "@/lib/mock/data";
import { getCustomDomain } from "@/lib/mock/shop-domain-store";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const t = await getTranslations("dashboard.settings");
  const shop = currentShop;
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <SettingsForm
        hasBookings={liveBookings().length > 0}
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
          customDomain: getCustomDomain(shop.slug),
        }}
      />
    </div>
  );
}
