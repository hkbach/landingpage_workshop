import { getTranslations } from "next-intl/server";
import { PlatformFeesForm } from "@/components/admin/platform-fees-form";
import { getFeeRates } from "@/lib/mock/fee-rates-store";

export default async function AdminSettingsPage() {
  const t = await getTranslations("admin.fees");
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <PlatformFeesForm initial={getFeeRates()} />
    </div>
  );
}
