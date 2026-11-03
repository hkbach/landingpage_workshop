"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { ariaSort, type SortState } from "@/lib/table-sort";
import { cn } from "@/lib/utils";

/**
 * The header of a column that sorts the table on a click: ascending, descending, then the table's own order. It shows which way the column is
 * sorted, and says so to screen readers (`aria-sort`). `align="right"` for a column of amounts.
 */
export function SortableHead({ label, sortKey, sort, onSort, align = "left", className }: {
  label: string; sortKey: string; sort: SortState; onSort: (key: string) => void; align?: "left" | "right"; className?: string;
}) {
  const t = useTranslations("common.sort");
  const state = ariaSort(sort, sortKey);
  const Icon = state === "ascending" ? ArrowUp : state === "descending" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead aria-sort={state} className={cn(align === "right" && "text-right", className)}>
      <button
        type="button" data-testid={`sort-${sortKey}`} onClick={() => onSort(sortKey)} title={t("by", { column: label })}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className={cn("size-3.5 shrink-0", state === "none" ? "text-muted-foreground/60" : "text-foreground")} aria-hidden="true" />
        <span className="sr-only">{state === "ascending" ? t("ascending") : state === "descending" ? t("descending") : t("none")}</span>
      </button>
    </TableHead>
  );
}
