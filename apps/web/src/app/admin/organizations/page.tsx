import { getTranslations } from "next-intl/server";
import { OrganizationsTable } from "@/components/admin/organizations-table";
import { shops } from "@/lib/mock/data";
import { orgStats } from "@/lib/mock/admin";

export default async function OrganizationsPage() {
  const t = await getTranslations("admin.orgs");
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <OrganizationsTable shops={shops} stats={orgStats} />
    </div>
  );
}
