import { getTranslations } from "next-intl/server";
import { AlertTriangle, Lock } from "lucide-react";
import type { OrgStatus } from "@workshop/shared";

export async function ShopStatusBanner({ status, reason }: { status: OrgStatus; reason?: string }) {
  if (status === "ACTIVE") return null;
  const t = await getTranslations("dashboard.shell.banner");
  const cfg = {
    DRAFT: { Icon: AlertTriangle, key: "draft", tone: "border-amber-300 bg-amber-50 text-amber-950" },
    SUSPENDED: { Icon: Lock, key: "suspended", tone: "border-red-300 bg-red-50 text-red-950" },
  }[status];
  return (
    <div role="status" className={`flex items-start gap-3 border-b px-4 py-3 text-sm ${cfg.tone}`}>
      <cfg.Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <strong className="font-semibold">{t(`${cfg.key}.title`)}</strong> {t(`${cfg.key}.body`)}
        {status === "SUSPENDED" && reason ? ` ${t("suspended.reason", { reason })}` : null}
      </p>
    </div>
  );
}
