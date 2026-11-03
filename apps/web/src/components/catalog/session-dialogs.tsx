"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, BadgeCheck, CalendarClock, Check, CheckCheck, Lock, LogIn, Undo2 } from "lucide-react";
import { checkCloseReason, CLOSE_REASON_NOTE_MAX, formatMoney, isSessionFinished, SESSION_CLOSE_REASONS, type RescheduleError, type SessionCloseReason } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ops/field";
import { zonedToUtcIso } from "@/components/ops/time";
import { dayKey } from "@/lib/format";
import type { Booking, Customer, Session } from "@/lib/types";
import { canTransition, type BookingAction } from "@/lib/booking-state";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ops/status-badges";
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
export function CloseSessionDialog({ open, onOpenChange, onConfirm, final = false }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (reason: SessionCloseReason) => void; final?: boolean }) {
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
          {final ? <p role="alert" data-testid="close-final-warning" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-destructive">{t("sessions.closeFinalWarning")}</p> : null}
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
                {(p) => <DateInput {...p} value={date} onChange={(day) => { setDate(day); setErrors({}); }} />}
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
export function CheckInDialog({ open, onOpenChange, session, bookings, customers, now, timezone, perform }: {
  open: boolean; onOpenChange: (o: boolean) => void; session?: Session; bookings: Booking[]; customers: Customer[]; now: Date; timezone: string;
  perform: (bookingId: string, action: BookingAction) => OpResult;
}) {
  const t = useTranslations("catalog");
  const locale = useLocale();
  const [failed, setFailed] = useState<string | null>(null);
  const readOnly = session ? isSessionFinished(session.status) : false; // a closed or completed session: the list is for viewing
  const stamp = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(iso));
  const rows = session ? bookings.filter((b) => b.sessionId === session.id).sort((a, b) => a.bookingCode.localeCompare(b.bookingCode)) : [];
  const nameOf = (b: Booking) => customers.find((c) => c.id === b.customerId)?.fullName ?? "";
  // Guests expected: a cancelled booking is not counted (its guests do not come).
  const guests = rows.reduce((n, b) => (b.status === "CANCELLED" ? n : n + b.quantity), 0);
  const checked = rows.filter((b) => b.status === "CHECKED_IN").reduce((n, b) => n + b.quantity, 0);

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
              <DialogDescription>{readOnly ? t("sessions.checkInReadOnly") : t("sessions.checkInHint")}</DialogDescription>
              {readOnly ? null : <p data-testid="checkin-rules" className="text-xs text-muted-foreground">{t("sessions.checkInRules")}</p>}
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
                        <th className="px-3 py-2 font-medium">{t("sessions.colGuest")}</th>
                        <th className="px-3 py-2 font-medium">{t("sessions.colStatus")}</th>
                        <th className="px-3 py-2 font-medium">{t("sessions.colCheckedInAt")}</th>
                        <th className="px-3 py-2 font-medium">{t("sessions.colReason")}</th>
                        <th className="px-3 py-2"><span className="sr-only">{t("sessions.checkIn")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((b) => {
                        const state = canTransition(b, session, now);
                        return (
                          <tr key={b.id} className="border-t" data-testid="checkin-row">
                            <td className="px-3 py-2">
                              <div className="font-medium" data-testid="checkin-guest">{nameOf(b)}</div>
                              <div className="text-xs text-muted-foreground">
                                <span className="font-mono" data-testid="checkin-code">{b.bookingCode}</span> · <span data-testid="checkin-seats">{t("sessions.guestCount", { count: b.quantity })}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {b.status === "CANCELLED" ? (
                                <Badge variant="outline" className="border-transparent bg-red-100 text-red-900" data-testid="canceled-badge">{t("sessions.canceledBooking")}</Badge>
                              ) : (
                                <BookingStatusBadge status={b.status} />
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground" data-testid="checkin-at">{b.checkedInAt && b.status === "CHECKED_IN" ? stamp(b.checkedInAt) : "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground" data-testid="checkin-reason">{b.status === "CANCELLED" ? (b.cancelReason || "—") : ""}</td>
                            <td className="px-3 py-2 text-right">
                              {readOnly ? null : state.CHECK_IN.allowed ? (
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

/**
 * The payments of the bookings of a session, in three parts: the guests who checked in, the ones who did not, and the cancelled ones. Each row has
 * Confirm payment (the guest paid at the studio: the booking becomes Paid and the guest is emailed) or, once it is Paid, Unpaid (to undo a mistake).
 * `mode`: "payment" (Confirm payment button of a closed session), "complete" (the same list with a Completed button at the end: after a confirmation the
 * session is Completed and nothing about it changes any more) or "view" (a Completed session: the payments are only shown).
 */
export function PaymentDialog({ open, onOpenChange, session, bookings, customers, setPaid, notifyPaid, mode, onComplete }: {
  open: boolean; onOpenChange: (o: boolean) => void; session?: Session; bookings: Booking[]; customers: Customer[]; mode: "payment" | "complete" | "view";
  /** Called once the owner has confirmed that the session is Completed. */
  onComplete?: () => void;
  setPaid: (bookingId: string, paid: boolean) => OpResult;
  /** Tells the server a booking became Paid so the guest is emailed; resolves with the number of emails queued (0: the guest left no email). */
  notifyPaid: (bookingId: string) => Promise<number>;
}) {
  const t = useTranslations("catalog");
  const locale = useLocale();
  const [failed, setFailed] = useState<string | null>(null);
  const [mail, setMail] = useState<{ code: string; state: "sent" | "none" | "failed" } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const rows = session ? bookings.filter((b) => b.sessionId === session.id).sort((a, b) => a.bookingCode.localeCompare(b.bookingCode)) : [];
  const nameOf = (b: Booking) => customers.find((c) => c.id === b.customerId)?.fullName ?? "";
  const parts = [
    { key: "checkedIn", title: t("sessions.partCheckedIn"), list: rows.filter((b) => b.status === "CHECKED_IN") },
    { key: "notCheckedIn", title: t("sessions.partNotCheckedIn"), list: rows.filter((b) => b.status !== "CHECKED_IN" && b.status !== "CANCELLED") },
    { key: "cancelled", title: t("sessions.partCancelled"), list: rows.filter((b) => b.status === "CANCELLED") },
  ];
  const paid = rows.filter((b) => b.paymentStatus === "PAID").length;

  function confirm(b: Booking) {
    const res = setPaid(b.id, true);
    setFailed(res.ok ? null : b.bookingCode);
    if (!res.ok) return;
    setMail(null);
    notifyPaid(b.id).then((n) => setMail({ code: b.bookingCode, state: n > 0 ? "sent" : "none" })).catch(() => setMail({ code: b.bookingCode, state: "failed" }));
  }
  function undo(b: Booking) {
    setFailed(setPaid(b.id, false).ok ? null : b.bookingCode);
    setMail(null);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setFailed(null); setMail(null); setConfirming(false); } onOpenChange(o); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {session ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t(mode === "complete" ? "sessions.completeTitle" : mode === "view" ? "sessions.completedTitle" : "sessions.paymentTitle", { code: session.code })}</DialogTitle>
              <DialogDescription>{t(mode === "complete" ? "sessions.completeHint" : mode === "view" ? "sessions.completedHint" : "sessions.paymentHint")}</DialogDescription>
            </DialogHeader>
            {rows.length === 0 ? (
              <p role="status" data-testid="payment-empty" className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">{t("sessions.noBookings")}</p>
            ) : (
              <>
                <p role="status" data-testid="payment-count" className="text-sm font-medium">{t("sessions.paidCount", { paid, total: rows.length })}</p>
                {parts.map((part) => (
                  <section key={part.key} aria-labelledby={`pay-${part.key}`} data-testid={`payment-part-${part.key}`} className="grid gap-2">
                    <h3 id={`pay-${part.key}`} className="text-sm font-semibold">{part.title} ({part.list.length})</h3>
                    {part.list.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{t("sessions.partEmpty")}</p>
                    ) : (
                      <ul className="divide-y rounded-lg border">
                        {part.list.map((b) => (
                          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="payment-row">
                            <div className="min-w-0">
                              <div className="font-medium">{nameOf(b)}</div>
                              <div className="text-xs text-muted-foreground">
                                <span className="font-mono" data-testid="payment-code">{b.bookingCode}</span> · {t("sessions.guestCount", { count: b.quantity })} · <span data-testid="payment-amount">{formatMoney(b.totalAmount, b.currency, locale)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span data-testid="payment-status"><PaymentStatusBadge status={b.paymentStatus} /></span>
                              {b.totalAmount <= 0 ? (
                                <span className="text-xs text-muted-foreground">{t("sessions.nothingToPay")}</span>
                              ) : mode === "view" ? null : b.paymentStatus === "PAID" ? (
                                <Button size="sm" variant="outline" data-testid="payment-unpaid" onClick={() => undo(b)}><Undo2 aria-hidden="true" />{t("sessions.markUnpaid")}</Button>
                              ) : (
                                <Button size="sm" data-testid="payment-confirm" onClick={() => confirm(b)}><BadgeCheck aria-hidden="true" />{t("sessions.confirmPayment")}</Button>
                              )}
                            </div>
                            {failed === b.bookingCode ? <p role="alert" className="basis-full text-right text-xs text-destructive">{t("sessions.paymentFailed")}</p> : null}
                            {mail?.code === b.bookingCode ? (
                              <p role="status" data-testid="payment-mail" data-state={mail.state} className={`basis-full text-right text-xs ${mail.state === "failed" ? "text-destructive" : "text-emerald-800"}`}>
                                {t(mail.state === "sent" ? "sessions.paymentMailed" : mail.state === "none" ? "sessions.paymentMailNone" : "sessions.paymentMailFailed")}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}><Check aria-hidden="true" />{t("sessions.checkInDone")}</Button>
              {mode === "complete" ? (
                <Button type="button" data-testid="complete-submit" className="bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600/40" onClick={() => setConfirming(true)}>
                  <CheckCheck aria-hidden="true" />{t("sessions.complete")}
                </Button>
              ) : null}
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
    <Dialog open={confirming && mode === "complete"} onOpenChange={setConfirming}>
      <DialogContent className="sm:max-w-md" data-testid="complete-confirm">
        <DialogHeader>
          <DialogTitle>{t("sessions.completeConfirmTitle", { code: session?.code ?? "" })}</DialogTitle>
          <DialogDescription>{t("sessions.completeConfirmText")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setConfirming(false)}><ArrowLeft aria-hidden="true" />{t("sessions.completeBack")}</Button>
          <Button type="button" data-testid="complete-confirm-button" className="bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600/40" onClick={() => { setConfirming(false); onComplete?.(); }}>
            <CheckCheck aria-hidden="true" />{t("sessions.completeConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
