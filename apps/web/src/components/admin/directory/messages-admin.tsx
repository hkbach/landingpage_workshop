"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdminMessage } from "@/lib/mock/admin-directory";
import { CONTACT_TOPICS, MESSAGE_STATUSES, type MessageStatus } from "@/lib/mock/contact-types";
import { ReasonDialog } from "../reason-dialog";
import { fmt } from "../utils";
import { DirectoryTable, FilterBox, Notice, Pill, Toolbar, selectClass, useDebounced, useDirectory, type Column } from "./kit";

type Message = { text: string; tone: "ok" | "error" } | null;
const TONE: Record<MessageStatus, "sky" | "amber" | "green"> = { NEW: "sky", IN_PROGRESS: "amber", DONE: "green" };

/**
 * The support inbox: the messages people send with the Contact form of the public site. Search by the name, the email or the text; filter by status and topic. An administrator reads a message,
 * sets its status (New / In progress / Done), keeps an internal note, answers by email (the message is then Done) or deletes it. The text of a message is personal data: it never goes to the audit log.
 */
export function MessagesAdmin() {
  const t = useTranslations("admin.messages");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [topic, setTopic] = useState("");
  const typed = useDebounced(q);
  const { items, error, reload } = useDirectory<AdminMessage>("messages", { q: typed, status, topic });
  const [open, setOpen] = useState<AdminMessage | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const columns: Column<AdminMessage>[] = [
    { key: "date", header: t("col.date"), cell: (m) => <span className="whitespace-nowrap">{fmt(m.createdAt, locale)}</span> },
    { key: "from", header: t("col.from"), cell: (m) => <><div className="font-medium">{m.name}</div><div className="text-xs text-muted-foreground">{m.email}</div></> },
    { key: "topic", header: t("col.topic"), cell: (m) => t(`topic.${m.topic}`) },
    { key: "text", header: t("col.message"), cell: (m) => <span className="line-clamp-2 max-w-md text-sm text-muted-foreground">{m.message}</span> },
    { key: "status", header: t("col.status"), cell: (m) => <Pill tone={TONE[m.status]}>{t(`status.${m.status}`)}</Pill> },
    { key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right", cell: (m) => <Button size="sm" variant="outline" onClick={() => setOpen(m)} data-testid="message-open">{t("open")}<span className="sr-only"> {m.name}</span></Button> },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Notice message={message} />
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ}>
        <FilterBox id="msg-status" label={t("col.status")}>
          <select id="msg-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("all")}</option>
            {MESSAGE_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </FilterBox>
        <FilterBox id="msg-topic" label={t("col.topic")}>
          <select id="msg-topic" className={selectClass} value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">{t("all")}</option>
            {CONTACT_TOPICS.map((c) => <option key={c} value={c}>{t(`topic.${c}`)}</option>)}
          </select>
        </FilterBox>
      </Toolbar>
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(m) => m.id} resetKey={`${typed}|${status}|${topic}`} testId="messages-table" />
      <Detail message={open} onClose={() => setOpen(null)} onChanged={(text) => { setMessage({ text, tone: "ok" }); reload(); }} onFailed={() => setMessage({ text: t("failed"), tone: "error" })} />
    </div>
  );
}

function Detail({ message, onClose, onChanged, onFailed }: { message: AdminMessage | null; onClose: () => void; onChanged: (text: string) => void; onFailed: () => void }) {
  return (
    <Dialog open={message !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">{message ? <Body key={message.id} m={message} onClose={onClose} onChanged={onChanged} onFailed={onFailed} /> : null}</DialogContent>
    </Dialog>
  );
}

function Body({ m, onClose, onChanged, onFailed }: { m: AdminMessage; onClose: () => void; onChanged: (text: string) => void; onFailed: () => void }) {
  const t = useTranslations("admin.messages");
  const locale = useLocale();
  const [status, setStatus] = useState<MessageStatus>(m.status);
  const [note, setNote] = useState(m.note);
  const [savedNote, setSavedNote] = useState(m.note);
  const [subject, setSubject] = useState(`Re: ${t(`topic.${m.topic}`)}`);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function patch(body: { status?: MessageStatus; note?: string }, done: string) {
    setBusy(true);
    const res = await fetch(`/api/v1/admin/messages/${encodeURIComponent(m.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { onFailed(); return false; }
    onChanged(done);
    return true;
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    const text = reply.trim(), sub = subject.trim();
    if (!sub || !text) { setReplyError(t("replyRequired")); return; }
    setBusy(true);
    const res = await fetch("/api/v1/admin/emails", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audience: "ONE", to: m.email, subject: sub, body: text, messageId: m.id }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setReplyError(t("replyFailed")); return; }
    const j = (await res.json()) as { failed?: number }; // (the API only says how many were queued)
    onChanged((j.failed ?? 0) > 0 ? t("replyNotDelivered", { email: m.email }) : t("replySent", { email: m.email }));
    onClose();
  }

  return (
    <div className="grid gap-4" data-testid="message-detail">
      <DialogHeader>
        <DialogTitle>{m.name}</DialogTitle>
        <DialogDescription>{m.email} · {t(`topic.${m.topic}`)} · {fmt(m.createdAt, locale)}</DialogDescription>
      </DialogHeader>
      <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm" data-testid="message-text">{m.message}</p>

      <div className="grid gap-1.5">
        <Label htmlFor="msg-set-status">{t("col.status")}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <select id="msg-set-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as MessageStatus)}>
            {MESSAGE_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
          <Button type="button" size="sm" variant="outline" disabled={busy || status === m.status} onClick={() => void patch({ status }, t("statusSaved"))} data-testid="message-save-status">{t("saveStatus")}</Button>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="msg-note">{t("note")}</Label>
        <Textarea id="msg-note" rows={3} maxLength={2000} value={note} placeholder={t("notePlaceholder")} onChange={(e) => setNote(e.target.value)} data-testid="message-note" />
        <p className="text-xs text-muted-foreground">{t("noteHint")}</p>
        <div><Button type="button" size="sm" variant="outline" disabled={busy || note.trim() === savedNote} onClick={() => void patch({ note: note.trim() }, t("noteSaved")).then((ok) => { if (ok) setSavedNote(note.trim()); })} data-testid="message-save-note">{t("saveNote")}</Button></div>
      </div>

      <form onSubmit={sendReply} noValidate className="grid gap-2 rounded-lg border p-3" data-testid="message-reply">
        <p className="text-sm font-medium">{t("replyTitle", { email: m.email })}</p>
        <Input aria-label={t("subject")} value={subject} maxLength={200} onChange={(e) => { setSubject(e.target.value); setReplyError(""); }} />
        <Textarea aria-label={t("replyBody")} rows={4} maxLength={10000} value={reply} placeholder={t("replyPlaceholder")} onChange={(e) => { setReply(e.target.value); setReplyError(""); }} data-testid="message-reply-body" />
        {replyError ? <p role="alert" className="text-xs text-destructive">{replyError}</p> : null}
        <div><Button type="submit" size="sm" disabled={busy} data-testid="message-reply-send"><Send aria-hidden /> {t("sendReply")}</Button></div>
      </form>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} data-testid="message-delete"><Trash2 aria-hidden /> {t("delete")}</Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>{t("close")}</Button>
      </div>
      <ReasonDialog
        open={confirmDelete} onOpenChange={setConfirmDelete} reason="none" destructive title={t("deleteTitle")} description={t("deleteBody")} confirmLabel={t("delete")}
        onConfirm={() => { setConfirmDelete(false); void fetch(`/api/v1/admin/messages/${encodeURIComponent(m.id)}`, { method: "DELETE" }).then((res) => { if (res.ok) { onChanged(t("deleted")); onClose(); } else onFailed(); }).catch(onFailed); }}
      />
    </div>
  );
}
