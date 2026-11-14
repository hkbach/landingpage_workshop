"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { recordConsent } from "@/lib/consent";
import { endSession } from "@/lib/logout";

/**
 * The Terms of Service or the Privacy Policy changed since the person agreed (D17): the area stays behind this window until they agree again, or log out. It cannot be closed by Escape
 * or by a click outside. The server keeps the proof (which version, when); the page reloads its data when it is saved.
 */
export function ConsentDialog() {
  const t = useTranslations("common.consent");
  const locale = useLocale();
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function accept() {
    setBusy(true);
    setFailed(false);
    if (await recordConsent(locale, true)) router.refresh();
    else setFailed(true);
    setBusy(false);
  }

  return (
    <Dialog open modal disablePointerDismissal onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} data-testid="consent-dialog">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2">
          <Checkbox id="consent-agree" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" data-testid="consent-checkbox" />
          <label htmlFor="consent-agree" className="text-sm">
            {t.rich("agree", {
              terms: (c) => <Link href="/terms" target="_blank" className="underline underline-offset-4">{c}</Link>,
              privacy: (c) => <Link href="/privacy" target="_blank" className="underline underline-offset-4">{c}</Link>,
            })}
          </label>
        </div>
        {failed ? <p role="alert" className="text-sm text-destructive">{t("failed")}</p> : null}
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" onClick={() => void endSession().then(() => window.location.replace("/login"))}>{t("logout")}</Button>
          <Button type="button" disabled={!agreed || busy} onClick={() => void accept()} data-testid="consent-accept">{t("accept")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
