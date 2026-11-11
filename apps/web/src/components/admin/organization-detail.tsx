"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { OrgStatus } from "@workshop/shared";
import type { AuditEntry, Shop } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { usePagination } from "@/lib/pagination";
import { ReasonDialog } from "./reason-dialog";
import { StatusBadge } from "./status-badge";
import { fmt, landingHost, landingUrl } from "./utils";

export function OrganizationDetail({
  shop, stats, audit,
}: {
  shop: Shop;
  stats: { workshops: number; bookings30d: number };
  audit: AuditEntry[];
}) {
  const t = useTranslations("admin.orgDetail");
  const tc = useTranslations("admin.common");
  const locale = useLocale();
  const [status, setStatus] = useState<OrgStatus>(shop.status);
  const [reason, setReason] = useState(shop.statusReason);
  const [entries, setEntries] = useState(audit);
  const [dialog, setDialog] = useState<"suspend" | "reactivate" | null>(null);
  const [message, setMessage] = useState("");
  const auditPg = usePagination(entries, "");

  async function apply(kind: "suspend" | "reactivate", why: string) {
    // Valid transitions only (ACTIVE <-> SUSPENDED): the mock backend keeps the change, so the lists of the admin and the guests see it.
    const res = await fetch(`/api/v1/admin/organizations/${encodeURIComponent(shop.id)}/status`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: kind === "reactivate", ...(why ? { reason: why } : {}) }),
    }).catch(() => null);
    if (!res?.ok) { setMessage(t("actionFailed")); setDialog(null); return; }
    setStatus(kind === "suspend" ? "SUSPENDED" : "ACTIVE");
    setReason(kind === "suspend" ? why : undefined);
    setEntries((e) => [
      {
        id: `au-local-${e.length + 1}-${Date.now()}`,
        organizationId: shop.id,
        actor: "Platform Admin",
        action: `organization.${kind}`,
        entityType: "organization",
        entityId: shop.id,
        createdAt: new Date().toISOString(),
      },
      ...e,
    ]);
    setMessage(t(kind === "suspend" ? "suspendDone" : "reactivateDone", { name: shop.name }));
    setDialog(null);
  }

  const rows: Array<[string, React.ReactNode]> = [
    [t("owner"), shop.ownerName],
    [t("email"), shop.ownerEmail],
    [t("created"), fmt(shop.createdAt, locale)],
    [t("country"), shop.country],
    [t("timezone"), shop.timezone],
    [t("currency"), shop.currency],
    [t("workshops"), stats.workshops],
    [t("bookings"), stats.bookings30d],
    [
      t("landing"),
      status === "ACTIVE" ? (
        <a
          key="landing"
          href={landingUrl(shop.slug)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
        >
          {landingHost(shop.slug)} <ExternalLink className="size-3" aria-hidden />
          <span className="sr-only">{tc("opensNewTab")}</span>
        </a>
      ) : (
        tc("notPublic")
      ),
    ],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("overview")} <StatusBadge status={status} />
          </CardTitle>
          <CardDescription>{tc("utcNote")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            {reason && (
              <>
                <dt className="text-muted-foreground">{t("statusReason")}</dt>
                <dd>{reason}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("actionsTitle")}</CardTitle>
            <CardDescription>
              {status === "ACTIVE" ? t("actionsActive") : status === "SUSPENDED" ? t("actionsSuspended") : t("actionsOther")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p role="status" className="text-sm font-medium text-emerald-800">
              {message}
            </p>
            <div className="flex flex-wrap gap-2">
              {status === "ACTIVE" && (
                <Button variant="destructive" onClick={() => setDialog("suspend")}>
                  {t("suspend")}
                </Button>
              )}
              {status === "SUSPENDED" && <Button onClick={() => setDialog("reactivate")}>{t("reactivate")}</Button>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("recentAudit")}</CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noAudit")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("when")}</TableHead>
                    <TableHead>{t("actor")}</TableHead>
                    <TableHead>{t("action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditPg.items.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">{fmt(a.createdAt, locale)}</TableCell>
                      <TableCell>{a.actor}</TableCell>
                      <TableCell className="font-mono text-xs">{a.action}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <PaginationBar {...auditPg.bar} />
          </CardContent>
        </Card>
      </div>

      <ReasonDialog
        open={dialog === "suspend"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("suspendTitle", { name: shop.name })}
        description={t("suspendBody")}
        confirmLabel={t("suspend")}
        reason="required"
        destructive
        onConfirm={(why) => apply("suspend", why)}
      />
      <ReasonDialog
        open={dialog === "reactivate"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("reactivateTitle", { name: shop.name })}
        description={t("reactivateBody")}
        confirmLabel={t("reactivate")}
        reason="required"
        onConfirm={(why) => apply("reactivate", why)}
      />
    </div>
  );
}
