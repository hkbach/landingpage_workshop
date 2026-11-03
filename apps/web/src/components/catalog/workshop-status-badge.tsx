import { useTranslations } from "next-intl";
import type { WorkshopStatus } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<WorkshopStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-900",
  DRAFT: "bg-slate-100 text-slate-900",
};

export function WorkshopStatusBadge({ status }: { status: WorkshopStatus }) {
  const t = useTranslations("catalog");
  return <Badge variant="outline" className={cn("border-transparent", STYLES[status])}>{t(`status.${status}`)}</Badge>;
}
