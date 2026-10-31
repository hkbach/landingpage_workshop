import { getTranslations } from "next-intl/server";
import { ReportsList } from "@/components/admin/reports-list";
import { adminReports } from "@/lib/mock/admin";
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
      <ReportsList initial={adminReports} shopIds={shopIds} />
    </div>
  );
}
