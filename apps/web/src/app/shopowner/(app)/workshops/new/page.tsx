import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { WorkshopForm } from "@/components/catalog/workshop-form";
import { currentShop } from "@/lib/mock/data";

export default async function NewWorkshopPage() {
  const t = await getTranslations("catalog");
  return (
    <div className="grid gap-4">
      <Link href="/shopowner/workshops" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("list.title")}
      </Link>
      <h1 className="text-xl font-semibold sm:text-2xl">{t("list.new")}</h1>
      <WorkshopForm
        shop={{ currency: currentShop.currency, timezone: currentShop.timezone, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales }}
      />
    </div>
  );
}
