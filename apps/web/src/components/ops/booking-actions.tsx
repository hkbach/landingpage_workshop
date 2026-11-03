"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Ban, CalendarClock, CheckCheck, CircleDollarSign, Clock, LogIn, Undo2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Booking, Session } from "@/lib/types";
import { canTransition, type BookingAction } from "@/lib/booking-state";
import { PaymentDialog, ReasonDialog, RescheduleDialog } from "./booking-dialogs";
import type { OpResult, PaymentInput } from "./use-ops-state";

export interface BookingOps {
  now: Date;
  sessions: Session[];
  perform: (bookingId: string, action: BookingAction, reason?: string) => OpResult;
  addPayment: (bookingId: string, input: PaymentInput) => OpResult;
  reschedule: (bookingId: string, targetSessionId: string) => OpResult;
}

const ICONS = { CHECK_IN: LogIn, UNDO_CHECK_IN: Undo2, LATE_RELEASE: Clock, NO_SHOW: UserX, CANCEL: Ban, COMPLETE: CheckCheck, RESCHEDULE: CalendarClock } as const;
const PRIMARY: BookingAction[] = ["CHECK_IN", "COMPLETE", "LATE_RELEASE", "NO_SHOW", "CANCEL"];

/**
 * Quick actions for one booking. Enablement comes from the pure state machine (`canTransition`).
 * Check-in and payment are separate actions (FR-OPS-03).
 */
export function BookingActions({
  booking, session, ops, timezone, compact = false, showReschedule = false,
}: { booking: Booking; session: Session; ops: BookingOps; timezone: string; compact?: boolean; showReschedule?: boolean }) {
  const t = useTranslations("ops");
  const [dialog, setDialog] = useState<"cancel" | "payment" | "reschedule" | null>(null);
  const [message, setMessage] = useState<string>();
  const states = canTransition(booking, session, ops.now);

  function run(action: BookingAction, reason?: string) {
    const r = ops.perform(booking.id, action, reason);
    setMessage(r.ok ? undefined : t(`blocked.${r.reason}`));
    return r.ok;
  }

  const actions: BookingAction[] = (showReschedule ? [...PRIMARY, "RESCHEDULE" as const] : PRIMARY).filter((a) => {
    // Hide actions that can never apply from the current status; time-gated ones stay visible but disabled.
    if (a === "CHECK_IN") return booking.status === "CONFIRMED" || booking.status === "LATE_RELEASED";
    if (a === "COMPLETE") return booking.status === "CHECKED_IN";
    return booking.status === "CONFIRMED";
  });
  const timeHint =
    booking.status === "CONFIRMED" && !states.LATE_RELEASE.allowed && states.LATE_RELEASE.reason === "TOO_EARLY_LATE_RELEASE"
      ? t("blocked.TOO_EARLY_LATE_RELEASE") : undefined;
  const size = compact ? "sm" : "default";

  return (
    <div className="grid content-start gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {actions.map((a) => {
          const Icon = ICONS[a];
          const st = states[a];
          return (
            <Button
              key={a} size={size} variant={a === "CANCEL" ? "destructive" : a === "CHECK_IN" ? "default" : "outline"}
              disabled={!st.allowed}
              title={!st.allowed && st.reason ? t(`blocked.${st.reason}`) : undefined}
              onClick={() => {
                if (a === "CANCEL") setDialog("cancel");
                else if (a === "RESCHEDULE") setDialog("reschedule");
                else run(a);
              }}
            >
              <Icon aria-hidden="true" />
              {t(`action.${a}`)}
            </Button>
          );
        })}
        <Button size={size} variant="outline" onClick={() => setDialog("payment")}>
          <CircleDollarSign aria-hidden="true" />
          {t("action.RECORD_PAYMENT")}
        </Button>
      </div>
      {timeHint && !compact ? <p className="text-xs text-muted-foreground">{timeHint}</p> : null}
      <p role="status" className="text-xs text-destructive empty:hidden">{message}</p>

      <ReasonDialog
        open={dialog === "cancel"} onOpenChange={(o) => !o && setDialog(null)}
        title={t("cancelBooking.title")} description={t("cancelBooking.hint", { code: booking.bookingCode })}
        label={t("cancelBooking.reason")} confirmLabel={t("cancelBooking.confirm")}
        onConfirm={(reason) => { if (run("CANCEL", reason)) setDialog(null); }}
      />
      <PaymentDialog
        open={dialog === "payment"} onOpenChange={(o) => !o && setDialog(null)} booking={booking}
        onSubmit={(input) => { const r = ops.addPayment(booking.id, input); if (r.ok) setDialog(null); return r.ok; }}
      />
      {showReschedule ? (
        <RescheduleDialog
          open={dialog === "reschedule"} onOpenChange={(o) => !o && setDialog(null)} booking={booking}
          sessions={ops.sessions} timezone={timezone}
          onSubmit={(id) => { const r = ops.reschedule(booking.id, id); if (r.ok) setDialog(null); return r.ok; }}
        />
      ) : null}
    </div>
  );
}
