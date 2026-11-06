import { getTranslations } from "next-intl/server";
import { AuditTable } from "@/components/admin/audit-table";
import { liveAuditLogs } from "@/lib/mock/admin-audit-store";
import { shops } from "@/lib/mock/data";

export const dynamic = "force-dynamic"; // the entries of the administrators are made at run time

export default async function AuditLogsPage() {
  const t = await getTranslations("admin.audit");
  const orgNames = Object.fromEntries(shops.map((s) => [s.id, s.name]));
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <AuditTable entries={liveAuditLogs()} orgNames={orgNames} />
    </div>
  );
}
