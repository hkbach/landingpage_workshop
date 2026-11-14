import { getTranslations } from "next-intl/server";
import { WithHistory } from "@/components/admin/history-tab";
import { ReportManagement } from "@/components/admin/report-management";
import { fetchAll } from "@/lib/shop-data";

export default async function ReportsPage() {
  const t = await getTranslations("admin.reports");
  const shopIds = Object.fromEntries((await fetchAll<{ slug: string; id: string }>("/admin/organizations")).map((s) => [s.slug, s.id]));
  return (
    <WithHistory scope="reports">
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <ReportManagement shopIds={shopIds} />
    </div>
    </WithHistory>
  );
}
