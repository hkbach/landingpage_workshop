"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EyeOff, Star, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminRating } from "@/lib/admin-types";
import { ReasonDialog } from "../reason-dialog";
import { DirectoryTable, FilterBox, Notice, Pill, Toolbar, selectClass, useDebounced, useDirectory, type Column } from "./kit";

type Message = { text: string; tone: "ok" | "error" } | null;

/**
 * The ratings guests gave to the workshops, with their comments. An administrator removes a rating that breaks the rules (a reason is needed): it no longer counts in the rating of the workshop and the shop
 * owner does not see it; it can be put back.
 */
export function RatingsAdmin() {
  const t = useTranslations("admin.ratings");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [stars, setStars] = useState("");
  const typed = useDebounced(q);
  const { items, error, reload } = useDirectory<AdminRating>("ratings", { q: typed, status, stars });
  const [removing, setRemoving] = useState<AdminRating | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function change(r: AdminRating, removed: boolean, reason = "") {
    setRemoving(null);
    const res = await fetch(`/api/v1/admin/ratings/${encodeURIComponent(r.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ removed, ...(reason ? { reason } : {}) }) }).catch(() => null);
    setMessage(res?.ok ? { text: t(removed ? "removed" : "restored", { code: r.bookingCode }), tone: "ok" } : { text: t("failed"), tone: "error" });
    reload();
  }

  const columns: Column<AdminRating>[] = [
    { key: "workshop", header: t("col.workshop"), cell: (r) => <><div className="text-sm font-medium">{r.workshopTitle}</div><div className="text-xs text-muted-foreground">{r.shopName} · {r.bookingCode}</div></> },
    { key: "guest", header: t("col.guest"), cell: (r) => <><div className="text-sm">{r.customerName}</div><div className="text-xs text-muted-foreground">{r.customerEmail}</div></> },
    { key: "stars", header: t("col.stars"), className: "whitespace-nowrap", cell: (r) => <span className="inline-flex items-center gap-1 tabular-nums" data-testid="rating-stars"><Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden />{r.stars}/5</span> },
    { key: "comment", header: t("col.comment"), className: "max-w-sm", cell: (r) => (r.comment ? <p className="whitespace-pre-wrap break-words text-sm" data-testid="rating-comment">{r.comment}</p> : <span className="text-muted-foreground">{t("noComment")}</span>) },
    { key: "date", header: t("col.date"), className: "whitespace-nowrap text-sm", cell: (r) => r.createdAt.slice(0, 10) },
    { key: "status", header: t("col.status"), cell: (r) => <span title={r.removedReason}><Pill tone={r.status === "SHOWN" ? "green" : "slate"}>{t(`status.${r.status === "SHOWN" ? "VISIBLE" : r.status}`)}</Pill>{r.removedReason ? <span className="block text-xs text-muted-foreground">{r.removedReason}</span> : null}</span> },
    {
      key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right",
      cell: (r) => r.status === "REMOVED"
        ? <Button size="sm" variant="outline" onClick={() => void change(r, false)} data-testid="rating-restore"><Undo2 aria-hidden /> {t("restore")}<span className="sr-only"> {r.bookingCode}</span></Button>
        : <Button size="sm" variant="outline" onClick={() => setRemoving(r)} data-testid="rating-remove"><EyeOff aria-hidden /> {t("remove")}<span className="sr-only"> {r.bookingCode}</span></Button>,
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
        <FilterBox id="ra-status" label={t("col.status")}>
          <select id="ra-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("all")}</option>
            <option value="SHOWN">{t("status.VISIBLE")}</option>
            <option value="REMOVED">{t("status.REMOVED")}</option>
          </select>
        </FilterBox>
        <FilterBox id="ra-stars" label={t("col.stars")}>
          <select id="ra-stars" className={selectClass} value={stars} onChange={(e) => setStars(e.target.value)}>
            <option value="">{t("all")}</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={String(n)}>{n}</option>)}
          </select>
        </FilterBox>
      </Toolbar>
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(r) => r.id} resetKey={`${typed}|${status}|${stars}`} testId="ratings-table" />
      <ReasonDialog
        open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null); }} reason="required" destructive
        title={t("removeTitle", { code: removing?.bookingCode ?? "" })} description={t("removeBody")} confirmLabel={t("remove")}
        onConfirm={(why) => { if (removing) void change(removing, true, why); }}
      />
    </div>
  );
}
