"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Lock, LockOpen, Pencil } from "lucide-react";
import { SESSION_STATUSES, canAdminClose, canAdminReopen, closedForGood, type SessionStatus } from "@workshop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime } from "@/lib/format";
import type { AdminSession } from "@/lib/admin-types";
import { ReasonDialog } from "../reason-dialog";
import { fmt } from "../utils";
import { DetailDialog, DirectoryTable, FilterBox, Notice, Pill, Toolbar, selectClass, useCodeLabel, useDebounced, useDirectory, type Column } from "./kit";

type Message = { text: string; tone: "ok" | "error" } | null;
const TONE: Record<SessionStatus, "sky" | "slate" | "green" | "amber"> = { OPEN: "sky", PAUSED: "slate", RUNNING: "green", CLOSED: "amber", COMPLETED: "green" };

/**
 * The sessions of every shop. Edit opens the sessions page of the shop (the same as the shop owner's, on the admin site: add, edit, close, reschedule and the rest). Search by the information of the session (code, workshop, day, status, notes) or the name of the shop. An administrator can close a session
 * (with a reason) and open it again without the limits of the shop owner, so a session the owner closed more than 3 times (closed for good) can be opened again.
 */
/** The sample data takes the action on `/admin/sessions/{id}`; the API takes it on the shop of the session (`/admin/shops/{shopId}/sessions/{id}/close`), which a row from the API has in `shopId`. */
const shopAction = (s: AdminSession, action: "close" | "reopen") => ((s as { viaApi?: boolean }).viaApi ? `/api/v1/admin/shops/${encodeURIComponent(s.shopId)}/sessions/${encodeURIComponent(s.id)}/${action}` : `/api/v1/admin/sessions/${encodeURIComponent(s.id)}`);

export function SessionsAdmin() {
  const t = useTranslations("admin.sessionsAll");
  const locale = useLocale();
  const label = useCodeLabel();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [forGood, setForGood] = useState(false);
  const typed = useDebounced(q);
  const { items, error, reload } = useDirectory<AdminSession>("sessions", { q: typed, status });
  const [detail, setDetail] = useState<AdminSession | null>(null);
  const [closing, setClosing] = useState<AdminSession | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [now] = useState(() => new Date());
  const rows = useMemo(() => (items === null ? null : forGood ? items.filter((s) => closedForGood(s)) : items), [items, forGood]);

  async function change(s: AdminSession, action: "close" | "reopen", reason = "") {
    const res = await fetch(shopAction(s, action), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...(reason ? { reason } : {}) }) }).catch(() => null);
    setClosing(null);
    setMessage(res?.ok ? { text: t(action === "close" ? "closed" : "reopened", { code: s.code }), tone: "ok" } : { text: t("failed"), tone: "error" });
    reload();
  }

  const columns: Column<AdminSession>[] = [
    { key: "code", header: t("col.code"), cell: (s) => <span className="font-mono text-xs">{s.code}</span> },
    { key: "workshop", header: t("col.workshop"), cell: (s) => <><div className="font-medium">{s.workshopTitle}</div><div className="text-xs text-muted-foreground">{s.shopName}</div></> },
    { key: "start", header: t("col.start"), cell: (s) => <span className="whitespace-nowrap" title={s.timezone}>{formatDateTime(s.startsAt, s.timezone, locale)}</span> },
    { key: "seats", header: t("col.seats"), className: "text-right tabular-nums", cell: (s) => `${s.reservedCount} / ${s.capacity}` },
    { key: "status", header: t("col.status"), cell: (s) => <span className="inline-flex flex-wrap items-center gap-1"><Pill tone={TONE[s.status]}>{t(`status.${s.status}`)}</Pill>{closedForGood(s) ? <span className="text-xs text-muted-foreground">{t("forGood")}</span> : null}</span> },
    { key: "closes", header: t("col.closes"), className: "text-right tabular-nums", cell: (s) => `${s.closes} / 4` },
    {
      key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right",
      cell: (s) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setDetail(s)}>{t("view")}<span className="sr-only"> {s.code}</span></Button>
          {s.editable ? <Link href={`/systemadmin/shops/${s.shopSlug}/sessions`} className={buttonVariants({ size: "sm", variant: "outline" })} data-testid="session-edit"><Pencil aria-hidden />{t("edit")}<span className="sr-only"> {s.shopName}</span></Link> : null}
          {canAdminClose(s) ? <Button size="sm" variant="destructive" onClick={() => setClosing(s)}><Lock aria-hidden />{t("close")}<span className="sr-only"> {s.code}</span></Button> : null}
          {canAdminReopen(s, now) ? <Button size="sm" variant="outline" onClick={() => void change(s, "reopen")}><LockOpen aria-hidden />{t("reopen")}<span className="sr-only"> {s.code}</span></Button> : null}
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
        <FilterBox id="ses-status" label={t("col.status")}>
          <select id="ses-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("all")}</option>
            {SESSION_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </FilterBox>
        <label className="flex h-8 items-center gap-2 text-sm"><Checkbox checked={forGood} onCheckedChange={(v) => setForGood(v === true)} />{t("onlyForGood")}</label>
      </Toolbar>
      <DirectoryTable rows={rows} error={error} columns={columns} rowKey={(s) => s.id} resetKey={`${typed}|${status}|${forGood}`} testId="sessions-all-table" />
      <DetailDialog
        open={detail !== null} onClose={() => setDetail(null)} title={detail?.code ?? ""} description={detail ? `${detail.workshopTitle} · ${detail.shopName}` : ""}
        rows={detail ? [
          [t("col.status"), t(`status.${detail.status}`)], [t("col.start"), `${formatDateTime(detail.startsAt, detail.timezone, locale)} (${detail.timezone})`], [t("end"), formatDateTime(detail.endsAt, detail.timezone, locale)],
          [t("col.seats"), `${detail.reservedCount} / ${detail.capacity}`], [t("cutoff"), t("minutes", { n: detail.bookingCutoffMinutes })], [t("col.closes"), `${detail.closes} / 4`],
          [t("history"), detail.notes?.length ? (
            <ul key="h" className="grid gap-1">
              {detail.notes.map((n, i) => <li key={i}>{fmt(n.at, locale)} · {label("noteType", n.type)}{n.by === "ADMIN" ? ` (${t("byAdmin")})` : ""}{n.reason ? ` — ${label("reason", n.reason.code)}${n.reason.note ? `: ${n.reason.note}` : ""}` : ""}</li>)}
            </ul>
          ) : ""],
        ] : []}
      />
      <ReasonDialog
        open={closing !== null} onOpenChange={(o) => { if (!o) setClosing(null); }} reason="required" destructive
        title={t("closeTitle", { code: closing?.code ?? "" })} description={t("closeBody")} confirmLabel={t("close")}
        onConfirm={(why) => { if (closing) void change(closing, "close", why); }}
      />
    </div>
  );
}
