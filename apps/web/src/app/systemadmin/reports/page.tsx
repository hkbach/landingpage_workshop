import { getTranslations } from "next-intl/server";
import { ReportManagement } from "@/components/admin/report-management";
import { shops } from "@/lib/mock/data";

export default async function ReportsPage() {
  const t = await getTranslations("admin.reports");
  const shopIds = Object.fromEntries(shops.map((s) => [s.slug, s.id]));
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <ReportManagement shopIds={shopIds} />
    </div>
  );
}
