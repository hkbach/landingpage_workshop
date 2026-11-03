"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isSessionFinished } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Booking, Session } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { Field } from "./field";
import { NativeSelect } from "./native-select";

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
    .filter((s) => s.workshopId === booking.workshopId && s.id !== booking.sessionId && !isSessionFinished(s.status))
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
