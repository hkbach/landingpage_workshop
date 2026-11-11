"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCustomer } from "./customer-shell";

const MAX_COMMENT = 500;

/**
 * The Completed button of a booking in My Booking: the guest rates the workshop (1 to 5 stars, a comment is optional). It is on every booking but READ-ONLY (disabled, with a note under it) until the guest has
 * checked in to the booking, because only someone who came can rate; the server checks it again. A booking can be rated once: after that the button stays read-only and the stars the guest gave are shown.
 */
export function RateBooking({ code, title, status, canRate, rating, onRated }: { code: string; title: string; status: string; canRate: boolean; rating?: { stars: number; comment: string }; onRated: () => void }) {
  const t = useTranslations("customer.bookings");
  const [open, setOpen] = useState(false);
  const checkedIn = status === "CHECKED_IN";
  const note = rating ? null : !checkedIn ? (status === "CANCELLED" ? null : t("completedNote")) : null;
  return (
    <span className="grid gap-1">
      <Button
        type="button" disabled={!canRate} aria-describedby={`rate-note-${code}`} onClick={() => setOpen(true)} data-testid="rate-booking"
        className={canRate ? "border-transparent bg-sky-600 text-white hover:bg-sky-700 focus-visible:ring-sky-600/40" : undefined}
      >
        <CircleCheck aria-hidden /> {t("completed")}<span className="sr-only"> {code}</span>
      </Button>
      {rating ? (
        <span id={`rate-note-${code}`} className="inline-flex items-center gap-1 text-xs font-medium text-amber-700" data-testid="booking-rated" data-stars={rating.stars}>
          <span className="inline-flex" aria-hidden>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn("size-3.5", i <= rating.stars ? "fill-amber-500 text-amber-500" : "text-black/20")} />)}</span>
          {t("rated", { stars: rating.stars })}
        </span>
      ) : <span id={`rate-note-${code}`} className={cn("text-xs text-muted-foreground", !note && "sr-only")} data-testid="rate-note">{note ?? ""}</span>}
      {open ? <RateDialog code={code} title={title} onClose={() => setOpen(false)} onRated={() => { setOpen(false); onRated(); }} /> : null}
    </span>
  );
}

function RateDialog({ code, title, onClose, onRated }: { code: string; title: string; onClose: () => void; onRated: () => void }) {
  const t = useTranslations("customer.bookings");
  const { accountId, email } = useCustomer();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<"" | "stars" | "failed" | "notCheckedIn" | "already">("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (stars < 1) { setError("stars"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/customer/${encodeURIComponent(accountId)}/bookings/${encodeURIComponent(code)}/rating`, {
        method: "POST", headers: { "content-type": "application/json", ...(email ? { "x-guest-email": email } : {}) }, body: JSON.stringify({ stars, ...(comment.trim() ? { comment: comment.trim() } : {}) }), // BR-16
      });
      if (res.status === 201) { onRated(); return; }
      const j = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      setError(j?.error?.code === "NOT_CHECKED_IN" ? "notCheckedIn" : j?.error?.code === "ALREADY_RATED" ? "already" : "failed");
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="rate-dialog">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("rateTitle")}</DialogTitle>
            <DialogDescription>{t("rateBody", { title })}</DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t("rateStars")}</legend>
            <div className="flex gap-1" role="radiogroup" aria-label={t("rateStars")}>
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i} type="button" role="radio" aria-checked={stars === i} aria-label={t("starLabel", { n: i })} data-testid={`rate-star-${i}`}
                  onClick={() => { setStars(i); setError(""); }}
                  className="grid size-10 place-items-center rounded-lg outline-none transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Star className={cn("size-7", i <= stars ? "fill-amber-500 text-amber-500" : "text-black/25")} aria-hidden />
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="rate-comment">{t("rateComment")}</Label>
            <Textarea id="rate-comment" rows={3} maxLength={MAX_COMMENT} value={comment} placeholder={t("ratePlaceholder")} onChange={(e) => setComment(e.target.value)} data-testid="rate-comment" />
            <p className="text-xs text-muted-foreground">{t("rateOnce")}</p>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive" data-testid="rate-error">{t(`rateErrors.${error}`)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("rateCancel")}</Button>
            <Button type="submit" disabled={busy} data-testid="rate-submit">{busy ? t("rateSubmitting") : t("rateSubmit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
