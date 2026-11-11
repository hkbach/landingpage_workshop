"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useBookingActions } from "@/components/sections/booking-context";
import { siteFontClass } from "@/components/sections/site-fonts";
import { modalThemeStyle } from "@/components/sections/theme";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { captureAffiliate } from "@/lib/affiliate";
import type { PageTheme } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Opens the booking of the workshop an affiliate link is for (`?ref=CODE&book=WORKSHOP`), keeps the code so the booking carries it, and tells the server that the link was opened (once
 * per visit). When the workshop of the link was deactivated the guest lands on the landing page of the shop all the same, and a popup says that the workshop has ended (the booking
 * is not opened). The `ref` and `book` are taken off the address afterwards, so a reload does not open anything again.
 */
export function AffiliateEntry({ slug, shopName, theme, workshopIds }: { slug: string; shopName: string; theme: PageTheme; workshopIds: string[] }) {
  const { open } = useBookingActions();
  const t = useTranslations("site.affiliate");
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const { code, workshopId, fresh } = captureAffiliate(slug, window.location.search);
    if (!code && !workshopId) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("ref");
    url.searchParams.delete("book");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (workshopId && workshopIds.includes(workshopId)) open(workshopId);
    if (!code) return;
    // The server counts the click once per visit and says whether the workshop of the link is still active.
    fetch(`/api/v1/public/sites/${encodeURIComponent(slug)}/referrals/click`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, count: fresh }) })
      .then((res) => (res.ok ? (res.json() as Promise<{ workshopId: string; status: "ON_GOING" | "DEACTIVE" }>) : null))
      .then((link) => { if (link?.status === "DEACTIVE" && (!workshopId || workshopId === link.workshopId)) setEnded(true); })
      .catch(() => undefined);
    // Only on arrival: the address was read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Dialog open={ended} onOpenChange={setEnded}>
      <DialogContent style={modalThemeStyle(theme)} className={cn("gap-4 p-5 sm:max-w-md", siteFontClass(theme.font))} data-testid="affiliate-ended">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{t("endedTitle")}</DialogTitle>
          <DialogDescription className="text-[var(--site-muted)]">{t("endedBody", { shop: shopName })}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <button
            type="button" onClick={() => setEnded(false)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--site-primary)] px-5 py-2 text-sm font-semibold text-[var(--site-primary-fg)] outline-none transition hover:opacity-90 focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]/40"
          >
            {t("close")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
