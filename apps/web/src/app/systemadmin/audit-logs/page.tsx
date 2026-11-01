import { getTranslations } from "next-intl/server";
import { AuditTable } from "@/components/admin/audit-table";
import { adminAuditLogs } from "@/lib/mock/admin";
import { shops } from "@/lib/mock/data";

export default async function AuditLogsPage() {
  const t = await getTranslations("admin.audit");
  const orgNames = Object.fromEntries(shops.map((s) => [s.id, s.name]));
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <AuditTable entries={adminAuditLogs} orgNames={orgNames} />
    </div>
  );
}
