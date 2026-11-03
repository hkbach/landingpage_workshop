"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_SIZES, type PaginationBarProps } from "@/lib/pagination";

/**
 * The bar under a list: which rows are shown, the number of rows to a page and the previous / next page. It is not shown while the whole list fits the
 * smallest page, so a short list has no bar.
 */
export function PaginationBar({ total, page, pages, from, to, size, onPage, onSize }: PaginationBarProps) {
  const t = useTranslations("common.pagination");
  if (total <= PAGE_SIZES[0]) return null;
  return (
    <nav aria-label={t("label")} data-testid="pagination" className="flex flex-wrap items-center justify-between gap-3 px-1 py-2 text-sm">
      <p role="status" data-testid="page-range" className="text-muted-foreground">{t("showing", { from, to, total })}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("rowsPerPage")}
          <select
            data-testid="page-size" value={size} onChange={(e) => onSize(Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <span data-testid="page-info" className="text-xs text-muted-foreground tabular-nums">{t("page", { page, pages })}</span>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="outline" data-testid="page-prev" disabled={page <= 1} aria-label={t("previous")} onClick={() => onPage(page - 1)}><ChevronLeft aria-hidden="true" /></Button>
          <Button type="button" size="sm" variant="outline" data-testid="page-next" disabled={page >= pages} aria-label={t("next")} onClick={() => onPage(page + 1)}><ChevronRight aria-hidden="true" /></Button>
        </div>
      </div>
    </nav>
  );
}
