"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { WORKSHOP_STATUSES, type WorkshopStatus } from "@workshop/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field } from "@/components/ops/field";
import { NativeSelect } from "@/components/ops/native-select";
import { matchesSearch } from "@/lib/text-search";

/** One workshop of the list: what the filters read (`search` is its name in every language) and its table row, built by the page on the server. */
export interface WorkshopTableItem { id: string; status: WorkshopStatus; search: string; row: ReactNode }

/** The workshop table with its filters: a search by the name of the workshop (any language, accents ignored) and a filter by status. */
export function WorkshopsTable({ items }: { items: WorkshopTableItem[] }) {
  const t = useTranslations("catalog");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | WorkshopStatus>("");
  const shown = items.filter((i) => (!status || i.status === status) && matchesSearch(i.search, q));

  return (
    <div className="grid gap-3">
      <Card>
        <CardContent>
          <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
            <Field id="ws-q" label={t("list.searchLabel")}>
              {(p) => <Input {...p} type="search" value={q} maxLength={80} placeholder={t("list.searchPlaceholder")} autoComplete="off" onChange={(e) => setQ(e.target.value)} />}
            </Field>
            <Field id="ws-status-filter" label={t("form.status")}>
              {(p) => (
                <NativeSelect {...p} value={status} onChange={(e) => setStatus(e.target.value as "" | WorkshopStatus)}
                  options={[{ value: "", label: t("list.allStatuses") }, ...WORKSHOP_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))]} />
              )}
            </Field>
          </form>
        </CardContent>
      </Card>
      {shown.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="workshops-no-match">{t("list.noMatch")}</CardContent></Card>
      ) : (
        <Card>
          <Table data-testid="workshops-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("list.workshop")}</TableHead>
                <TableHead>{t("list.activeSessions")}</TableHead>
                <TableHead>{t("list.promotions")}</TableHead>
                <TableHead title={t("list.maxDiscountHint")}>{t("list.maxDiscount")}</TableHead>
                <TableHead>{t("list.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{shown.map((i) => <Fragment key={i.id}>{i.row}</Fragment>)}</TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
