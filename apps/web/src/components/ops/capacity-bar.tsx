import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Seat usage bar. Text label is always present (colour is not the only signal). */
export function CapacityBar({ reserved, capacity, className }: { reserved: number; capacity: number; className?: string }) {
  const t = useTranslations("ops");
  const pct = capacity > 0 ? Math.min(100, Math.round((reserved / capacity) * 100)) : 0;
  const full = reserved >= capacity;
  return (
    <div className={cn("grid gap-1", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{t("capacity.seats", { reserved, capacity })}</span>
        <span className={full ? "font-medium text-red-800" : "text-muted-foreground"}>
          {full ? t("capacity.full") : t("capacity.left", { count: capacity - reserved })}
        </span>
      </div>
      <div
        role="progressbar" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={reserved}
        aria-label={t("capacity.seats", { reserved, capacity })}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", full ? "bg-red-700" : pct >= 75 ? "bg-amber-600" : "bg-emerald-700")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
