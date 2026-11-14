"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { formatMoney } from "@workshop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import type { AdminWorkshop } from "@/lib/admin-types";
import { fmt } from "../utils";
import { DetailDialog, DirectoryTable, Pill, Toolbar, humanize, useDebounced, useDirectory, type Column } from "./kit";

/** The workshops of every shop: search by the workshop or the shop, open the detail, or Edit: the workshops page of the shop (the same as the shop owner's, on the admin site). */
export function WorkshopsAdmin() {
  const t = useTranslations("admin.workshops");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const typed = useDebounced(q);
  const { items, error } = useDirectory<AdminWorkshop>("workshops", { q: typed });
  const [detail, setDetail] = useState<AdminWorkshop | null>(null);

  const columns: Column<AdminWorkshop>[] = [
    { key: "title", header: t("col.title"), cell: (w) => <><div className="font-medium">{w.title}</div><div className="text-xs text-muted-foreground">{w.categories.length ? w.categories.map(humanize).join(", ") : "—"}</div></> },
    { key: "shop", header: t("col.shop"), cell: (w) => w.shopName },
    { key: "status", header: t("col.status"), cell: (w) => <Pill tone={w.status === "ACTIVE" ? "green" : "slate"}>{t(`status.${w.status}`)}</Pill> },
    { key: "price", header: t("col.price"), className: "text-right", cell: (w) => formatMoney(w.priceAmount, w.currency, locale) },
    { key: "sessions", header: t("col.sessions"), className: "text-right", cell: (w) => w.sessions },
    { key: "bookings", header: t("col.bookings"), className: "text-right", cell: (w) => w.bookings },
    { key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right", cell: (w) => (
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setDetail(w)}>{t("view")}</Button>
        {w.editable ? <Link href={`/systemadmin/shops/${w.shopSlug}/workshops`} className={buttonVariants({ size: "sm", variant: "outline" })} data-testid="workshop-edit"><Pencil aria-hidden />{t("edit")}<span className="sr-only"> {w.shopName}</span></Link> : null}
      </div>
    ) },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ} />
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(w) => w.id} resetKey={typed} testId="workshops-table" />
      <DetailDialog
        open={detail !== null} onClose={() => setDetail(null)} title={detail?.title ?? ""} description={detail?.shopName ?? ""}
        rows={detail ? [
          [t("col.status"), t(`status.${detail.status}`)], [t("category"), detail.categories.map(humanize).join(", ")], [t("description2"), detail.description],
          [t("col.price"), formatMoney(detail.priceAmount, detail.currency, locale)], [t("duration"), t("minutes", { n: detail.durationMinutes })],
          [t("capacity"), detail.defaultCapacity], [t("maxPerBooking"), detail.maxPerBooking], [t("address"), detail.address ?? t("shopAddress")], [t("addressNote"), detail.addressNote ?? ""],
          [t("rating"), detail.rating ? `${detail.rating.average} (${detail.rating.count})` : ""], [t("col.sessions"), detail.sessions], [t("col.bookings"), detail.bookings], [t("created"), fmt(detail.createdAt, locale)],
        ] : []}
      />
    </div>
  );
}
