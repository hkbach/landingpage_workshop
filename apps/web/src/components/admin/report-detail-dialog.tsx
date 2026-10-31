"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReportRecord } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { REPORT_STATUS_STYLES } from "./report-styles";
import { fmt, landingUrl } from "./utils";

/** Everything about one report, with the decision buttons for an open one. */
export function ReportDetailDialog({ report, shopId, onClose, onDecide }: {
  report: ReportRecord | null;
  shopId?: string;
  onClose: () => void;
  onDecide: (id: string, kind: "RESOLVED" | "DISMISSED") => void;
}) {
  return (
    <Dialog open={report !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {/* Mounted only while a report is selected. */}
        {report ? <Body report={report} shopId={shopId} onClose={onClose} onDecide={onDecide} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({ report: r, shopId, onClose, onDecide }: { report: ReportRecord; shopId?: string; onClose: () => void; onDecide: (id: string, kind: "RESOLVED" | "DISMISSED") => void }) {
  const t = useTranslations("admin.reports");
  const tc = useTranslations("admin.common");
  const locale = useLocale();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("detail.title")}</DialogTitle>
        <DialogDescription>
          <span className="font-mono text-xs">{r.id}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{t(`reason.${r.reason}`)}</Badge>
        <Badge className={cn(REPORT_STATUS_STYLES[r.status])}>{t(`status.${r.status}`)}</Badge>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t("shop")}</dt>
          <dd className="font-mono font-medium">{r.shopSlug}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("detail.reporter")}</dt>
          <dd className="break-all">{r.reporterEmail ?? t("detail.anonymous")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("detail.received")}</dt>
          <dd>{fmt(r.createdAt, locale)}</dd>
        </div>
        {r.handledAt ? (
          <div>
            <dt className="text-xs text-muted-foreground">{t("detail.handled")}</dt>
            <dd>{fmt(r.handledAt, locale)}{r.handledBy ? ` · ${r.handledBy}` : ""}</dd>
          </div>
        ) : null}
      </dl>

      <div className="grid gap-1">
        <p className="text-xs text-muted-foreground">{t("detail.description")}</p>
        {/* Text typed by a visitor: rendered as plain text only (never as HTML). */}
        <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm">{r.description}</p>
      </div>

      {r.status !== "OPEN" ? (
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">{t("detail.note")}</p>
          <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm">{r.note ?? t("detail.noNote")}</p>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{tc("utcNote")}</p>

      <DialogFooter className="flex-wrap sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {shopId ? (
            <Link href={`/admin/organizations/${shopId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>{t("viewShop")}</Link>
          ) : null}
          <a href={landingUrl(r.shopSlug)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("detail.openSite")}<span className="sr-only"> {tc("opensNewTab")}</span>
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.status === "OPEN" ? (
            <>
              <Button size="sm" onClick={() => onDecide(r.id, "RESOLVED")}>{t("resolve")}</Button>
              <Button size="sm" variant="secondary" onClick={() => onDecide(r.id, "DISMISSED")}>{t("dismiss")}</Button>
            </>
          ) : null}
          <Button size="sm" variant="outline" onClick={onClose}>{t("detail.close")}</Button>
        </div>
      </DialogFooter>
    </>
  );
}
