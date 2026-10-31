"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { AbuseReport } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ReasonDialog } from "./reason-dialog";
import { fmt } from "./utils";

type ReportStatus = AbuseReport["status"];
type Filter = "ALL" | ReportStatus;
const STATUSES: ReportStatus[] = ["OPEN", "RESOLVED", "DISMISSED"];
const STYLES: Record<ReportStatus, string> = {
  OPEN: "bg-amber-100 text-amber-950",
  RESOLVED: "bg-emerald-100 text-emerald-950",
  DISMISSED: "bg-slate-200 text-slate-900",
};

export function ReportsList({ initial, shopIds }: { initial: AbuseReport[]; shopIds: Record<string, string> }) {
  const t = useTranslations("admin.reports");
  const tc = useTranslations("admin.common");
  const locale = useLocale();
  const [reports, setReports] = useState(initial);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [target, setTarget] = useState<{ id: string; kind: "RESOLVED" | "DISMISSED" } | null>(null);
  const [message, setMessage] = useState("");

  const rows = filter === "ALL" ? reports : reports.filter((r) => r.status === filter);
  const count = (f: Filter) => (f === "ALL" ? reports.length : reports.filter((r) => r.status === f).length);

  function confirm() {
    if (!target) return;
    // Simulated: only OPEN reports can transition to RESOLVED / DISMISSED.
    setReports((rs) => rs.map((r) => (r.id === target.id && r.status === "OPEN" ? { ...r, status: target.kind } : r)));
    setMessage(t(target.kind === "RESOLVED" ? "resolved" : "dismissed"));
    setTarget(null);
  }

  return (
    <div className="grid gap-4">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList aria-label={t("filterLabel")} className="h-auto flex-wrap">
          {(["ALL", ...STATUSES] as const).map((f) => (
            <TabsTrigger key={f} value={f}>
              {f === "ALL" ? tc("all") : t(`status.${f}`)} ({count(f)})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <p role="status" className="min-h-5 text-sm font-medium text-emerald-800">
        {message}
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{t(`reason.${r.reason}`)}</Badge>
                    <Badge className={cn(STYLES[r.status])}>{t(`status.${r.status}`)}</Badge>
                    <span className="text-sm">
                      {t("shop")}: <span className="font-mono font-medium">{r.shopSlug}</span>
                    </span>
                  </div>
                  {/* User-submitted text: rendered as plain text only. */}
                  <p className="text-sm">{r.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.reporterEmail ? t("reporter", { email: r.reporterEmail }) : t("anonymous")} ·{" "}
                    {t("received", { date: fmt(r.createdAt, locale) })} · {tc("utcNote")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {shopIds[r.shopSlug] && (
                      <Link
                        href={`/admin/organizations/${shopIds[r.shopSlug]}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {t("viewShop")}
                        <span className="sr-only">: {r.shopSlug}</span>
                      </Link>
                    )}
                    {r.status === "OPEN" && (
                      <>
                        <Button size="sm" onClick={() => setTarget({ id: r.id, kind: "RESOLVED" })}>
                          {t("resolve")}
                          <span className="sr-only">: {r.shopSlug}</span>
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setTarget({ id: r.id, kind: "DISMISSED" })}>
                          {t("dismiss")}
                          <span className="sr-only">: {r.shopSlug}</span>
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ReasonDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target?.kind === "DISMISSED" ? t("dismissTitle") : t("resolveTitle")}
        description={target?.kind === "DISMISSED" ? t("dismissBody") : t("resolveBody")}
        confirmLabel={target?.kind === "DISMISSED" ? t("dismiss") : t("resolve")}
        reason="optional"
        onConfirm={confirm}
      />
    </div>
  );
}
