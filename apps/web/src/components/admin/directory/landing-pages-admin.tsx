"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminLandingPage } from "@/lib/admin-types";
import { StatusBadge } from "../status-badge";
import { landingUrl } from "../utils";
import { DirectoryTable, Toolbar, useDebounced, useDirectory, type Column } from "./kit";

/**
 * The landing pages of the shops: search by the name of the shop. Edit opens the landing pages of the shop and their builder (the same as the shop owner's) inside the admin area,
 * at /systemadmin/shops/{slug}/site, never in the shop owner area; the audit log records that the edits are made by an administrator.
 */
export function LandingPagesAdmin() {
  const t = useTranslations("admin.landing");
  const router = useRouter();
  const [q, setQ] = useState("");
  const typed = useDebounced(q);
  const { items, error } = useDirectory<AdminLandingPage>("landing-pages", { q: typed });

  // The editor asks for the reason (in its banner) and the server writes it on the audit line of the changes: nothing to record when the page opens.
  const edit = (p: AdminLandingPage) => router.push(`/systemadmin/shops/${p.slug}/site`);

  const columns: Column<AdminLandingPage>[] = [
    { key: "shop", header: t("col.shop"), cell: (p) => <><div className="font-medium">{p.shopName}</div><div className="font-mono text-xs text-muted-foreground">{p.slug}</div></> },
    { key: "owner", header: t("col.owner"), cell: (p) => p.ownerEmail },
    { key: "status", header: t("col.status"), cell: (p) => <StatusBadge status={p.status} /> },
    { key: "workshops", header: t("col.workshops"), className: "text-right", cell: (p) => p.workshops },
    { key: "page", header: t("col.page"), cell: (p) => (p.status === "ACTIVE" ? <a href={landingUrl(p.slug, p.customDomain)} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">{p.customDomain || p.slug}<span className="sr-only"> {t("opensNewTab")}</span></a> : "—") },
    {
      key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right",
      cell: (p) => p.editable
        ? <Button size="sm" variant="outline" onClick={() => edit(p)}><Pencil aria-hidden /> {t("edit")}<span className="sr-only"> {p.shopName}</span></Button>
        : <span className="text-xs text-muted-foreground">{t("notEditable")}</span>,
    },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ} />
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(p) => p.shopId} resetKey={typed} testId="landing-table" />
    </div>
  );
}
