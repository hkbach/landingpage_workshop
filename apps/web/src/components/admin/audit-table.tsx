"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AuditEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt } from "./utils";

const PAGE = 8;
const ANY = "__any__";

export function AuditTable({ entries, orgNames }: { entries: AuditEntry[]; orgNames: Record<string, string> }) {
  const t = useTranslations("admin.audit");
  const locale = useLocale();
  const [action, setAction] = useState(ANY);
  const [entity, setEntity] = useState(ANY);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visible, setVisible] = useState(PAGE); // simulated cursor: how many rows have been "fetched"
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const actions = useMemo(() => [...new Set(entries.map((e) => e.action))].sort(), [entries]);
  const entities = useMemo(() => [...new Set(entries.map((e) => e.entityType))].sort(), [entries]);

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        const day = e.createdAt.slice(0, 10); // UTC yyyy-mm-dd
        return (
          (action === ANY || e.action === action) &&
          (entity === ANY || e.entityType === entity) &&
          (!from || day >= from) &&
          (!to || day <= to)
        );
      }),
    [entries, action, entity, from, to],
  );
  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > visible;

  function change(fn: () => void) {
    fn();
    setVisible(PAGE);
  }

  function loadMore() {
    setLoading(true);
    timer.current = setTimeout(() => {
      setVisible((v) => v + PAGE);
      setLoading(false);
    }, 500);
  }

  const actionItems = [{ value: ANY, label: t("any") }, ...actions.map((a) => ({ value: a, label: a }))];
  const entityItems = [{ value: ANY, label: t("any") }, ...entities.map((a) => ({ value: a, label: a }))];

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <legend className="px-1 text-sm font-medium">{t("filters")}</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="audit-action">{t("action")}</Label>
          <Select items={actionItems} value={action} onValueChange={(v) => change(() => setAction(v ?? ANY))}>
            <SelectTrigger id="audit-action" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {actionItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="audit-entity">{t("entity")}</Label>
          <Select items={entityItems} value={entity} onValueChange={(v) => change(() => setEntity(v ?? ANY))}>
            <SelectTrigger id="audit-entity" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {entityItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="audit-from">{t("from")}</Label>
          <Input id="audit-from" type="date" value={from} max={to || undefined} onChange={(e) => change(() => setFrom(e.target.value))} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="audit-to">{t("to")}</Label>
          <Input id="audit-to" type="date" value={to} min={from || undefined} onChange={(e) => change(() => setTo(e.target.value))} />
        </div>
        <Button
          variant="outline"
          onClick={() =>
            change(() => {
              setAction(ANY);
              setEntity(ANY);
              setFrom("");
              setTo("");
            })
          }
        >
          {t("reset")}
        </Button>
      </fieldset>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col.when")}</TableHead>
              <TableHead>{t("col.actor")}</TableHead>
              <TableHead>{t("col.action")}</TableHead>
              <TableHead>{t("col.entity")}</TableHead>
              <TableHead>{t("col.org")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              shown.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{fmt(e.createdAt, locale)}</TableCell>
                  <TableCell>{e.actor}</TableCell>
                  <TableCell className="font-mono text-xs">{e.action}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">
                      {e.entityType}:{e.entityId}
                    </span>
                  </TableCell>
                  <TableCell>{e.organizationId ? (orgNames[e.organizationId] ?? e.organizationId) : t("platform")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-3" aria-live="polite">
        {hasMore ? (
          <Button variant="secondary" onClick={loadMore} disabled={loading}>
            {loading ? t("loading") : t("loadMore")}
          </Button>
        ) : (
          shown.length > 0 && <p className="text-sm text-muted-foreground">{t("end")}</p>
        )}
      </div>
    </div>
  );
}
