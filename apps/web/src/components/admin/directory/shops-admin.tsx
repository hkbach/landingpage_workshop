"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Eye, EyeOff, Power } from "lucide-react";
import { ORG_STATUSES, type OrgStatus } from "@workshop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import type { AdminShop } from "@/lib/mock/admin-directory";
import { ReasonDialog } from "../reason-dialog";
import { StatusBadge } from "../status-badge";
import { fmt, landingUrl } from "../utils";
import { DetailDialog, DirectoryTable, FilterBox, Notice, Toolbar, selectClass, useDebounced, useDirectory, type Column } from "./kit";

type Message = { text: string; tone: "ok" | "error" } | null;

/**
 * The shops: search by the name of the shop or the email of its owner, open the detail, activate or deactivate a shop (ACTIVE <-> SUSPENDED, a reason is needed to
 * deactivate), and choose whether its workshops are listed on the Workshops page of the guests.
 */
export function ShopsAdmin() {
  const t = useTranslations("admin.shops");
  const ts = useTranslations("admin.status");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const typed = useDebounced(q);
  const { items, error, reload } = useDirectory<AdminShop>("shops", { q: typed, status });
  const [detail, setDetail] = useState<AdminShop | null>(null);
  const [toggle, setToggle] = useState<AdminShop | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function post(url: string, body: unknown, ok: string) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setMessage(res?.ok ? { text: ok, tone: "ok" } : { text: t("failed"), tone: "error" });
    reload();
  }

  const columns: Column<AdminShop>[] = [
    { key: "name", header: t("col.name"), cell: (s) => <><div className="font-medium">{s.name}</div><div className="font-mono text-xs text-muted-foreground">{s.slug}</div></> },
    { key: "owner", header: t("col.owner"), cell: (s) => <><div>{s.ownerName}</div><div className="text-xs text-muted-foreground">{s.ownerEmail}</div></> },
    { key: "status", header: t("col.status"), cell: (s) => <StatusBadge status={s.status} /> },
    { key: "workshops", header: t("col.workshops"), className: "text-right", cell: (s) => s.workshops },
    { key: "sessions", header: t("col.sessions"), className: "text-right", cell: (s) => s.sessions },
    { key: "bookings", header: t("col.bookings"), className: "text-right", cell: (s) => s.bookings },
    { key: "guests", header: t("col.guests"), cell: (s) => (s.showOnCustomerPage ? t("shown") : t("hidden")) },
    {
      key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right",
      cell: (s) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setDetail(s)}>{t("view")}</Button>
          {s.status === "ACTIVE" || s.status === "SUSPENDED" ? (
            <Button size="sm" variant="outline" onClick={() => setToggle(s)}><Power aria-hidden /> {s.status === "ACTIVE" ? t("deactivate") : t("activate")}</Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void post(`/api/v1/admin/organizations/${encodeURIComponent(s.id)}/visibility`, { show: !s.showOnCustomerPage }, t(s.showOnCustomerPage ? "hiddenDone" : "shownDone", { name: s.name }))}>
            {s.showOnCustomerPage ? <EyeOff aria-hidden /> : <Eye aria-hidden />} {s.showOnCustomerPage ? t("hide") : t("show")}
          </Button>
          <Link href={`/systemadmin/organizations/${s.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>{t("manage")}</Link>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Notice message={message} />
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ}>
        <FilterBox id="shops-status" label={t("col.status")}>
          <select id="shops-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("all")}</option>
            {ORG_STATUSES.map((s: OrgStatus) => <option key={s} value={s}>{ts(s)}</option>)}
          </select>
        </FilterBox>
      </Toolbar>
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(s) => s.id} resetKey={`${typed}|${status}`} testId="shops-table" />

      <DetailDialog
        open={detail !== null} onClose={() => setDetail(null)} title={detail?.name ?? ""} description={detail?.slug ?? ""}
        rows={detail ? [
          [t("col.status"), <StatusBadge key="s" status={detail.status} />], [t("reason"), detail.statusReason ?? ""],
          [t("col.owner"), detail.ownerName], [t("ownerEmail"), detail.ownerEmail], [t("contact"), `${detail.contactEmail} · ${detail.contactPhone}`], [t("address"), detail.address],
          [t("country"), detail.country], [t("timezone"), detail.timezone], [t("currency"), detail.currency], [t("plan"), detail.plan], [t("created"), fmt(detail.createdAt, locale)],
          [t("col.workshops"), detail.workshops], [t("col.sessions"), detail.sessions], [t("col.bookings"), detail.bookings], [t("col.guests"), detail.showOnCustomerPage ? t("shown") : t("hidden")],
          [t("landing"), detail.status === "ACTIVE" ? <a key="l" href={landingUrl(detail.slug)} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">{landingUrl(detail.slug)}</a> : ""],
        ] : []}
      />
      <ReasonDialog
        open={toggle !== null} onOpenChange={(o) => { if (!o) setToggle(null); }} reason={toggle?.status === "ACTIVE" ? "required" : "none"} destructive={toggle?.status === "ACTIVE"}
        title={toggle ? t(toggle.status === "ACTIVE" ? "deactivateTitle" : "activateTitle", { name: toggle.name }) : ""} description={toggle ? t(toggle.status === "ACTIVE" ? "deactivateBody" : "activateBody") : ""}
        confirmLabel={toggle?.status === "ACTIVE" ? t("deactivate") : t("activate")}
        onConfirm={(reason) => { const s = toggle!; setToggle(null); void post(`/api/v1/admin/organizations/${encodeURIComponent(s.id)}/status`, { active: s.status !== "ACTIVE", ...(reason ? { reason } : {}) }, t(s.status === "ACTIVE" ? "deactivated" : "activated", { name: s.name })); }}
      />
    </div>
  );
}
