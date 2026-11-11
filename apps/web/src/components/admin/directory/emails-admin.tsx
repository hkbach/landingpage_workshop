"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MailPlus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminEmail } from "@/lib/mock/admin-directory";
import { fmt } from "../utils";
import { DetailDialog, DirectoryTable, FilterBox, Notice, Pill, Toolbar, humanize, selectClass, useDebounced, useDirectory, type Column } from "./kit";

type Message = { text: string; tone: "ok" | "error" } | null;
const TYPES = ["ADMIN_MESSAGE", "BOOKING_CONFIRMATION", "BOOKING_INFO", "BOOKING_CANCELLED", "SHOP_BOOKING_NOTICE", "PAYMENT_RECEIVED", "SESSION_CLOSED", "SESSION_RESCHEDULED", "PASSWORD_RESET"] as const;
interface Detail { id: string; type: string; to: string; subject: string; createdAt: string; status: "SENT" | "FAILED"; attempts: number; error?: string; body?: string; sentBy?: string }

/**
 * The emails of the platform (the outbox): every email the system sent or tried to send, who it went to, when and whether it was delivered; a failed one can be sent again. An administrator can
 * also write an email: to one address or as an announcement to every shop owner or every customer. The emails of the system carry secret links (a booking confirmation, a temporary password), so
 * their text is never shown here; the text of an email an administrator wrote can be read.
 */
export function EmailsAdmin() {
  const t = useTranslations("admin.emails");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const typed = useDebounced(q);
  const { items, error, reload } = useDirectory<AdminEmail>("emails", { q: typed, type, status });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function open(e: AdminEmail) {
    const res = await fetch(`/api/v1/admin/emails/${encodeURIComponent(e.id)}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setDetail((await res.json()) as Detail); else setMessage({ text: t("failed"), tone: "error" });
  }
  async function resend(e: AdminEmail) {
    const res = await fetch(`/api/v1/admin/emails/${encodeURIComponent(e.id)}/resend`, { method: "POST" }).catch(() => null);
    if (!res?.ok) { setMessage({ text: t("failed"), tone: "error" }); return; }
    const j = (await res.json()) as { status: string };
    setMessage({ text: j.status === "SENT" ? t("resent", { email: e.to }) : t("stillFailed", { email: e.to }), tone: j.status === "SENT" ? "ok" : "error" });
    reload();
  }

  const columns: Column<AdminEmail>[] = [
    { key: "date", header: t("col.date"), cell: (e) => <span className="whitespace-nowrap">{fmt(e.createdAt, locale)}</span> },
    { key: "to", header: t("col.to"), cell: (e) => e.to },
    { key: "subject", header: t("col.subject"), cell: (e) => <span className="line-clamp-2 max-w-sm">{e.subject}</span> },
    { key: "type", header: t("col.type"), cell: (e) => t.has(`type.${e.type}`) ? t(`type.${e.type}`) : humanize(e.type) },
    { key: "status", header: t("col.status"), cell: (e) => <span title={e.error}><Pill tone={e.status === "SENT" ? "green" : "red"}>{t(`status.${e.status}`)}</Pill></span> },
    { key: "attempts", header: t("col.attempts"), className: "text-right tabular-nums", cell: (e) => e.attempts },
    {
      key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right",
      cell: (e) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => void open(e)} data-testid="email-open">{t("view")}<span className="sr-only"> {e.to}</span></Button>
          {e.status === "FAILED" ? <Button size="sm" variant="outline" onClick={() => void resend(e)} data-testid="email-resend"><RotateCcw aria-hidden /> {t("resend")}<span className="sr-only"> {e.to}</span></Button> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={() => { setMessage(null); setComposing(true); }} data-testid="email-compose"><MailPlus aria-hidden /> {t("compose")}</Button>
      </header>
      <Notice message={message} />
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ}>
        <FilterBox id="em-type" label={t("col.type")}>
          <select id="em-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t("all")}</option>
            {TYPES.map((k) => <option key={k} value={k}>{t(`type.${k}`)}</option>)}
          </select>
        </FilterBox>
        <FilterBox id="em-status" label={t("col.status")}>
          <select id="em-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("all")}</option>
            <option value="SENT">{t("status.SENT")}</option>
            <option value="FAILED">{t("status.FAILED")}</option>
          </select>
        </FilterBox>
      </Toolbar>
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(e) => e.id} resetKey={`${typed}|${type}|${status}`} testId="emails-table" />
      <p className="text-xs text-muted-foreground">{t("secretNote")}</p>
      <DetailDialog
        open={detail !== null} onClose={() => setDetail(null)} title={detail?.subject ?? ""} description={detail?.to ?? ""}
        rows={detail ? [
          [t("col.type"), t.has(`type.${detail.type}`) ? t(`type.${detail.type}`) : humanize(detail.type)], [t("col.date"), fmt(detail.createdAt, locale)],
          [t("col.status"), t(`status.${detail.status}`)], [t("col.attempts"), detail.attempts], [t("error"), detail.error ?? ""], [t("sentBy"), detail.sentBy ?? ""],
        ] : []}
      >
        {detail ? (detail.body !== undefined ? <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm" data-testid="email-body">{detail.body}</p> : <p className="text-xs text-muted-foreground" data-testid="email-hidden">{t("bodyHidden")}</p>) : null}
      </DetailDialog>
      <Compose open={composing} onClose={() => setComposing(false)} onDone={(text, tone) => { setMessage({ text, tone }); reload(); }} />
    </div>
  );
}

type Audience = "ONE" | "SHOP_OWNERS" | "CUSTOMERS";

function Compose({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (text: string, tone: "ok" | "error") => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">{open ? <ComposeForm onClose={onClose} onDone={onDone} /> : null}</DialogContent>
    </Dialog>
  );
}

function ComposeForm({ onClose, onDone }: { onClose: () => void; onDone: (text: string, tone: "ok" | "error") => void }) {
  const t = useTranslations("admin.emails");
  const [audience, setAudience] = useState<Audience>("ONE");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const clean = { to: to.trim(), subject: subject.trim(), body: body.trim() }; // BR-16
    const found: Record<string, string> = {};
    if (audience === "ONE") { if (!clean.to) found.to = "required"; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean.to)) found.to = "invalid"; }
    if (!clean.subject) found.subject = "required";
    if (!clean.body) found.body = "required";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    const res = await fetch("/api/v1/admin/emails", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audience, ...(audience === "ONE" ? { to: clean.to } : {}), subject: clean.subject, body: clean.body }) }).catch(() => null);
    setBusy(false);
    if (res?.status === 201) {
      const j = (await res.json()) as { total: number; sent: number; failed: number };
      onDone(j.failed > 0 ? t("sentWithFailures", { sent: j.sent, failed: j.failed }) : t("sentAll", { total: j.total }), j.failed > 0 ? "error" : "ok");
      onClose();
      return;
    }
    if (res?.status === 422) {
      const j = (await res.json().catch(() => null)) as { error?: { details?: { fields?: Record<string, string> } } } | null;
      if (j?.error?.details?.fields) { setErrors(j.error.details.fields); return; }
    }
    setErrors({ form: "failed" });
  }

  const err = (k: string) => (errors[k] ? <p role="alert" className="text-xs text-destructive">{t(`errors.${errors[k]}`)}</p> : null);
  return (
    <form onSubmit={send} noValidate className="grid gap-4" data-testid="email-compose-form">
      <DialogHeader>
        <DialogTitle>{t("composeTitle")}</DialogTitle>
        <DialogDescription>{t("composeDesc")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="ec-audience">{t("audience")}</Label>
        <select id="ec-audience" className={selectClass} value={audience} onChange={(e) => { setAudience(e.target.value as Audience); setErrors({}); }}>
          <option value="ONE">{t("audienceOne")}</option>
          <option value="SHOP_OWNERS">{t("audienceOwners")}</option>
          <option value="CUSTOMERS">{t("audienceCustomers")}</option>
        </select>
        {err("audience")}
      </div>
      {audience === "ONE" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="ec-to">{t("to")}</Label>
          <Input id="ec-to" inputMode="email" autoComplete="off" autoCapitalize="none" value={to} aria-invalid={errors.to ? true : undefined} onChange={(e) => { setTo(e.target.value); setErrors({ ...errors, to: "" }); }} data-testid="email-to" />
          <p className="text-xs text-muted-foreground">{t("toHint")}</p>
          {err("to")}
        </div>
      ) : <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">{t("broadcastNote")}</p>}
      <div className="grid gap-1.5">
        <Label htmlFor="ec-subject">{t("subject")}</Label>
        <Input id="ec-subject" maxLength={200} value={subject} aria-invalid={errors.subject ? true : undefined} onChange={(e) => { setSubject(e.target.value); setErrors({ ...errors, subject: "" }); }} data-testid="email-subject" />
        {err("subject")}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ec-body">{t("body")}</Label>
        <Textarea id="ec-body" rows={7} maxLength={10000} value={body} aria-invalid={errors.body ? true : undefined} onChange={(e) => { setBody(e.target.value); setErrors({ ...errors, body: "" }); }} data-testid="email-body-input" />
        <p className="text-xs text-muted-foreground">{t("bodyHint")}</p>
        {err("body")}
      </div>
      {errors.form ? <p role="alert" className="text-sm text-destructive">{t("failed")}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
        <Button type="submit" disabled={busy} data-testid="email-send">{busy ? t("sending") : t("send")}</Button>
      </div>
    </form>
  );
}
