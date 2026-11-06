"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { KeyRound, Pencil, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/dashboard/shell/field";
import { useDirty } from "@/lib/use-dirty";
import type { AdminUser } from "@/lib/mock/admin-directory";
import { ReasonDialog } from "../reason-dialog";
import { fmt } from "../utils";
import { DetailDialog, DirectoryTable, FilterBox, Notice, Pill, Toolbar, humanize, selectClass, useDebounced, useDirectory, type Column } from "./kit";

type Message = { text: string; tone: "ok" | "error" } | null;

/**
 * The accounts of the platform: shop owners and customers with the type of the account. The administrator can open the detail, edit the name and the phone, activate or
 * deactivate, and reset the password (the account is deactivated and the person is emailed a temporary password and a link to choose a new one).
 */
export function UsersAdmin() {
  const t = useTranslations("admin.users");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const typed = useDebounced(q);
  const { items, error, reload } = useDirectory<AdminUser>("users", { q: typed, type, status });
  const [detail, setDetail] = useState<AdminUser | null>(null);
  const [edit, setEdit] = useState<AdminUser | null>(null);
  const [toggle, setToggle] = useState<AdminUser | null>(null);
  const [reset, setReset] = useState<AdminUser | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function post(url: string, body: unknown, ok: string) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setMessage(res?.ok ? { text: ok, tone: "ok" } : { text: t("failed"), tone: "error" });
    reload();
  }

  const statusPill = (u: AdminUser) => (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Pill tone={u.status === "ACTIVE" ? "green" : "red"}>{t(`status.${u.status}`)}</Pill>
      {u.deactivationReason === "PASSWORD_RESET" ? <span className="text-xs text-muted-foreground">{t("awaitingReset")}</span> : null}
    </span>
  );

  const columns: Column<AdminUser>[] = [
    { key: "name", header: t("col.name"), cell: (u) => <><div className="font-medium">{u.fullName}</div><div className="font-mono text-xs text-muted-foreground">{u.id}</div></> },
    { key: "email", header: t("col.email"), cell: (u) => u.email },
    { key: "type", header: t("col.type"), cell: (u) => <Pill tone={u.type === "SHOP_OWNER" ? "sky" : "slate"}>{t(`type.${u.type}`)}</Pill> },
    { key: "shop", header: t("col.shop"), cell: (u) => u.shopName || "—" },
    { key: "status", header: t("col.status"), cell: statusPill },
    {
      key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right",
      cell: (u) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setDetail(u)}>{t("view")}</Button>
          <Button size="sm" variant="outline" onClick={() => setEdit(u)} aria-label={t("editFor", { name: u.fullName })}><Pencil aria-hidden /> {t("edit")}</Button>
          <Button size="sm" variant="outline" onClick={() => setToggle(u)}><Power aria-hidden /> {u.status === "ACTIVE" ? t("deactivate") : t("activate")}</Button>
          <Button size="sm" variant="outline" onClick={() => setReset(u)}><KeyRound aria-hidden /> {t("resetPassword")}</Button>
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
        <FilterBox id="users-type" label={t("col.type")}>
          <select id="users-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t("all")}</option>
            <option value="CUSTOMER">{t("type.CUSTOMER")}</option>
            <option value="SHOP_OWNER">{t("type.SHOP_OWNER")}</option>
          </select>
        </FilterBox>
        <FilterBox id="users-status" label={t("col.status")}>
          <select id="users-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("all")}</option>
            <option value="ACTIVE">{t("status.ACTIVE")}</option>
            <option value="DEACTIVATED">{t("status.DEACTIVATED")}</option>
          </select>
        </FilterBox>
      </Toolbar>
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(u) => u.id} resetKey={`${typed}|${type}|${status}`} testId="users-table" />

      <DetailDialog
        open={detail !== null} onClose={() => setDetail(null)} title={detail?.fullName ?? ""} description={detail ? t(`type.${detail.type}`) : ""}
        rows={detail ? [
          [t("col.email"), detail.email], [t("col.phone"), detail.phone ?? ""], [t("col.id"), detail.id], [t("col.status"), statusPill(detail)],
          ...(detail.type === "SHOP_OWNER"
            ? ([[t("col.shop"), detail.shop ? `${detail.shop.name} (${detail.shop.slug})` : ""]] as Array<[string, React.ReactNode]>)
            : ([[t("country"), detail.country ?? ""], [t("birthDate"), detail.birthDate ?? ""], [t("favorites"), (detail.favoriteCategories ?? []).map(humanize).join(", ")], [t("bookings"), detail.bookings]] as Array<[string, React.ReactNode]>)),
          [t("created"), detail.createdAt ? fmt(detail.createdAt, locale) : ""],
        ] : []}
      />
      {edit ? <EditDialog key={edit.id} user={edit} onClose={() => setEdit(null)} onSaved={(text) => { setEdit(null); setMessage({ text, tone: "ok" }); reload(); }} onFailed={() => setMessage({ text: t("failed"), tone: "error" })} /> : null}
      <ReasonDialog
        open={toggle !== null} onOpenChange={(o) => { if (!o) setToggle(null); }} reason="none" destructive={toggle?.status === "ACTIVE"}
        title={toggle ? t(toggle.status === "ACTIVE" ? "deactivateTitle" : "activateTitle", { name: toggle.fullName }) : ""}
        description={toggle ? t(toggle.status === "ACTIVE" ? "deactivateBody" : "activateBody") : ""}
        confirmLabel={toggle?.status === "ACTIVE" ? t("deactivate") : t("activate")}
        onConfirm={() => { const u = toggle!; setToggle(null); void post(`/api/v1/admin/users/${encodeURIComponent(u.id)}/status`, { status: u.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE" }, t(u.status === "ACTIVE" ? "deactivated" : "activated", { name: u.fullName })); }}
      />
      <ReasonDialog
        open={reset !== null} onOpenChange={(o) => { if (!o) setReset(null); }} reason="none" destructive
        title={reset ? t("resetTitle", { name: reset.fullName }) : ""} description={reset ? t("resetBody", { email: reset.email }) : ""} confirmLabel={t("resetPassword")}
        onConfirm={() => { const u = reset!; setReset(null); void post(`/api/v1/admin/users/${encodeURIComponent(u.id)}/reset-password`, {}, t("resetDone", { email: u.email })); }}
      />
    </div>
  );
}

function EditDialog({ user, onClose, onSaved, onFailed }: { user: AdminUser; onClose: () => void; onSaved: (text: string) => void; onFailed: () => void }) {
  const t = useTranslations("admin.users");
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const clean = { fullName: fullName.trim(), phone: phone.trim() }; // BR-16: the spaces at the ends are not kept
  const dirty = useDirty(clean, user.id); // BR-17: Save only when something changed

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clean.fullName) { setError(true); return; }
    setBusy(true);
    const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullName: clean.fullName, ...(clean.phone ? { phone: clean.phone } : {}) }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) onSaved(t("saved", { name: clean.fullName }));
    else onFailed();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <form onSubmit={save} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{t("editBody", { email: user.email })}</DialogDescription>
          </DialogHeader>
          <Field htmlFor="user-name" label={t("col.name")} error={error ? t("nameRequired") : undefined}>
            <Input id="user-name" value={fullName} maxLength={120} aria-invalid={error} onChange={(e) => { setFullName(e.target.value); setError(false); }} />
          </Field>
          <Field htmlFor="user-email" label={t("col.email")} hint={t("emailFixed")}>
            <Input id="user-email" value={user.email} readOnly />
          </Field>
          <Field htmlFor="user-phone" label={t("col.phone")}>
            <Input id="user-phone" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" disabled={busy || !dirty}>{t("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
