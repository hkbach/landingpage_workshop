"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** The basic reasons a guest can pick; Other opens a text box. */
export const GUEST_CANCEL_REASONS = ["PLANS_CHANGED", "SCHEDULE_CONFLICT", "FOUND_ALTERNATIVE", "UNWELL", "BOOKED_BY_MISTAKE", "OTHER"] as const;
export type GuestCancelReason = (typeof GUEST_CANCEL_REASONS)[number];

/**
 * The guest cancels their booking from the page where they looked it up (the code and the email already proved who they are): a button, then a popup that asks to
 * be sure and takes a reason that is optional: one of the basic reasons, and for Other a text box to write it. The reason is sent as text in the language of the guest (the
 * label of the basic reason, or what they wrote). The server checks again (until the session starts, not once the guest is checked in).
 */
export function CancelBooking({ slug, code, email, onCancelled }: { slug: string; code: string; email: string; /** Called once it is cancelled, when the page updates itself (the default is to refresh the page). */ onCancelled?: () => void }) {
  const t = useTranslations("site.confirmation");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<GuestCancelReason | "">(""); // none picked: no reason is sent
  const [note, setNote] = useState(""); // what the guest wrote for Other
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  /** The reason as text: the label of the basic reason picked, or what the guest wrote for Other (the label "Other" when they wrote nothing). */
  const reasonText = (): string => (choice === "" ? "" : choice === "OTHER" ? (note.trim() || t("cancelReasons.OTHER")) : t(`cancelReasons.${choice}`));

  async function cancel() {
    const reason = reasonText();
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/v1/public/sites/${encodeURIComponent(slug)}/bookings/cancel`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, email, ...(reason ? { reason: reason.slice(0, 300) } : {}) }),
      });
      if (!res.ok) { setFailed(true); return; }
      setOpen(false);
      if (onCancelled) onCancelled();
      else router.refresh(); // the page now shows the booking as cancelled
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2 text-sm">
      <Button type="button" variant="outline" data-testid="cancel-booking" onClick={() => { setChoice(""); setNote(""); setFailed(false); setOpen(true); }}>{t("cancelButton")}</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent data-testid="cancel-dialog">
          <DialogHeader>
            <DialogTitle>{t("cancelTitle", { code })}</DialogTitle>
            <DialogDescription>{t("cancelText")}</DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-2" data-testid="cancel-reasons">
            <legend className="mb-1 text-sm font-medium">{t("cancelReasonLegend")}</legend>
            {GUEST_CANCEL_REASONS.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="cancel-reason-choice" value={r} checked={choice === r} onChange={() => setChoice(r)} className="size-4 shrink-0" data-testid={`cancel-reason-${r}`} />
                {t(`cancelReasons.${r}`)}
              </label>
            ))}
          </fieldset>
          {/* The text box only when the guest picks Other. */}
          {choice === "OTHER" ? (
            <div className="grid gap-1.5">
              <label htmlFor="cancel-reason" className="text-sm font-medium">{t("cancelReasonLabel")}</label>
              <Textarea id="cancel-reason" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          ) : null}
          {failed ? <p role="alert" data-testid="cancel-failed" className="text-sm text-destructive">{t("cancelFailed")}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("cancelKeep")}</Button>
            <Button type="button" variant="destructive" data-testid="cancel-confirm" disabled={busy} onClick={() => void cancel()}>{busy ? t("cancelling") : t("cancelConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
