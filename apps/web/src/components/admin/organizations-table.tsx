"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { ORG_STATUSES, type OrgStatus } from "@workshop/shared";
import type { Shop } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "./status-badge";
import { fmt, landingHost, landingUrl } from "./utils";

type Filter = "ALL" | OrgStatus;
type Stats = Record<string, { workshops: number; bookings30d: number }>;

export function OrganizationsTable({ shops, stats }: { shops: Shop[]; stats: Stats }) {
  const t = useTranslations("admin.orgs");
  const tc = useTranslations("admin.common");
  const ts = useTranslations("admin.status");
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>("ALL");

  const rows = filter === "ALL" ? shops : shops.filter((s) => s.status === filter);
  const count = (f: Filter) => (f === "ALL" ? shops.length : shops.filter((s) => s.status === f).length);

  return (
    <div className="grid gap-4">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList aria-label={t("filterLabel")} className="h-auto flex-wrap">
          {(["ALL", ...ORG_STATUSES] as const).map((f) => (
            <TabsTrigger key={f} value={f}>
              {f === "ALL" ? tc("all") : ts(f)} ({count(f)})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col.name")}</TableHead>
              <TableHead>{t("col.status")}</TableHead>
              <TableHead>{t("col.owner")}</TableHead>
              <TableHead>{t("col.created")}</TableHead>
              <TableHead className="text-right">{t("col.workshops")}</TableHead>
              <TableHead className="text-right">{t("col.bookings")}</TableHead>
              <TableHead>{t("col.landing")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("col.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s) => {
                const st = stats[s.id] ?? { workshops: 0, bookings30d: 0 };
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{s.slug}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>
                      <div>{s.ownerName}</div>
                      <div className="text-xs text-muted-foreground">{s.ownerEmail}</div>
                    </TableCell>
                    <TableCell>{fmt(s.createdAt, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{st.workshops}</TableCell>
                    <TableCell className="text-right tabular-nums">{st.bookings30d}</TableCell>
                    <TableCell>
                      {s.status === "ACTIVE" ? (
                        <a
                          href={landingUrl(s.slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                          aria-label={`${t("viewLanding", { name: s.name })} ${tc("opensNewTab")}`}
                        >
                          {landingHost(s.slug)} <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{tc("notPublic")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/systemadmin/organizations/${s.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        {tc("details")}
                        <span className="sr-only">: {s.name}</span>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{tc("utcNote")}</p>
    </div>
  );
}
