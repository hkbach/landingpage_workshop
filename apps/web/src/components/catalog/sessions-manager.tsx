"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useDisplayLocale } from "@/lib/use-shop-language";
import { ArrowLeft, BadgeCheck, CalendarClock, CheckCheck, Copy, Eye, Lock, LockOpen, LogIn, Pause, Pencil, Play, Plus, Save } from "lucide-react";
import { allowedSessionActions, closedForGood, isSessionFinished, isFinalClose, canEditSession, canRescheduleSession, canReopenSession, canCloseAgain, canRescheduleAgain, notesInOrder, closeWaitsForEnd, isFutureStart, type SessionCloseReason, DEFAULT_BOOKING_CUTOFF_MINUTES, isValidBookingCutoff, MAX_BOOKING_CUTOFF_MINUTES, pickLocalized, SESSION_STATUSES, type Locale, type SessionStatus } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { CapacityBar } from "@/components/ops/capacity-bar";
import { Field } from "@/components/ops/field";
import { NativeSelect } from "@/components/ops/native-select";
import { SessionStatusBadge } from "@/components/ops/status-badges";
import { addDays, formatDayKey, zonedToUtcIso } from "@/components/ops/time";
import { useOpsState } from "@/components/ops/use-ops-state";
import type { Booking, Customer, Session, Workshop } from "@/lib/types";
import { dayKey, formatTime } from "@/lib/format";
import { MAX_CAPACITY, type ShopForCatalog } from "./workshop-form";
import { CheckInDialog, CloseSessionDialog, dateAndTime, PaymentDialog, RescheduleSessionDialog } from "./session-dialogs";
import { notifyPaidRequest } from "@/lib/bookings-api";
import { notifyAutoClosedRequest, notifyClosedRequest, notifyRescheduleRequest } from "@/lib/sessions-api";
import { ImageUploadField } from "@/components/builder/ImageUploadField";
import { sessionImageUploader } from "@/lib/media/session-uploader";
import { safeImage } from "@/components/sections/safe-url";
import { useDirty } from "@/lib/use-dirty";

/** The current time, read when the form is submitted (not while rendering). */
const clock = () => new Date();

/** FR-SCHED-02/03: sessions agenda by date range + workshop; add one-off, close/open, edit capacity, cancel. */
export function SessionsManager({
  sessions, bookings, customers, workshops, shop, nowIso, actor,
}: { sessions: Session[]; bookings: Booking[]; customers: Customer[]; workshops: Workshop[]; shop: ShopForCatalog; nowIso: string; actor: string }) {
  const t = useTranslations("catalog");
  const tops = useTranslations("ops");
  const locale = useLocale() as Locale;
  const ops = useOpsState({ bookings, sessions, nowIso, actor });
  const today = dayKey(nowIso, shop.timezone);
  const [workshopId, setWorkshopId] = useState("");
  const [status, setStatus] = useState<"" | SessionStatus>("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 60));
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [dialog, setDialog] = useState<{ kind: "add" } | { kind: "edit" | "close" | "reschedule" | "clone" | "checkin" | "payment" | "complete" | "completed"; id: string } | null>(null);

  const displayLocale = useDisplayLocale(shop);
  /** The date and time of a note ("Nov 12, 2026, 2:06 PM"), in the time zone of the shop. */
  const stampText = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: shop.timezone }).format(new Date(iso));
  const title = (id: string) => pickLocalized(workshops.find((w) => w.id === id)?.title, displayLocale, shop.defaultLocale);
  const filtered = useMemo(
    () =>
      ops.sessions
        .filter((s) => !workshopId || s.workshopId === workshopId)
        .filter((s) => !status || s.status === status)
        .filter((s) => {
          const k = dayKey(s.startsAt, shop.timezone);
          return (!from || k >= from) && (!to || k <= to);
        })
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [ops.sessions, workshopId, status, from, to, shop.timezone],
  );
  const groups = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of filtered) {
      const k = dayKey(s.startsAt, shop.timezone);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [filtered, shop.timezone]);

  async function notifyGuests(id: string, res: { oldStartsAt: string; startsAt: string; endsAt: string; reason: SessionCloseReason }) {
    try {
      // The guests who booked the session are emailed (the real backend queues the emails in the same transaction as the change).
      const sent = await notifyRescheduleRequest(id, { oldStartsAt: res.oldStartsAt, newStartsAt: res.startsAt, newEndsAt: res.endsAt, reason: res.reason });
      setNotice({ text: t("sessions.rescheduled", { count: sent.notified }), tone: "ok" });
    } catch {
      setNotice({ text: t("sessions.rescheduleMailFailed"), tone: "error" });
    }
  }

  async function notifyClosed(s: Session, reason: SessionCloseReason) {
    try {
      const sent = await notifyClosedRequest(s.id, { startsAt: s.startsAt, endsAt: s.endsAt, reason });
      setNotice({ text: t("sessions.closedNotified", { count: sent.notified }), tone: "ok" });
    } catch {
      setNotice({ text: t("sessions.closeMailFailed"), tone: "error" });
    }
  }

  // The sessions the system closed because their time ended: the server emails their guests, once for each session.
  const autoClosedKey = ops.sessions.filter((s) => s.autoClosed).map((s) => `${s.id}|${s.startsAt}|${s.endsAt}`).join(",");
  useEffect(() => {
    if (!autoClosedKey) return;
    const list = autoClosedKey.split(",").map((k) => { const [id, startsAt, endsAt] = k.split("|"); return { id: id!, startsAt: startsAt!, endsAt: endsAt! }; });
    notifyAutoClosedRequest(list).then((r) => {
      const guests = r.mailed.reduce((n, m) => n + m.notified, 0);
      if (guests > 0) setNotice({ text: t("sessions.autoClosedNotified", { count: guests }), tone: "ok" });
    }).catch(() => undefined); // the next check tries again
  }, [autoClosedKey, t]);

  const target = dialog && dialog.kind !== "add" ? ops.sessions.find((s) => s.id === dialog.id) : undefined;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("sessions.title")}</h1>
        <Button onClick={() => setDialog({ kind: "add" })}><Plus aria-hidden="true" />{t("sessions.add")}</Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("sessions.tzNote", { tz: shop.timezone })}</p>
      {notice ? <p role="status" data-testid="session-notice" className={notice.tone === "error" ? "text-sm font-medium text-destructive" : "text-sm font-medium text-emerald-800"}>{notice.text}</p> : null}
      <p data-testid="status-note" className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{t("sessions.statusNote")}</p>

      <Card>
        <CardContent>
          <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
            <Field id="s-ws" label={t("sessions.workshop")}>
              {(p) => (
                <NativeSelect {...p} value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}
                  options={[{ value: "", label: t("sessions.allWorkshops") }, ...workshops.map((w) => ({ value: w.id, label: title(w.id) }))]} />
              )}
            </Field>
            <Field id="s-status" label={t("sessions.statusFilter")}>
              {(p) => (
                <NativeSelect {...p} value={status} onChange={(e) => setStatus(e.target.value as "" | SessionStatus)}
                  options={[{ value: "", label: t("sessions.allStatuses") }, ...SESSION_STATUSES.map((v) => ({ value: v, label: tops(`sessionStatus.${v}`) }))]} />
              )}
            </Field>
            <Field id="s-from" label={t("sessions.from")}>{(p) => <DateInput {...p} value={from} onChange={setFrom} />}</Field>
            <Field id="s-to" label={t("sessions.to")}>{(p) => <DateInput {...p} value={to} onChange={setTo} />}</Field>
          </form>
        </CardContent>
      </Card>

      <p role="status" className="text-sm text-muted-foreground">{t("sessions.count", { count: filtered.length })}</p>
      {groups.length === 0 ? <Card><CardContent className="py-8 text-center text-muted-foreground">{t("sessions.empty")}</CardContent></Card> : null}

      {groups.map(([day, list]) => (
        <section key={day} aria-labelledby={`day-${day}`} className="grid gap-2">
          <h2 id={`day-${day}`} className="text-sm font-semibold">{formatDayKey(day, locale)}{day === today ? ` (${t("sessions.today")})` : ""}</h2>
          <ul className="grid gap-2 md:grid-cols-2">
            {list.map((s) => {
              const actions = allowedSessionActions(s);
              return (
                <li key={s.id}>
                  <Card size="sm" className={isSessionFinished(s.status) ? "opacity-80" : ""}>
                    <CardContent className="grid gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-3">
                          {safeImage(s.imageUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={safeImage(s.imageUrl)} alt="" data-testid="session-image" className="size-14 shrink-0 rounded-md object-cover" />
                          ) : null}
                          <div className="min-w-0">
                            <p className="font-medium">{title(s.workshopId)}</p>
                            <p className="font-mono text-xs text-muted-foreground" data-testid="session-code" aria-label={`${t("sessions.codeLabel")}: ${s.code}`}>{s.code}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatTime(s.startsAt, shop.timezone, locale)} - {formatTime(s.endsAt, shop.timezone, locale)}
                            </p>
                          </div>
                        </div>
                        <SessionStatusBadge status={s.status} />
                      </div>
                      <CapacityBar reserved={s.reservedCount} capacity={s.capacity} />
                      <p className="text-xs text-muted-foreground" data-testid="session-cutoff">{t("sessions.cutoffInfo", { minutes: s.bookingCutoffMinutes })}</p>
                      {s.clonedFrom ? (
                        <p className="text-xs text-muted-foreground" data-testid="cloned-note">{t("sessions.clonedFrom", { code: s.clonedFrom.code, workshop: title(s.clonedFrom.workshopId) })}</p>
                      ) : null}
                      {notesInOrder(s.notes).map((n, i) => (
                        <p key={`${n.type}-${n.at}-${i}`} className="text-xs text-muted-foreground" data-testid="session-note" data-note={n.type}>
                          {stampText(n.at)} - {n.type === "REOPENED"
                            ? t("sessions.reopenedNote")
                            : n.type === "AUTO_CLOSED"
                              ? t("sessions.autoClosedNote")
                              : `${t(n.type === "CLOSED" ? "sessions.closedBecause" : "sessions.rescheduledBecause")}: ${n.reason?.code === "OTHER" ? n.reason.note : n.reason ? t(`sessions.closeReasons.${n.reason.code}`) : ""}`}
                          {n.by === "ADMIN" ? ` (${t("sessions.byAdmin")})` : ""}
                        </p>
                      ))}
                      {closedForGood(s) ? (
                        <p className="text-xs font-medium text-destructive" data-testid="closed-for-good">{t("sessions.closedForGood")}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-1.5">
                          {actions.includes("start") ? (
                            <Button size="sm" variant="outline" onClick={() => ops.sessionAction(s.id, "start")}><Play aria-hidden="true" />{t("sessions.start")}</Button>
                          ) : null}
                          {actions.includes("pause") ? (
                            <Button size="sm" variant="outline" onClick={() => ops.sessionAction(s.id, "pause")}><Pause aria-hidden="true" />{t("sessions.pause")}</Button>
                          ) : null}
                          {canRescheduleSession(s.status) ? (
                            !canRescheduleAgain(s.notes) ? (
                              // A session is re-scheduled at most 3 times: read-only, the span carries the tooltip (a disabled button does not).
                              <span title={t("sessions.rescheduleLimit")} data-testid="reschedule-once" className="inline-flex cursor-not-allowed">
                                <Button size="sm" variant="outline" disabled aria-disabled="true" aria-label={`${t("sessions.reschedule")}: ${t("sessions.rescheduleLimit")}`}>
                                  <CalendarClock aria-hidden="true" />{t("sessions.reschedule")}
                                </Button>
                              </span>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "reschedule", id: s.id })}><CalendarClock aria-hidden="true" />{t("sessions.reschedule")}</Button>
                            )
                          ) : null}
                          {actions.includes("close") ? (
                            !canCloseAgain(s.notes) || closeWaitsForEnd(s, ops.now) ? (
                              // Read-only while the session is taking place, or once it was closed 4 times: the span carries the tooltip (a disabled button does not).
                              <span title={canCloseAgain(s.notes) ? t("sessions.closeWait") : t("sessions.closeLimit")} data-testid={canCloseAgain(s.notes) ? "close-wait" : "close-limit"} className="inline-flex cursor-not-allowed">
                                <Button size="sm" variant="destructive" disabled aria-disabled="true" aria-label={`${t("sessions.close")}: ${canCloseAgain(s.notes) ? t("sessions.closeWait") : t("sessions.closeLimit")}`}>
                                  <Lock aria-hidden="true" />{t("sessions.close")}
                                </Button>
                              </span>
                            ) : (
                              <Button size="sm" variant="destructive" onClick={() => setDialog({ kind: "close", id: s.id })}><Lock aria-hidden="true" />{t("sessions.close")}</Button>
                            )
                          ) : null}
                          {canReopenSession(s, ops.now) ? (
                            <Button size="sm" variant="outline" data-testid="reopen-button" onClick={() => ops.reopenSession(s.id)}>
                              <LockOpen aria-hidden="true" />{t("sessions.reopen")}
                            </Button>
                          ) : null}
                          {canEditSession(s.status) ? (
                            <Button size="sm" variant="outline" data-testid="edit-button" onClick={() => setDialog({ kind: "edit", id: s.id })}>
                              <Pencil aria-hidden="true" />{t("sessions.edit")}
                            </Button>
                          ) : null}
                          {s.status === "CLOSED" || s.status === "COMPLETED" ? (
                            // Nobody can be checked in after the session is closed, so the list is only viewed. A closed session has its payments confirmed
                            // (Confirm payment) and is then marked Completed (the Completed button shows the same list with a submit that locks the session).
                            // A Completed session no longer changes: only the Completed button, which shows its payments.
                            <>
                              {s.status === "CLOSED" ? (
                                <Button size="sm" variant="outline" data-testid="view-bookings-button" onClick={() => setDialog({ kind: "checkin", id: s.id })}>
                                  <Eye aria-hidden="true" />{t("sessions.viewBooking")}
                                </Button>
                              ) : null}
                              {s.status === "CLOSED" ? (
                                <Button size="sm" data-testid="payment-button" onClick={() => setDialog({ kind: "payment", id: s.id })}>
                                  <BadgeCheck aria-hidden="true" />{t("sessions.confirmPayment")}
                                </Button>
                              ) : null}
                              <Button
                                size="sm" data-testid="complete-button" className="bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600/40"
                                onClick={() => setDialog({ kind: s.status === "CLOSED" ? "complete" : "completed", id: s.id })}
                              >
                                <CheckCheck aria-hidden="true" />{t("sessions.complete")}
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" data-testid="checkin-button" onClick={() => setDialog({ kind: "checkin", id: s.id })}>
                              <LogIn aria-hidden="true" />{t("sessions.checkIn")}
                            </Button>
                          )}
                          {s.status === "COMPLETED" ? null : (
                            <Button size="sm" variant="outline" data-testid="clone-button" onClick={() => setDialog({ kind: "clone", id: s.id })}>
                              <Copy aria-hidden="true" />{t("sessions.clone")}
                            </Button>
                          )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <AddSessionDialog
        key={dialog && dialog.kind !== "add" ? `form-${dialog.kind}-${dialog.id}` : "form-add"}
        open={dialog?.kind === "add" || ((dialog?.kind === "clone" || dialog?.kind === "edit") && !!target)} onOpenChange={(o) => !o && setDialog(null)}
        workshops={workshops} shop={shop} title={title}
        source={dialog?.kind === "clone" ? target : undefined} editing={dialog?.kind === "edit" ? target : undefined}
        hasBookings={target ? target.reservedCount > 0 || ops.bookings.some((b) => b.sessionId === target.id && b.status !== "CANCELLED") : false}
        today={today} onAdd={(s) => { if (ops.addSession(s)) setDialog(null); }}
        onUpdate={(id, patch) => { if (ops.updateSession(id, patch)) setDialog(null); }}
      />
      <CheckInDialog
        key={`guests-${target?.id ?? "none"}`} open={dialog?.kind === "checkin" && !!target} onOpenChange={(o) => !o && setDialog(null)}
        session={target} bookings={ops.bookings} customers={customers} now={ops.now} timezone={shop.timezone} perform={ops.perform}
      />
      <PaymentDialog
        key={`pay-${dialog?.kind ?? "none"}-${target?.id ?? "none"}`} open={(dialog?.kind === "payment" || dialog?.kind === "complete" || dialog?.kind === "completed") && !!target} onOpenChange={(o) => !o && setDialog(null)}
        mode={dialog?.kind === "complete" ? "complete" : dialog?.kind === "completed" ? "view" : "payment"}
        onComplete={() => { if (target && ops.completeSession(target.id)) setDialog(null); }}
        session={target} bookings={ops.bookings} customers={customers} setPaid={ops.setPaid}
        notifyPaid={async (id) => (await notifyPaidRequest(id)).notified}
      />
      <CloseSessionDialog
        key={`close-${target?.id ?? "none"}`} open={dialog?.kind === "close" && !!target} onOpenChange={(o) => !o && setDialog(null)}
        final={isFinalClose(target?.notes)}
        onConfirm={(reason) => { if (target && ops.sessionAction(target.id, "close", reason)) { setDialog(null); void notifyClosed(target, reason); } }}
      />
      <RescheduleSessionDialog
        key={`resched-${target?.id ?? "none"}`} open={dialog?.kind === "reschedule" && !!target} onOpenChange={(o) => !o && setDialog(null)}
        session={target} timezone={shop.timezone} bookings={target ? ops.bookings.filter((b) => b.sessionId === target.id && b.status === "CONFIRMED").length : 0}
        onConfirm={(newStartsAt, reason) => { if (!target) return null; const res = ops.rescheduleSession(target.id, newStartsAt, reason); if (!res.ok) return res.error; setDialog(null); void notifyGuests(target.id, res); return null; }}
      />
    </div>
  );
}

/**
 * Add a session, clone one (`source`: the same workshop, capacity, cut-off and image, with a new date and time) or edit one (`editing`: everything
 * except the date and time, which only Re-schedule changes).
 */
function AddSessionDialog({
  open, onOpenChange, workshops, shop, title, onAdd, source, editing, hasBookings, onUpdate, today,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; workshops: Workshop[]; shop: ShopForCatalog;
  title: (id: string) => string; onAdd: (s: Omit<Session, "id" | "code" | "reservedCount" | "status">) => void; source?: Session;
  editing?: Session; hasBookings: boolean; today: string;
  onUpdate: (id: string, patch: { workshopId: string; capacity: number; bookingCutoffMinutes: number; imageUrl?: string; endsAt: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? <AddSessionForm workshops={workshops} shop={shop} title={title} source={source} editing={editing} hasBookings={hasBookings} today={today} onAdd={onAdd} onUpdate={onUpdate} onCancel={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddSessionForm({
  workshops, shop, title, onAdd, onCancel, source, editing, hasBookings, onUpdate, today,
}: {
  workshops: Workshop[]; shop: ShopForCatalog; title: (id: string) => string;
  onAdd: (s: Omit<Session, "id" | "code" | "reservedCount" | "status">) => void; onCancel: () => void; source?: Session;
  editing?: Session; hasBookings: boolean; today: string;
  onUpdate: (id: string, patch: { workshopId: string; capacity: number; bookingCutoffMinutes: number; imageUrl?: string; endsAt: string }) => void;
}) {
  const t = useTranslations("catalog");
  const tops = useTranslations("ops");
  const choices = workshops;
  const start = editing ? dateAndTime(editing.startsAt, shop.timezone) : { date: "", time: "" };
  const base = editing ?? source;
  const [wsId, setWsId] = useState(base?.workshopId ?? choices[0]?.id ?? "");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [cap, setCap] = useState(String(base?.capacity ?? choices[0]?.defaultCapacity ?? 8));
  const [cutoff, setCutoff] = useState(String(base?.bookingCutoffMinutes ?? DEFAULT_BOOKING_CUTOFF_MINUTES));
  const [image, setImage] = useState(base?.imageUrl ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = useDirty({ wsId, date, time, cap, cutoff, image }, editing ? `edit-${editing.id}` : source ? `clone-${source.id}` : "add");

  function submit(e: FormEvent) {
    e.preventDefault();
    const w = workshops.find((x) => x.id === wsId);
    const errs: Record<string, string> = {};
    if (!w) errs.ws = "errors.required";
    if (!editing && !date) errs.date = "errors.required";
    if (!editing && !time) errs.time = "errors.required";
    const n = Number(cap);
    if (!Number.isInteger(n) || n < 1 || n > MAX_CAPACITY) errs.cap = "errors.capacityRange";
    else if (editing && n < editing.reservedCount) errs.cap = "errors.capacityBelowReserved";
    const cutoffMinutes = cutoff.trim() === "" ? Number.NaN : Number(cutoff);
    if (!isValidBookingCutoff(cutoffMinutes)) errs.cutoff = "errors.cutoffInvalid";
    let startsAt = "";
    // Several sessions may start at the same time, even of the same workshop: nothing is checked against the other sessions.
    if (editing && w) {
      startsAt = editing.startsAt; // the date and time stay as they are
    } else if (w && date && time) {
      startsAt = zonedToUtcIso(date, time, shop.timezone);
      if (!isFutureStart(startsAt, clock())) errs.date = "errors.pastStart"; // no session in the past
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !w) return;
    if (editing) {
      onUpdate(editing.id, { workshopId: w.id, capacity: n, bookingCutoffMinutes: cutoffMinutes, endsAt: new Date(new Date(startsAt).getTime() + w.durationMinutes * 60_000).toISOString(), ...(image ? { imageUrl: image } : {}) });
      return;
    }
    onAdd({ workshopId: w.id, startsAt, endsAt: new Date(new Date(startsAt).getTime() + w.durationMinutes * 60_000).toISOString(), capacity: n, bookingCutoffMinutes: cutoffMinutes,
      ...(image ? { imageUrl: image } : {}),
      ...(source ? { clonedFrom: { code: source.code, workshopId: source.workshopId } } : {}),
    });
  }
  const err = (k: string) => (errors[k] ? t(errors[k], { reserved: editing?.reservedCount ?? 0 }) : undefined);

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{editing ? t("sessions.editTitle") : source ? t("sessions.cloneTitle") : t("sessions.addTitle")}</DialogTitle>
        <DialogDescription>
          {editing ? t("sessions.editHint", { code: editing.code }) : source ? t("sessions.cloneHint", { code: source.code, tz: shop.timezone }) : t("sessions.addHint", { tz: shop.timezone })}
        </DialogDescription>
      </DialogHeader>
      <Field id="add-ws" label={t("sessions.workshop")} required error={err("ws")}>
        {(p) => (
          <NativeSelect {...p} value={wsId} disabled={!!source || (!!editing && hasBookings)}
            onChange={(e) => { setWsId(e.target.value); const w = workshops.find((x) => x.id === e.target.value); if (w) setCap(String(w.defaultCapacity)); }}
            options={choices.map((w) => ({ value: w.id, label: title(w.id) }))} />
        )}
      </Field>
      {editing && hasBookings ? <p className="-mt-2 text-xs text-muted-foreground" data-testid="workshop-locked">{t("sessions.workshopLocked")}</p> : null}
      {editing ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="add-date" label={t("sessions.date")} required error={err("date")}>
            {(p) => <DateInput {...p} min={today} lenient value={date} onChange={setDate} />}
          </Field>
          <Field id="add-time" label={t("sessions.startTime")} required error={err("time")}>
            {(p) => <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
        </div>
      )}
      <Field id="add-cap" label={t("sessions.capacity")} required error={err("cap")}>
        {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={MAX_CAPACITY} value={cap} onChange={(e) => setCap(e.target.value)} />}
      </Field>
      <Field id="add-cutoff" label={t("sessions.cutoff")} hint={t("sessions.cutoffHint")} required error={err("cutoff")}>
        {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={MAX_BOOKING_CUTOFF_MINUTES} value={cutoff} onChange={(e) => setCutoff(e.target.value)} />}
      </Field>
      <div className="grid content-start gap-1.5">
        <ImageUploadField id="add-image" label={t("sessions.image")} value={image} onChange={setImage} uploader={sessionImageUploader} />
        <p className="text-xs text-muted-foreground">{t("sessions.imageHint")}</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}><ArrowLeft aria-hidden="true" />{tops("common.back")}</Button>
        <Button type="submit" disabled={!dirty}>{editing ? <Save aria-hidden="true" /> : source ? <Copy aria-hidden="true" /> : <Plus aria-hidden="true" />}{editing ? t("sessions.save") : source ? t("sessions.cloneConfirm") : t("sessions.addConfirm")}</Button>
      </DialogFooter>
    </form>
  );
}
