"use client";

import { useEffect } from "react";
import { useBookingActions } from "@/components/sections/booking-context";
import { captureAffiliate } from "@/lib/affiliate";

/**
 * Opens the booking of the workshop an affiliate link is for (`?ref=CODE&book=WORKSHOP`), keeps the code so the booking carries it, and tells the server once per visit that the
 * link was opened. It shows nothing. The `ref` and `book` are taken off the address afterwards, so a reload does not open the booking again.
 */
export function AffiliateEntry({ slug, workshopIds }: { slug: string; workshopIds: string[] }) {
  const { open } = useBookingActions();
  useEffect(() => {
    const { code, workshopId, fresh } = captureAffiliate(slug, window.location.search);
    if (!code && !workshopId) return;
    if (code && fresh) void fetch(`/api/v1/public/sites/${encodeURIComponent(slug)}/referrals/click`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => undefined);
    if (workshopId && workshopIds.includes(workshopId)) open(workshopId);
    const url = new URL(window.location.href);
    url.searchParams.delete("ref");
    url.searchParams.delete("book");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    // Only on arrival: the address was read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
