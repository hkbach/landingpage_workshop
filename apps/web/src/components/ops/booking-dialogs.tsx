"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PAYMENT_METHODS, formatMoney, minorDigits, type PaymentMethod } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Booking, Session } from "@/lib/types";
import { computePaymentStatus, netPaid } from "@/lib/booking-state";
import { formatDateTime } from "@/lib/format";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { PaymentStatusBadge } from "./status-badges";
import type { PaymentInput } from "./use-ops-state";

/** Generic "reason required" confirmation (cancel booking, cancel session). Remounts its form on each open. */
export function ReasonDialog({
  open, onOpenChange, title, description, label, confirmLabel, onConfirm, children,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; label: string; confirmLabel: string;
  onConfirm: (reason: string) => void; children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? (
          <ReasonForm title={title} description={description} label={label} confirmLabel={confirmLabel} onConfirm={onConfirm} onCancel={() => onOpenChange(false)}>
            {children}
          </ReasonForm>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ReasonForm({
  title, description, label, confirmLabel, onConfirm, onCancel, children,
}: {
  title: string; description?: ReactNode; label: string; confirmLabel: string; onConfirm: (r: string) => void; onCancel: () => void; children?: ReactNode;
}) {
  const t = useTranslations("ops");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return setError(t("errors.reasonRequired"));
    onConfirm(reason.trim());
  }
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      {children}
      <Field id="reason" label={label} required error={error}>
        {(p) => <Textarea {...p} value={reason} maxLength={300} onChange={(e) => { setReason(e.target.value); setError(undefined); }} />}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{t("common.back")}</Button>
        <Button type="submit" variant="destructive">{confirmLabel}</Button>
      </DialogFooter>
    </form>
  );
}

function toMinor(text: string, currency: string): number {
  const n = Number(text.replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n * 10 ** minorDigits(currency)) : NaN;
}

/** FR-PAY-01: append a payment or refund entry; payment_status is recomputed from all entries. */
export function PaymentDialog({
  open, onOpenChange, booking, onSubmit,
}: { open: boolean; onOpenChange: (o: boolean) => void; booking: Booking; onSubmit: (i: PaymentInput) => boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? <PaymentForm booking={booking} onSubmit={onSubmit} onCancel={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({ booking, onSubmit, onCancel }: { booking: Booking; onSubmit: (i: PaymentInput) => boolean; onCancel: () => void }) {
  const t = useTranslations("ops");
  const locale = useLocale();
  const net = netPaid(booking.payments);
  const balance = Math.max(0, booking.totalAmount - net);
  const digits = minorDigits(booking.currency);
  const [type, setType] = useState<"PAYMENT" | "REFUND">("PAYMENT");
  const [amount, setAmount] = useState(balance > 0 ? String(balance / 10 ** digits) : "");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  const minor = toMinor(amount, booking.currency);
  const valid = Number.isFinite(minor) && minor > 0 && (type === "PAYMENT" || minor <= net);
  const preview = valid ? computePaymentStatus(booking.totalAmount, [...booking.payments, { type, amount: minor }]) : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(minor) || minor <= 0) return setError(t("errors.amountInvalid"));
    if (type === "REFUND" && minor > net) return setError(t("errors.refundTooHigh", { max: formatMoney(net, booking.currency, locale) }));
    if (!onSubmit({ type, amount: minor, method, note: note.trim() })) setError(t("errors.amountInvalid"));
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{t("payment.dialogTitle")}</DialogTitle>
        <DialogDescription>{t("payment.dialogHint")}</DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-xs">
        <div><dt className="text-muted-foreground">{t("payment.total")}</dt><dd className="font-medium">{formatMoney(booking.totalAmount, booking.currency, locale)}</dd></div>
        <div><dt className="text-muted-foreground">{t("payment.netPaid")}</dt><dd className="font-medium">{formatMoney(net, booking.currency, locale)}</dd></div>
        <div><dt className="text-muted-foreground">{t("payment.balance")}</dt><dd className="font-medium">{formatMoney(balance, booking.currency, locale)}</dd></div>
      </dl>
      <div className="grid grid-cols-2 gap-3">
        <Field id="pay-type" label={t("payment.type")}>
          {(p) => (
            <NativeSelect {...p} value={type} onChange={(e) => setType(e.target.value as "PAYMENT" | "REFUND")}
              options={[{ value: "PAYMENT", label: t("payment.typePAYMENT") }, { value: "REFUND", label: t("payment.typeREFUND") }]} />
          )}
        </Field>
        <Field id="pay-method" label={t("payment.method")}>
          {(p) => (
            <NativeSelect {...p} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`paymentMethod.${m}`) }))} />
          )}
        </Field>
      </div>
      <Field id="pay-amount" label={t("payment.amount", { currency: booking.currency })} required error={error}>
        {(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(undefined); }} />}
      </Field>
      <Field id="pay-note" label={t("payment.note")}>
        {(p) => <Input {...p} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        {t("payment.resultingStatus")} {preview ? <PaymentStatusBadge status={preview} /> : "-"}
      </p>
      <p className="text-xs text-muted-foreground">{t("payment.immutable")}</p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{t("common.back")}</Button>
        <Button type="submit">{t("payment.save")}</Button>
      </DialogFooter>
    </form>
  );
}

/** FR-OPS-07 (Should): move a CONFIRMED booking to another session of the same workshop. */
export function RescheduleDialog({
  open, onOpenChange, booking, sessions, timezone, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; booking: Booking; sessions: Session[]; timezone: string;
  onSubmit: (targetSessionId: string) => boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? <RescheduleForm booking={booking} sessions={sessions} timezone={timezone} onSubmit={onSubmit} onCancel={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RescheduleForm({
  booking, sessions, timezone, onSubmit, onCancel,
}: { booking: Booking; sessions: Session[]; timezone: string; onSubmit: (id: string) => boolean; onCancel: () => void }) {
  const t = useTranslations("ops");
  const locale = useLocale();
  const candidates = sessions
    .filter((s) => s.workshopId === booking.workshopId && s.id !== booking.sessionId && s.status !== "CLOSED")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string>();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return setError(t("errors.pickSession"));
    if (!onSubmit(target)) setError(t("errors.noCapacity"));
  }
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{t("reschedule.title")}</DialogTitle>
        <DialogDescription>{t("reschedule.hint", { tz: timezone })}</DialogDescription>
      </DialogHeader>
      <Field id="rs-session" label={t("reschedule.newSession")} required error={error}>
        {(p) => (
          <NativeSelect {...p} value={target} onChange={(e) => { setTarget(e.target.value); setError(undefined); }}
            options={[
              { value: "", label: t("reschedule.choose") },
              ...candidates.map((s) => {
                const left = s.capacity - s.reservedCount;
                return {
                  value: s.id, disabled: left < booking.quantity,
                  label: `${formatDateTime(s.startsAt, timezone, locale)} | ${t("reschedule.left", { count: left })}`,
                };
              }),
            ]} />
        )}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{t("common.back")}</Button>
        <Button type="submit">{t("reschedule.confirm")}</Button>
      </DialogFooter>
    </form>
  );
}
