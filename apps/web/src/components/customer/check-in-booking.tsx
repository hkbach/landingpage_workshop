"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCustomer } from "./customer-shell";

/**
 * The Check-in button of a booking in My Booking. It is on every booking: on while the guest can check in (the server says so: confirmed, from an hour before the workshop until it
 * ends, session not closed; green), off otherwise (the ticket says why under the buttons). Pressing it checks the guest in; the server checks the time again.
 */
export function CheckInBooking({ code, enabled, onCheckedIn }: { code: string; enabled: boolean; /** Called once the guest is checked in, when the page updates itself. */ onCheckedIn: () => void }) {
  const t = useTranslations("customer.bookings");
  const { accountId, email } = useCustomer();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function checkIn() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/v1/customer/${encodeURIComponent(accountId)}/bookings/${encodeURIComponent(code)}/check-in`, { method: "POST", headers: email ? { "x-guest-email": email } : {} });
      if (!res.ok) { setFailed(true); return; }
      onCheckedIn();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="grid gap-1">
      <Button type="button" disabled={!enabled || busy} onClick={() => void checkIn()} data-testid="check-in-booking" className={enabled ? "border-transparent bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600/40" : undefined}>
        <LogIn aria-hidden /> {busy ? t("checkingIn") : t("checkIn")}<span className="sr-only"> {code}</span>
      </Button>
      {failed ? <span role="alert" className="text-xs text-destructive" data-testid="check-in-failed">{t("checkInFailed")}</span> : null}
    </span>
  );
}
