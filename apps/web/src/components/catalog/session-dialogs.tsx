"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, CalendarClock, Check, Lock, LogIn, Undo2 } from "lucide-react";
import { checkCloseReason, CLOSE_REASON_NOTE_MAX, SESSION_CLOSE_REASONS, type RescheduleError, type SessionCloseReason } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ops/field";
import { zonedToUtcIso } from "@/components/ops/time";
import { dayKey } from "@/lib/format";
import type { Booking, Customer, Session } from "@/lib/types";
import { canTransition, type BookingAction } from "@/lib/booking-state";
import { BookingStatusBadge } from "@/components/ops/status-badges";
import type { OpResult } from "@/components/ops/use-ops-state";

/** The reason of a change to a session: a basic reason from the list, or Other with a text that explains it. Used by Close and Re-schedule. */
function ReasonPicker({ prefix, code, onCode, note, onNote, error }: {
  prefix: string; code: string; onCode: (c: string) => void; note: string; onNote: (n: string) => void; error?: string;
}) {
  const t = useTranslations("catalog");
  return (
    <>
      <fieldset className="grid gap-2" data-testid={`${prefix}-reasons`}>
        <legend className="mb-1 text-sm font-medium">{t("sessions.closeReasonLegend")} <span aria-hidden className="text-destructive">*</span></legend>
        {SESSION_CLOSE_REASONS.map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name={`${prefix}-reason`} value={r} checked={code === r} onChange={() => onCode(r)} />
            {t(`sessions.closeReasons.${r}`)}
          </label>
        ))}
      </fieldset>
      {code === "OTHER" ? (
        <Field id={`${prefix}-note`} label={t("sessions.closeNote")} required error={error}>
          {(p) => <Textarea {...p} rows={3} maxLength={CLOSE_REASON_NOTE_MAX} value={note} onChange={(e) => onNote(e.target.value)} />}
        </Field>
      ) : null}
    </>
  );
}

/** Closing a session before it starts. */
export function CloseSessionDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (reason: SessionCloseReason) => void }) {
  const t = useTranslations("catalog");
  const tops = useTranslations("ops");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const checked = checkCloseReason(code, note);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!checked.ok) return setError(t("sessions.closeNoteRequired"));
    onConfirm(checked.reason);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("sessions.closeTitle")}</DialogTitle>
            <DialogDescription>{t("sessions.closeHint")}</DialogDescription>
          </DialogHeader>
          <ReasonPicker prefix="close" code={code} onCode={(c) => { setCode(c); setError(undefined); }} note={note} onNote={(n) => { setNote(n); setError(undefined); }} error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}><ArrowLeft aria-hidden="true" />{tops("common.back")}</Button>
            <Button type="submit" variant="destructive" disabled={code === ""}><Lock aria-hidden="true" />{t("sessions.closeConfirm")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The start of a session as the date and the time to show in the form (in the time zone of the shop). */
export function dateAndTime(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  return { date: dayKey(iso, timeZone), time: parts.replace(/^24:/, "00:") };
}

/** Re-scheduling a paused session: the new date and time, and why. Guests who booked it are emailed (see `bookings`). */
export function RescheduleSessionDialog({ open, onOpenChange, session, timezone, bookings, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; session?: Session; timezone: string; bookings: number;
  /** Returns why the new time is refused, or null when the session was re-scheduled. */
  onConfirm: (newStartsAt: string, reason: SessionCloseReason) => RescheduleError | null;
}) {
  const t = useTranslations("catalog");
  const tops = useTranslations("ops");
  const current = session ? dateAndTime(session.startsAt, timezone) : { date: "", time: "" };
  const [date, setDate] = useState(current.date);
  const [time, setTime] = useState(current.time);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ date?: string; time?: string; note?: string }>({});
  const checked = checkCloseReason(code, note);

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!date) errs.date = t("errors.required");
    if (!time) errs.time = t("errors.required");
    if (!checked.ok) errs.note = t("sessions.closeNoteRequired");
    if (Object.keys(errs).length > 0 || !checked.ok) return setErrors(errs);
    const refused = onConfirm(zonedToUtcIso(date, time, timezone), checked.reason);
    if (refused === "DUPLICATE") setErrors({ time: t("errors.duplicateSession") });
    else if (refused === "PAST") setErrors({ date: t("sessions.reschedulePast") });
    else if (refused) setErrors({ date: t("sessions.rescheduleSame") });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {session ? (
          <form onSubmit={submit} noValidate className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t("sessions.rescheduleTitle")}</DialogTitle>
              <DialogDescription>{t("sessions.rescheduleHint", { tz: timezone })}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="rs-date" label={t("sessions.newDate")} required error={errors.date}>
                {(p) => <Input {...p} type="date" value={date} onChange={(e) => { setDate(e.target.value); setErrors({}); }} />}
              </Field>
              <Field id="rs-time" label={t("sessions.newTime")} required error={errors.time}>
                {(p) => <Input {...p} type="time" value={time} onChange={(e) => { setTime(e.target.value); setErrors({}); }} />}
              </Field>
            </div>
            <ReasonPicker prefix="resched" code={code} onCode={(c) => { setCode(c); setErrors({}); }} note={note} onNote={(n) => { setNote(n); setErrors({}); }} error={errors.note} />
            <p role="status" data-testid="reschedule-bookings" className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{t("sessions.rescheduleBookings", { count: bookings })}</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}><ArrowLeft aria-hidden="true" />{tops("common.back")}</Button>
              <Button type="submit" disabled={code === ""}><CalendarClock aria-hidden="true" />{t("sessions.rescheduleConfirm")}</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The guests who booked a session, each with Check-in or Uncheck-in (undo a mistake). Only a confirmed (or late-released) booking can be checked
 * in and only a checked-in one can be unchecked; the other statuses are shown without a button. The rules are the booking state machine.
 */
export function CheckInDialog({ open, onOpenChange, session, bookings, customers, now, perform }: {
  open: boolean; onOpenChange: (o: boolean) => void; session?: Session; bookings: Booking[]; customers: Customer[]; now: Date;
  perform: (bookingId: string, action: BookingAction) => OpResult;
}) {
  const t = useTranslations("catalog");
  const [failed, setFailed] = useState<string | null>(null);
  const rows = session ? bookings.filter((b) => b.sessionId === session.id).sort((a, b) => a.bookingCode.localeCompare(b.bookingCode)) : [];
  const nameOf = (b: Booking) => customers.find((c) => c.id === b.customerId)?.fullName ?? "";
  // Guests expected: a cancelled booking is not counted (its guests do not come).
  const guests = rows.reduce((n, b) => (b.status === "CANCELLED" ? n : n + b.quantity), 0);
  const checked = rows.filter((b) => b.status === "CHECKED_IN" || b.status === "COMPLETED").reduce((n, b) => n + b.quantity, 0);

  function run(b: Booking, action: BookingAction) {
    const res = perform(b.id, action);
    setFailed(res.ok ? null : b.bookingCode);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setFailed(null); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl">
        {session ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t("sessions.checkInTitle", { code: session.code })}</DialogTitle>
              <DialogDescription>{t("sessions.checkInHint")}</DialogDescription>
            </DialogHeader>
            {rows.length === 0 ? (
              <p role="status" data-testid="checkin-empty" className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">{t("sessions.noBookings")}</p>
            ) : (
              <>
                <p role="status" data-testid="checkin-count" className="text-sm font-medium">{t("sessions.checkedInCount", { checked, total: guests })}</p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm" data-testid="checkin-table">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">{t("sessions.colBooking")}</th>
                        <th className="px-3 py-2 font-medium">{t("sessions.colGuest")}</th>
                        <th className="px-3 py-2 font-medium">{t("sessions.colSeats")}</th>
                        <th className="px-3 py-2 font-medium">{t("sessions.colStatus")}</th>
                        <th className="px-3 py-2 font-medium">{t("sessions.colReason")}</th>
                        <th className="px-3 py-2"><span className="sr-only">{t("sessions.checkIn")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((b) => {
                        const state = canTransition(b, session, now);
                        return (
                          <tr key={b.id} className="border-t" data-testid="checkin-row">
                            <td className="px-3 py-2 font-mono">{b.bookingCode}</td>
                            <td className="px-3 py-2">{nameOf(b)}</td>
                            <td className="px-3 py-2 tabular-nums">{b.quantity}</td>
                            <td className="px-3 py-2">
                              {b.status === "CANCELLED" ? (
                                <Badge variant="outline" className="border-transparent bg-red-100 text-red-900" data-testid="canceled-badge">{t("sessions.canceledBooking")}</Badge>
                              ) : (
                                <BookingStatusBadge status={b.status} />
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground" data-testid="checkin-reason">{b.status === "CANCELLED" ? (b.cancelReason || "—") : ""}</td>
                            <td className="px-3 py-2 text-right">
                              {state.CHECK_IN.allowed ? (
                                <Button size="sm" onClick={() => run(b, "CHECK_IN")}><LogIn aria-hidden="true" />{t("sessions.checkInRow")}</Button>
                              ) : state.UNDO_CHECK_IN.allowed ? (
                                <Button size="sm" variant="outline" onClick={() => run(b, "UNDO_CHECK_IN")}><Undo2 aria-hidden="true" />{t("sessions.uncheckInRow")}</Button>
                              ) : null}
                              {failed === b.bookingCode ? <p role="alert" className="mt-1 text-xs text-destructive">{t("sessions.checkInFailed")}</p> : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}><Check aria-hidden="true" />{t("sessions.checkInDone")}</Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
