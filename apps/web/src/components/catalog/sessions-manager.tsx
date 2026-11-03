"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useDisplayLocale } from "@/lib/use-shop-language";
import { ArrowLeft, CalendarClock, Lock, Pause, Pencil, Play, Plus, Save } from "lucide-react";
import { allowedSessionActions, closeWaitsForEnd, type SessionCloseReason, DEFAULT_BOOKING_CUTOFF_MINUTES, isValidBookingCutoff, MAX_BOOKING_CUTOFF_MINUTES, pickLocalized, SESSION_STATUSES, type Locale, type SessionStatus } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CapacityBar } from "@/components/ops/capacity-bar";
import { Field } from "@/components/ops/field";
import { NativeSelect } from "@/components/ops/native-select";
import { SessionStatusBadge } from "@/components/ops/status-badges";
import { addDays, formatDayKey, zonedToUtcIso } from "@/components/ops/time";
import { useOpsState } from "@/components/ops/use-ops-state";
import type { Booking, Session, Workshop } from "@/lib/types";
import { dayKey, formatTime } from "@/lib/format";
import { MAX_CAPACITY, type ShopForCatalog } from "./workshop-form";
import { CloseSessionDialog, RescheduleSessionDialog } from "./session-dialogs";
import { notifyRescheduleRequest } from "@/lib/sessions-api";
import { useDirty } from "@/lib/use-dirty";

/** FR-SCHED-02/03: sessions agenda by date range + workshop; add one-off, close/open, edit capacity, cancel. */
export function SessionsManager({
  sessions, bookings, workshops, shop, nowIso, actor,
}: { sessions: Session[]; bookings: Booking[]; workshops: Workshop[]; shop: ShopForCatalog; nowIso: string; actor: string }) {
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
  const [dialog, setDialog] = useState<{ kind: "add" } | { kind: "capacity" | "close" | "reschedule"; id: string } | null>(null);

  const displayLocale = useDisplayLocale(shop);
  /** The date of a note ("Nov 12, 2026"), in the time zone of the shop. */
  const dateText = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: shop.timezone }).format(new Date(iso));
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
            <Field id="s-from" label={t("sessions.from")}>{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
            <Field id="s-to" label={t("sessions.to")}>{(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
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
                  <Card size="sm" className={s.status === "CLOSED" ? "opacity-80" : ""}>
                    <CardContent className="grid gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{title(s.workshopId)}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatTime(s.startsAt, shop.timezone, locale)} - {formatTime(s.endsAt, shop.timezone, locale)}
                          </p>
                        </div>
                        <SessionStatusBadge status={s.status} />
                      </div>
                      <CapacityBar reserved={s.reservedCount} capacity={s.capacity} />
                      <p className="text-xs text-muted-foreground" data-testid="session-cutoff">{t("sessions.cutoffInfo", { minutes: s.bookingCutoffMinutes })}</p>
                      {s.autoClosed ? <p className="text-xs text-muted-foreground" data-testid="auto-closed-note">{dateText(s.endsAt)} - {t("sessions.autoClosedNote")}</p> : null}
                      {s.rescheduleReason ? (
                        <p className="text-xs text-muted-foreground" data-testid="reschedule-reason">
                          {s.rescheduledAt ? `${dateText(s.rescheduledAt)} - ` : ""}{t("sessions.rescheduledBecause")}: {s.rescheduleReason.code === "OTHER" ? s.rescheduleReason.note : t(`sessions.closeReasons.${s.rescheduleReason.code}`)}
                        </p>
                      ) : null}
                      {s.closeReason ? (
                        <p className="text-xs text-muted-foreground" data-testid="close-reason">
                          {s.closedAt ? `${dateText(s.closedAt)} - ` : ""}{t("sessions.closedBecause")}: {s.closeReason.code === "OTHER" ? s.closeReason.note : t(`sessions.closeReasons.${s.closeReason.code}`)}
                        </p>
                      ) : null}
                      {s.status !== "CLOSED" ? (
                        <div className="flex flex-wrap gap-1.5">
                          {actions.includes("start") ? (
                            <Button size="sm" variant="outline" onClick={() => ops.sessionAction(s.id, "start")}><Play aria-hidden="true" />{t("sessions.start")}</Button>
                          ) : null}
                          {actions.includes("pause") ? (
                            <Button size="sm" variant="outline" onClick={() => ops.sessionAction(s.id, "pause")}><Pause aria-hidden="true" />{t("sessions.pause")}</Button>
                          ) : null}
                          {s.status === "PAUSED" ? (
                            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "reschedule", id: s.id })}><CalendarClock aria-hidden="true" />{t("sessions.reschedule")}</Button>
                          ) : null}
                          {actions.includes("close") ? (
                            closeWaitsForEnd(s, ops.now) ? (
                              // Read-only while the session is taking place: the span carries the tooltip (a disabled button does not).
                              <span title={t("sessions.closeWait")} data-testid="close-wait" className="inline-flex cursor-not-allowed">
                                <Button size="sm" variant="destructive" disabled aria-disabled="true" aria-label={`${t("sessions.close")}: ${t("sessions.closeWait")}`}>
                                  <Lock aria-hidden="true" />{t("sessions.close")}
                                </Button>
                              </span>
                            ) : (
                              <Button size="sm" variant="destructive" onClick={() => setDialog({ kind: "close", id: s.id })}><Lock aria-hidden="true" />{t("sessions.close")}</Button>
                            )
                          ) : null}
                          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "capacity", id: s.id })}>
                            <Pencil aria-hidden="true" />{t("sessions.editCapacity")}
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <AddSessionDialog
        open={dialog?.kind === "add"} onOpenChange={(o) => !o && setDialog(null)} workshops={workshops} shop={shop} sessions={ops.sessions} title={title}
        onAdd={(s) => { ops.addSession(s); setDialog(null); }}
      />
      <CloseSessionDialog
        key={`close-${target?.id ?? "none"}`} open={dialog?.kind === "close" && !!target} onOpenChange={(o) => !o && setDialog(null)}
        onConfirm={(reason) => { if (target && ops.sessionAction(target.id, "close", reason)) setDialog(null); }}
      />
      <RescheduleSessionDialog
        key={`resched-${target?.id ?? "none"}`} open={dialog?.kind === "reschedule" && !!target} onOpenChange={(o) => !o && setDialog(null)}
        session={target} timezone={shop.timezone} bookings={target ? ops.bookings.filter((b) => b.sessionId === target.id && b.status === "CONFIRMED").length : 0}
        onConfirm={(newStartsAt, reason) => { if (!target) return null; const res = ops.rescheduleSession(target.id, newStartsAt, reason); if (!res.ok) return res.error; setDialog(null); void notifyGuests(target.id, res); return null; }}
      />
      <CapacityDialog
        key={target?.id ?? "none"} open={dialog?.kind === "capacity" && !!target} onOpenChange={(o) => !o && setDialog(null)} session={target}
        onSave={(n) => { if (target && ops.setSessionCapacity(target.id, n)) { setDialog(null); return true; } return false; }}
      />
    </div>
  );
}

function CapacityDialog({
  open, onOpenChange, session, onSave,
}: { open: boolean; onOpenChange: (o: boolean) => void; session?: Session; onSave: (n: number) => boolean }) {
  const t = useTranslations("catalog");
  const tops = useTranslations("ops");
  const [value, setValue] = useState(session ? String(session.capacity) : "");
  const [error, setError] = useState<string>();
  const dirty = useDirty(value, session?.id ?? null);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > MAX_CAPACITY) return setError(t("errors.capacityRange"));
    if (n < session.reservedCount) return setError(t("errors.capacityBelowReserved", { reserved: session.reservedCount }));
    if (!onSave(n)) setError(t("errors.capacityRange"));
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {session ? (
          <form onSubmit={submit} noValidate className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t("sessions.capacityTitle")}</DialogTitle>
              <DialogDescription>{t("sessions.capacityHint", { reserved: session.reservedCount })}</DialogDescription>
            </DialogHeader>
            <Field id="cap-value" label={t("sessions.capacity")} required error={error}>
              {(p) => <Input {...p} type="number" inputMode="numeric" min={session.reservedCount} max={MAX_CAPACITY} value={value} onChange={(e) => { setValue(e.target.value); setError(undefined); }} />}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}><ArrowLeft aria-hidden="true" />{tops("common.back")}</Button>
              <Button type="submit" disabled={!dirty}><Save aria-hidden="true" />{t("sessions.save")}</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddSessionDialog({
  open, onOpenChange, workshops, shop, sessions, title, onAdd,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; workshops: Workshop[]; shop: ShopForCatalog; sessions: Session[];
  title: (id: string) => string; onAdd: (s: Omit<Session, "id" | "reservedCount" | "status">) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? <AddSessionForm workshops={workshops} shop={shop} sessions={sessions} title={title} onAdd={onAdd} onCancel={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddSessionForm({
  workshops, shop, sessions, title, onAdd, onCancel,
}: {
  workshops: Workshop[]; shop: ShopForCatalog; sessions: Session[]; title: (id: string) => string;
  onAdd: (s: Omit<Session, "id" | "reservedCount" | "status">) => void; onCancel: () => void;
}) {
  const t = useTranslations("catalog");
  const tops = useTranslations("ops");
  const choices = workshops.filter((w) => w.status !== "ARCHIVED");
  const [wsId, setWsId] = useState(choices[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [cap, setCap] = useState(String(choices[0]?.defaultCapacity ?? 8));
  const [cutoff, setCutoff] = useState(String(DEFAULT_BOOKING_CUTOFF_MINUTES));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = useDirty({ wsId, date, time, cap, cutoff }, "add");

  function submit(e: FormEvent) {
    e.preventDefault();
    const w = workshops.find((x) => x.id === wsId);
    const errs: Record<string, string> = {};
    if (!w) errs.ws = "errors.required";
    if (!date) errs.date = "errors.required";
    if (!time) errs.time = "errors.required";
    const n = Number(cap);
    if (!Number.isInteger(n) || n < 1 || n > MAX_CAPACITY) errs.cap = "errors.capacityRange";
    const cutoffMinutes = cutoff.trim() === "" ? Number.NaN : Number(cutoff);
    if (!isValidBookingCutoff(cutoffMinutes)) errs.cutoff = "errors.cutoffInvalid";
    let startsAt = "";
    if (w && date && time) {
      startsAt = zonedToUtcIso(date, time, shop.timezone);
      if (sessions.some((s) => s.workshopId === w.id && s.startsAt === startsAt)) errs.time = "errors.duplicateSession";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !w) return;
    onAdd({ workshopId: w.id, startsAt, endsAt: new Date(new Date(startsAt).getTime() + w.durationMinutes * 60_000).toISOString(), capacity: n, bookingCutoffMinutes: cutoffMinutes });
  }
  const err = (k: string) => (errors[k] ? t(errors[k]) : undefined);

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("sessions.addTitle")}</DialogTitle>
        <DialogDescription>{t("sessions.addHint", { tz: shop.timezone })}</DialogDescription>
      </DialogHeader>
      <Field id="add-ws" label={t("sessions.workshop")} required error={err("ws")}>
        {(p) => (
          <NativeSelect {...p} value={wsId}
            onChange={(e) => { setWsId(e.target.value); const w = workshops.find((x) => x.id === e.target.value); if (w) setCap(String(w.defaultCapacity)); }}
            options={choices.map((w) => ({ value: w.id, label: title(w.id) }))} />
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="add-date" label={t("sessions.date")} required error={err("date")}>
          {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field id="add-time" label={t("sessions.startTime")} required error={err("time")}>
          {(p) => <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
        </Field>
      </div>
      <Field id="add-cap" label={t("sessions.capacity")} required error={err("cap")}>
        {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={MAX_CAPACITY} value={cap} onChange={(e) => setCap(e.target.value)} />}
      </Field>
      <Field id="add-cutoff" label={t("sessions.cutoff")} hint={t("sessions.cutoffHint")} required error={err("cutoff")}>
        {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={MAX_BOOKING_CUTOFF_MINUTES} value={cutoff} onChange={(e) => setCutoff(e.target.value)} />}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}><ArrowLeft aria-hidden="true" />{tops("common.back")}</Button>
        <Button type="submit" disabled={!dirty}><Plus aria-hidden="true" />{t("sessions.addConfirm")}</Button>
      </DialogFooter>
    </form>
  );
}
