"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCw, Search } from "lucide-react";
import { REPORT_REASONS, type ReportFilter, type ReportReason, type ReportRecord, type ReportStatus } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/dashboard/shell/native-select";
import { ApiError, decideReportRequest, fetchAdminReports } from "@/lib/reports-api";
import { cn } from "@/lib/utils";
import { ReasonDialog } from "./reason-dialog";
import { ReportDetailDialog } from "./report-detail-dialog";
import { REPORT_STATUS_STYLES } from "./report-styles";
import { fmt } from "./utils";

interface Filters {
  status: "ALL" | ReportStatus;
  reason: "ALL" | ReportReason;
  shop: string;
  sort: "newest" | "oldest";
}
const DEFAULT_FILTERS: Filters = { status: "ALL", reason: "ALL", shop: "ALL", sort: "newest" };
const REFRESH_MS = 15_000;

/** Waits for the typing to pause before the search is sent. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * Report management (FR-ADM-04): the reports visitors send with "Report this site" on a shop's landing page.
 * Filter, search, read the details and resolve or dismiss each one. The list refreshes by itself.
 */
export function ReportManagement({ shopIds }: { shopIds: Record<string, string> }) {
  const t = useTranslations("admin.reports");
  const tc = useTranslations("admin.common");
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; kind: "RESOLVED" | "DISMISSED" } | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const apiFilter: ReportFilter = {
    ...(filters.status !== "ALL" ? { status: filters.status } : {}),
    ...(filters.reason !== "ALL" ? { reason: filters.reason } : {}),
    ...(filters.shop !== "ALL" ? { shop: filters.shop } : {}),
    ...(q ? { q } : {}),
    sort: filters.sort,
  };
  const query = useQuery({
    queryKey: ["admin-reports", apiFilter],
    queryFn: () => fetchAdminReports(apiFilter),
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; kind: "RESOLVED" | "DISMISSED"; note: string }) =>
      decideReportRequest(v.id, { status: v.kind, ...(v.note ? { note: v.note } : {}) }),
    onSuccess: (_report, v) => {
      setMessage({ text: t(v.kind === "RESOLVED" ? "resolved" : "dismissed"), tone: "ok" });
      void queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
    },
    onError: (e) => {
      setMessage({ text: e instanceof ApiError && e.status === 409 ? t("conflict") : t("saveError"), tone: "error" });
      void queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
    },
  });

  const counts = query.data?.counts;
  const items = query.data?.items ?? [];
  const detail: ReportRecord | null = detailId ? items.find((r) => r.id === detailId) ?? null : null;
  const filtered = filters.status !== "ALL" || filters.reason !== "ALL" || filters.shop !== "ALL" || q !== "";
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const clear = () => { setFilters(DEFAULT_FILTERS); setSearch(""); };

  const SUMMARY: { key: Filters["status"]; label: string; value: number | undefined; accent?: string }[] = [
    { key: "OPEN", label: t("status.OPEN"), value: counts?.OPEN, accent: "text-amber-900" },
    { key: "RESOLVED", label: t("status.RESOLVED"), value: counts?.RESOLVED },
    { key: "DISMISSED", label: t("status.DISMISSED"), value: counts?.DISMISSED },
    { key: "ALL", label: t("summary.total"), value: counts?.total },
  ];

  return (
    <div className="grid gap-4">
      {/* Summary: also the status filter. */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t("filterLabel")}>
        {SUMMARY.map((s) => {
          const on = filters.status === s.key;
          return (
            <li key={s.key}>
              <button
                type="button" aria-pressed={on} onClick={() => set("status", s.key)}
                className={cn(
                  "w-full rounded-xl border bg-card p-3 text-left outline-none transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  on && "border-primary ring-2 ring-primary/30",
                )}
              >
                <span className="block text-xs text-muted-foreground">{s.label}</span>
                <span className={cn("block text-2xl font-semibold tabular-nums", s.accent)}>{s.value ?? "–"}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="rp-search">{t("searchLabel")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="rp-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={120}
                placeholder={t("searchPlaceholder")} className="pl-8"
              />
            </div>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="rp-reason">{t("reasonFilter")}</Label>
            <NativeSelect id="rp-reason" value={filters.reason} onChange={(e) => set("reason", e.target.value as Filters["reason"])}>
              <option value="ALL">{t("allReasons")}</option>
              {REPORT_REASONS.map((r) => <option key={r} value={r}>{t(`reason.${r}`)}</option>)}
            </NativeSelect>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="rp-shop">{t("shopFilter")}</Label>
            <NativeSelect id="rp-shop" value={filters.shop} onChange={(e) => set("shop", e.target.value)}>
              <option value="ALL">{t("allShops")}</option>
              {(query.data?.shops ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </NativeSelect>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="rp-sort">{t("sortLabel")}</Label>
            <NativeSelect id="rp-sort" value={filters.sort} onChange={(e) => set("sort", e.target.value as Filters["sort"])}>
              <option value="newest">{t("sort.newest")}</option>
              <option value="oldest">{t("sort.oldest")}</option>
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className={cn("min-h-5 text-sm font-medium", message?.tone === "error" ? "text-destructive" : "text-emerald-800")}>
          {message?.text}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {query.dataUpdatedAt ? <span>{t("lastUpdated", { time: new Date(query.dataUpdatedAt).toLocaleTimeString(locale) })}</span> : null}
          {filtered ? <Button size="sm" variant="ghost" onClick={clear}>{t("clearFilters")}</Button> : null}
          <Button size="sm" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={cn(query.isFetching && "animate-spin")} aria-hidden />{t("refresh")}
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <p role="status" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError && !query.data ? (
        <div role="alert" className="grid justify-items-center gap-3 rounded-xl border border-destructive/40 p-8 text-center text-sm">
          <p>{t("loadError")}</p>
          <Button size="sm" onClick={() => void query.refetch()}>{t("retry")}</Button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{filtered ? t("empty") : t("noReports")}</p>
      ) : (
        <ul className="grid gap-3">
          {items.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{t(`reason.${r.reason}`)}</Badge>
                    <Badge className={cn(REPORT_STATUS_STYLES[r.status])}>{t(`status.${r.status}`)}</Badge>
                    <span className="text-sm">
                      {t("shop")}: <span className="font-mono font-medium">{r.shopSlug}</span>
                    </span>
                  </div>
                  {/* Text typed by a visitor: plain text only. */}
                  <p className="line-clamp-2 break-words text-sm">{r.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.reporterEmail ? t("reporter", { email: r.reporterEmail }) : t("anonymous")} ·{" "}
                    {t("received", { date: fmt(r.createdAt, locale) })} · {tc("utcNote")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDetailId(r.id)}>
                      {t("viewDetails")}<span className="sr-only">: {r.shopSlug}</span>
                    </Button>
                    {r.status === "OPEN" ? (
                      <>
                        <Button size="sm" onClick={() => setTarget({ id: r.id, kind: "RESOLVED" })}>
                          {t("resolve")}<span className="sr-only">: {r.shopSlug}</span>
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setTarget({ id: r.id, kind: "DISMISSED" })}>
                          {t("dismiss")}<span className="sr-only">: {r.shopSlug}</span>
                        </Button>
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ReportDetailDialog
        report={detail}
        shopId={detail ? shopIds[detail.shopSlug] : undefined}
        onClose={() => setDetailId(null)}
        onDecide={(id, kind) => { setDetailId(null); setTarget({ id, kind }); }}
      />

      <ReasonDialog
        open={target !== null}
        onOpenChange={(o) => { if (!o) setTarget(null); }}
        title={target?.kind === "DISMISSED" ? t("dismissTitle") : t("resolveTitle")}
        description={target?.kind === "DISMISSED" ? t("dismissBody") : t("resolveBody")}
        confirmLabel={target?.kind === "DISMISSED" ? t("dismiss") : t("resolve")}
        reason="optional"
        onConfirm={(note) => {
          if (!target) return;
          setMessage(null);
          decide.mutate({ id: target.id, kind: target.kind, note: note.trim() });
          setTarget(null);
        }}
      />
    </div>
  );
}

