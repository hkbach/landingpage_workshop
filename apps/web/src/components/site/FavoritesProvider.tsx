"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cleanOtp, DEMO_OTP, isOtpComplete, OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_RESEND_SECONDS, sendOtp, verifyOtp } from "@/components/booking/otp";
import { FavoritesContext } from "@/components/sections/favorites-context";
import { siteFontClass } from "@/components/sections/site-fonts";
import { modalThemeStyle } from "@/components/sections/theme";
import {
  normalizeGuestEmail, parseFavorites, readFavoritesRaw, readGuestEmail, subscribeFavorites, toggleFavorite, writeFavorites, writeGuestEmail,
} from "@/lib/favorites";
import type { PageTheme } from "@/lib/types";
import { cn } from "@/lib/utils";

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--site-primary)] px-5 py-2 text-sm font-semibold text-[var(--site-primary-fg)] outline-none transition hover:opacity-90 focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]/40 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-black/20 bg-white px-5 py-2 text-sm font-medium text-[var(--site-text)] outline-none transition hover:bg-black/5 focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]/40";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Owns the favorites of the guest on the landing page and the login popup. A guest who is not logged in who clicks the heart of a workshop is asked
 * to log in first (email + code); once logged in, that workshop is saved. The builder preview uses it too (slug "preview"), in the browser of the owner.
 */
export function FavoritesProvider({ slug, shopName, theme, children }: { slug: string; shopName: string; theme: PageTheme; children: ReactNode }) {
  const email = useSyncExternalStore(subscribeFavorites, () => readGuestEmail(slug), () => "");
  const raw = useSyncExternalStore(subscribeFavorites, () => readFavoritesRaw(slug, email), () => "");
  const ids = useMemo(() => parseFavorites(raw), [raw]);
  const [pending, setPending] = useState<string | null>(null); // the workshop to save once the guest has logged in
  const [open, setOpen] = useState(false);

  const toggle = useCallback((workshopId: string) => {
    if (!email) { setPending(workshopId); setOpen(true); return; }
    writeFavorites(slug, email, toggleFavorite(ids, workshopId));
  }, [email, ids, slug]);

  const onLoggedIn = (loggedIn: string) => {
    writeGuestEmail(slug, loggedIn);
    if (pending) writeFavorites(slug, loggedIn, [...new Set([...parseFavorites(readFavoritesRaw(slug, normalizeGuestEmail(loggedIn))), pending])]);
    setPending(null);
    setOpen(false);
  };

  const value = useMemo(() => ({ enabled: true, isFavorite: (id: string) => ids.includes(id), toggle }), [ids, toggle]);
  return (
    <FavoritesContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPending(null); }}>
        <DialogContent style={modalThemeStyle(theme)} className={cn("max-h-[92dvh] gap-4 overflow-y-auto p-5 sm:max-w-md", siteFontClass(theme.font))}>
          <LoginHeader shopName={shopName} />
          {/* Mounted only while open, so the form starts empty every time. */}
          {open ? <LoginForm onLoggedIn={onLoggedIn} onCancel={() => { setOpen(false); setPending(null); }} /> : null}
        </DialogContent>
      </Dialog>
    </FavoritesContext.Provider>
  );
}

function LoginHeader({ shopName }: { shopName: string }) {
  const t = useTranslations("site.favorites");
  return (
    <DialogHeader>
      <DialogTitle className="text-lg font-semibold">{t("loginTitle")}</DialogTitle>
      <DialogDescription className="text-[var(--site-muted)]">{t("loginIntro", { shop: shopName })}</DialogDescription>
    </DialogHeader>
  );
}

/** Two steps: the email, then the code that was sent to it. */
function LoginForm({ onLoggedIn, onCancel }: { onLoggedIn: (email: string) => void; onCancel: () => void }) {
  const t = useTranslations("site.favorites");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const locked = attempts >= OTP_MAX_ATTEMPTS;
  const clean = normalizeGuestEmail(email);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    if (!EMAIL_RE.test(clean)) { setEmailError(true); return; }
    setBusy(true);
    try {
      await sendOtp(clean);
      setCode(""); setWrong(false); setAttempts(0); setCooldown(OTP_RESEND_SECONDS); setStep("code");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!isOtpComplete(code) || locked) return;
    setBusy(true);
    try {
      if (await verifyOtp(clean, code)) { onLoggedIn(clean); return; }
      setAttempts((a) => a + 1); setWrong(true); setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void (step === "email" ? send() : verify()); }} noValidate className="space-y-4" data-testid="favorites-login">
      {step === "email" ? (
        <div className="space-y-1.5">
          <label htmlFor="fav-email" className="text-sm font-medium">{t("emailLabel")} <span aria-hidden>*</span></label>
          <Input
            id="fav-email" type="text" inputMode="email" autoComplete="email" className="h-11 text-base" value={email} aria-required aria-invalid={emailError}
            aria-describedby={emailError ? "fav-email-error" : undefined} onChange={(e) => { setEmail(e.target.value); setEmailError(false); }}
          />
          {emailError ? <p id="fav-email-error" role="alert" className="text-sm text-red-700">{t("emailInvalid")}</p> : null}
        </div>
      ) : (
        <div className="space-y-1.5" data-testid="favorites-code-step">
          <p className="text-sm">{t("codeIntro", { email: clean })}</p>
          <label htmlFor="fav-code" className="text-sm font-medium">{t("codeLabel")} <span aria-hidden>*</span></label>
          <Input
            id="fav-code" inputMode="numeric" autoComplete="one-time-code" maxLength={OTP_LENGTH + 4} className="h-11 text-base tracking-[0.4em]"
            value={code} disabled={locked || busy} aria-required aria-invalid={wrong} onChange={(e) => { setCode(cleanOtp(e.target.value)); setWrong(false); }}
          />
          {process.env.NODE_ENV !== "production" ? <p className="text-xs text-[var(--site-muted)]" data-testid="favorites-demo">{t("codeDemo", { code: DEMO_OTP })}</p> : null}
          {wrong && !locked ? <p role="alert" className="text-sm text-red-700">{t("codeWrong", { left: OTP_MAX_ATTEMPTS - attempts })}</p> : null}
          {locked ? <p role="alert" className="text-sm text-red-700">{t("codeLocked")}</p> : null}
          <button type="button" className="text-sm underline underline-offset-4 disabled:no-underline disabled:opacity-60" disabled={cooldown > 0 || busy} onClick={() => void send()}>
            {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
          </button>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={secondaryBtn} onClick={onCancel}>{t("cancel")}</button>
        {step === "email" ? (
          <button type="submit" className={primaryBtn} disabled={busy || !clean}>{busy ? t("sending") : t("sendCode")}</button>
        ) : (
          <button type="submit" className={primaryBtn} disabled={busy || locked || !isOtpComplete(code)}>{t("login")}</button>
        )}
      </div>
    </form>
  );
}
