"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { AUDIT_ROLES, type AuditRole } from "@/lib/types";
import type { AdminAuditRow } from "@/lib/mock/admin-directory";
import { fmt } from "../utils";
import { DetailDialog, DirectoryTable, FilterBox, Pill, humanize, selectClass, useDebounced, useDirectory, type Column } from "./kit";

const TONE: Record<AuditRole, "sky" | "slate" | "green" | "amber" | "red"> = { CUSTOMER: "slate", SHOP_OWNER: "sky", GUEST: "amber", SYSTEM_ADMIN: "green", SYSTEM: "red" };

/**
 * The audit log: the trace of what the users do (customers, shop owners, guests, system admins), to find what happened when a user asks for support. Search by the email of the user
 * (who did it, or who it was done to) and by the organization (name, slug or id); narrow by action, record, role and day; open a line for all of it.
 */
export function AuditLogsAdmin() {
  const t = useTranslations("admin.audit");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [role, setRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const typedEmail = useDebounced(email);
  const typedOrg = useDebounced(org);
  const bad = Boolean(from && to && from > to);
  const { items, error } = useDirectory<AdminAuditRow>("audit-logs", { email: typedEmail, org: typedOrg, action, entity, role, from, to: bad ? "" : to });
  const all = useDirectory<AdminAuditRow>("audit-logs", {}); // the actions and the records to choose from
  const actions = useMemo(() => [...new Set((all.items ?? []).map((e) => e.action))].sort(), [all.items]);
  const entities = useMemo(() => [...new Set((all.items ?? []).map((e) => e.entityType))].sort(), [all.items]);
  const [detail, setDetail] = useState<AdminAuditRow | null>(null);
  const filtered = Boolean(email || org || action || entity || role || from || to);

  const columns: Column<AdminAuditRow>[] = [
    { key: "when", header: t("col.when"), cell: (e) => <span className="whitespace-nowrap">{fmt(e.createdAt, locale)}</span> },
    {
      key: "user", header: t("col.user"),
      cell: (e) => (
        <div className="grid gap-0.5">
          <span className="font-medium">{e.actor}</span>
          {e.actorEmail ? <span className="text-xs text-muted-foreground">{e.actorEmail}</span> : null}
          {e.actorRole ? <span><Pill tone={TONE[e.actorRole]}>{t(`role.${e.actorRole}`)}</Pill></span> : null}
        </div>
      ),
    },
    { key: "action", header: t("col.action"), cell: (e) => <span className="font-mono text-xs">{e.action}</span> },
    { key: "entity", header: t("col.entity"), cell: (e) => <><div>{humanize(e.entityType)}</div><div className="font-mono text-xs text-muted-foreground">{e.entityId}</div></> },
    { key: "org", header: t("col.org"), cell: (e) => e.organizationName || <span className="text-muted-foreground">{t("platform")}</span> },
    { key: "details", header: t("col.details"), className: "max-w-56 whitespace-normal", cell: (e) => (e.details ? <span className="text-xs">{e.details}</span> : e.targetEmail ? <span className="text-xs">{t("target", { email: e.targetEmail })}</span> : "—") },
    { key: "view", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right", cell: (e) => <Button size="sm" variant="outline" onClick={() => setDetail(e)}>{t("view")}<span className="sr-only"> {e.action}</span></Button> },
  ];

  const box = (id: string, label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <div className="grid min-w-56 flex-1 gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input id={id} type="search" className="pl-8" value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} />
      </div>
    </div>
  );

  return (
    <div className="grid gap-4" data-testid="audit-logs">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        {box("audit-email", t("searchEmail"), email, setEmail, t("searchEmailPlaceholder"))}
        {box("audit-org", t("searchOrg"), org, setOrg, t("searchOrgPlaceholder"))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <FilterBox id="audit-role" label={t("role.label")}>
          <select id="audit-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">{t("any")}</option>
            {AUDIT_ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
          </select>
        </FilterBox>
        <FilterBox id="audit-action" label={t("action")}>
          <select id="audit-action" className={selectClass} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t("any")}</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </FilterBox>
        <FilterBox id="audit-entity" label={t("entity")}>
          <select id="audit-entity" className={selectClass} value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">{t("any")}</option>
            {entities.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </FilterBox>
        <FilterBox id="audit-from" label={t("from")}><DateInput id="audit-from" value={from} onChange={setFrom} max={to || undefined} lenient /></FilterBox>
        <FilterBox id="audit-to" label={t("to")}><DateInput id="audit-to" value={to} onChange={setTo} min={from || undefined} lenient /></FilterBox>
        {filtered ? <Button type="button" variant="outline" onClick={() => { setEmail(""); setOrg(""); setAction(""); setEntity(""); setRole(""); setFrom(""); setTo(""); }}>{t("reset")}</Button> : null}
      </div>
      {bad ? <p role="alert" className="text-sm text-destructive">{t("dateOrder")}</p> : null}
      <p role="status" className="text-sm text-muted-foreground" data-testid="audit-count">{items === null ? "" : t("count", { count: items.length })}</p>
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(e) => e.id} resetKey={`${typedEmail}|${typedOrg}|${action}|${entity}|${role}|${from}|${to}`} testId="audit-table" />
      <p className="text-xs text-muted-foreground">{t("utcNote")}</p>
      <DetailDialog
        open={detail !== null} onClose={() => setDetail(null)} title={detail?.action ?? ""} description={detail ? fmt(detail.createdAt, locale) : ""}
        rows={detail ? [
          [t("col.user"), detail.actor], [t("email"), detail.actorEmail ?? ""], [t("role.label"), detail.actorRole ? t(`role.${detail.actorRole}`) : ""], [t("userId"), detail.actorId ?? ""],
          [t("col.entity"), `${humanize(detail.entityType)} ${detail.entityId}`], [t("targetUser"), detail.targetEmail ?? ""],
          [t("col.org"), detail.organizationName ? `${detail.organizationName} (${detail.organizationSlug})` : t("platform")], [t("col.details"), detail.details ?? ""], [t("logId"), detail.id],
        ] : []}
      />
    </div>
  );
}
