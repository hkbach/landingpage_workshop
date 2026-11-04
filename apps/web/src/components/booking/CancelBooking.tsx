"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * The guest cancels their booking from the page where they looked it up (the code and the email already proved who they are): a button, then a popup that asks to
 * be sure and takes a reason that is optional. The server checks again (until the session starts, not once the guest is checked in).
 */
export function CancelBooking({ slug, code, email, onCancelled }: { slug: string; code: string; email: string; /** Called once it is cancelled, when the page updates itself (the default is to refresh the page). */ onCancelled?: () => void }) {
  const t = useTranslations("site.confirmation");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function cancel() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/v1/public/sites/${encodeURIComponent(slug)}/bookings/cancel`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, email, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
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
      <Button type="button" variant="outline" data-testid="cancel-booking" onClick={() => { setReason(""); setFailed(false); setOpen(true); }}>{t("cancelButton")}</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent data-testid="cancel-dialog">
          <DialogHeader>
            <DialogTitle>{t("cancelTitle", { code })}</DialogTitle>
            <DialogDescription>{t("cancelText")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="cancel-reason" className="text-sm font-medium">{t("cancelReasonLabel")}</label>
            <Textarea id="cancel-reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
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
