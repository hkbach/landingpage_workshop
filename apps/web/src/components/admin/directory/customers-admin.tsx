"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AdminCustomer } from "@/lib/mock/admin-directory";
import { fmt } from "../utils";
import { DirectoryTable, Pill, Toolbar, useDebounced, useDirectory, type Column } from "./kit";

/** The emails that booked workshops (like the customers of a shop owner, for the whole platform): search by the email, the name, or the shop where the email booked. */
export function CustomersAdmin() {
  const t = useTranslations("admin.customers");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const typed = useDebounced(q);
  const { items, error } = useDirectory<AdminCustomer>("customers", { q: typed });

  const columns: Column<AdminCustomer>[] = [
    { key: "email", header: t("col.email"), cell: (c) => <span className="font-medium">{c.email}</span> },
    { key: "name", header: t("col.name"), cell: (c) => c.name },
    { key: "account", header: t("col.account"), cell: (c) => (c.accountId ? <Pill tone="green">{t("hasAccount")}</Pill> : <Pill tone="slate">{t("guest")}</Pill>) },
    { key: "shops", header: t("col.shops"), cell: (c) => (c.shops.length ? c.shops.join(", ") : "—") },
    { key: "bookings", header: t("col.bookings"), className: "text-right", cell: (c) => c.bookings },
    { key: "last", header: t("col.last"), cell: (c) => (c.lastBookedAt ? fmt(c.lastBookedAt, locale) : "—") },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ} />
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(c) => c.email} resetKey={typed} testId="customers-table" />
    </div>
  );
}
