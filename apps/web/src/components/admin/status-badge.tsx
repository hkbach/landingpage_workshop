import { useTranslations } from "next-intl";
import type { OrgStatus } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<OrgStatus, string> = {
  DRAFT: "bg-slate-200 text-slate-900",
  ACTIVE: "bg-emerald-100 text-emerald-950",
  SUSPENDED: "bg-red-100 text-red-950",
};

export function StatusBadge({ status, className }: { status: OrgStatus; className?: string }) {
  const t = useTranslations("admin.status");
  return <Badge className={cn(STYLES[status], className)}>{t(status)}</Badge>;
}
