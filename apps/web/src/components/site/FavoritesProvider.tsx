"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { COUNTRY_CODES, countryName } from "@/components/booking/countries";
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
          {open ? <LoginForm slug={slug} shopName={shopName} onLoggedIn={onLoggedIn} onCancel={() => { setOpen(false); setPending(null); }} /> : null}
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

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-white px-2.5 text-base text-[var(--site-text)] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The steps of the login: the email, the code that was sent to it and, for an email that has no account yet, the account to create (name, country, date of
 * birth). Creating it merges into it the bookings that were made before with the same email, and the last step says how many. The builder preview (slug
 * "preview") has no server to ask, so it only logs in.
 */
function LoginForm({ slug, shopName, onLoggedIn, onCancel }: { slug: string; shopName: string; onLoggedIn: (email: string) => void; onCancel: () => void }) {
  const t = useTranslations("site.favorites");
  const locale = useLocale();
  const [step, setStep] = useState<"email" | "code" | "profile" | "done">("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: boolean; country?: boolean; birthDate?: boolean; consent?: boolean }>({});
  const [failed, setFailed] = useState(false);
  const [merged, setMerged] = useState(0);
  const locked = attempts >= OTP_MAX_ATTEMPTS;
  const clean = normalizeGuestEmail(email);
  const base = `/api/v1/public/sites/${encodeURIComponent(slug)}/accounts`;
  const today = new Date().toISOString().slice(0, 10);

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
      if (!(await verifyOtp(clean, code))) { setAttempts((a) => a + 1); setWrong(true); setCode(""); return; }
      if (slug === "preview") { onLoggedIn(clean); return; }
      // The email is proved. Has it an account? If not, the guest creates one (and the bookings made with this email join it).
      let registered = true;
      try {
        const res = await fetch(`${base}/lookup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: clean }) });
        if (res.ok) registered = ((await res.json()) as { registered: boolean }).registered;
      } catch {
        /* the server cannot be asked: the guest is simply logged in */
      }
      if (registered) onLoggedIn(clean);
      else setStep("profile");
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    const next = { fullName: !fullName.trim(), country: !COUNTRY_CODES.includes(country), birthDate: !birthDate || birthDate > today || birthDate < "1900-01-01", consent: !consent };
    setErrors(next);
    setFailed(false);
    if (next.fullName || next.country || next.birthDate || next.consent) return;
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: clean, fullName: fullName.trim(), country, birthDate, locale, consent: true }),
      });
      if (res.status === 409) { onLoggedIn(clean); return; } // the email has an account after all
      if (!res.ok) { setFailed(true); return; }
      setMerged(((await res.json()) as { merged: number }).merged);
      setStep("done");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const field = (id: string, label: string, error: boolean | undefined, control: ReactNode) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label} <span aria-hidden>*</span></label>
      {control}
      {error ? <p role="alert" className="text-sm text-red-700">{t(id === "fav-birth" ? "birthDateInvalid" : "fieldRequired")}</p> : null}
    </div>
  );

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void (step === "email" ? send() : step === "code" ? verify() : step === "profile" ? register() : onLoggedIn(clean)); }}
      noValidate className="space-y-4" data-testid="favorites-login"
    >
      {step === "email" ? (
        <div className="space-y-1.5">
          <label htmlFor="fav-email" className="text-sm font-medium">{t("emailLabel")} <span aria-hidden>*</span></label>
          <Input
            id="fav-email" type="text" inputMode="email" autoComplete="email" className="h-11 text-base" value={email} aria-required aria-invalid={emailError}
            aria-describedby={emailError ? "fav-email-error" : undefined} onChange={(e) => { setEmail(e.target.value); setEmailError(false); }}
          />
          {emailError ? <p id="fav-email-error" role="alert" className="text-sm text-red-700">{t("emailInvalid")}</p> : null}
        </div>
      ) : step === "code" ? (
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
      ) : step === "profile" ? (
        <div className="space-y-3" data-testid="favorites-register-step">
          <h3 className="text-base font-semibold">{t("registerTitle")}</h3>
          <p className="text-sm">{t("registerIntro", { email: clean })}</p>
          {field("fav-name", t("fullNameLabel"), errors.fullName, <Input id="fav-name" autoComplete="name" className="h-11 text-base" value={fullName} aria-required aria-invalid={errors.fullName} onChange={(e) => setFullName(e.target.value)} />)}
          {field("fav-country", t("countryLabel"), errors.country, (
            <select id="fav-country" className={selectClass} value={country} aria-required aria-invalid={errors.country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">{t("countryPlaceholder")}</option>
              {COUNTRY_CODES.map((c) => ({ c, n: countryName(c, locale) })).sort((a, b) => a.n.localeCompare(b.n, locale)).map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
            </select>
          ))}
          {field("fav-birth", t("birthDateLabel"), errors.birthDate, <Input id="fav-birth" type="date" min="1900-01-01" max={today} className="h-11 text-base" value={birthDate} aria-required aria-invalid={errors.birthDate} onChange={(e) => setBirthDate(e.target.value)} />)}
          <div className="space-y-1">
            <label htmlFor="fav-consent" className="flex cursor-pointer items-start gap-2 text-sm">
              <input id="fav-consent" type="checkbox" className="mt-0.5 size-4 shrink-0" checked={consent} aria-required aria-invalid={errors.consent} onChange={(e) => { setConsent(e.target.checked); setErrors((x) => ({ ...x, consent: false })); }} />
              <span>{t("consentLabel", { shop: shopName })}</span>
            </label>
            {errors.consent ? <p role="alert" className="text-sm text-red-700">{t("consentRequired")}</p> : null}
          </div>
          {failed ? <p role="alert" className="text-sm text-red-700">{t("registerFailed")}</p> : null}
        </div>
      ) : (
        <div className="space-y-2" data-testid="favorites-registered-step">
          <h3 className="text-base font-semibold">{t("accountCreated")}</h3>
          <p role="status" data-testid="favorites-merged" className="text-sm">{t("accountMerged", { merged })}</p>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {step === "done" ? null : <button type="button" className={secondaryBtn} onClick={onCancel}>{t("cancel")}</button>}
        {step === "email" ? (
          <button type="submit" className={primaryBtn} disabled={busy || !clean}>{busy ? t("sending") : t("sendCode")}</button>
        ) : step === "code" ? (
          <button type="submit" className={primaryBtn} disabled={busy || locked || !isOtpComplete(code)}>{t("login")}</button>
        ) : step === "profile" ? (
          <button type="submit" className={primaryBtn} disabled={busy}>{busy ? t("creating") : t("createAccount")}</button>
        ) : (
          <button type="submit" className={primaryBtn}>{t("proceed")}</button>
        )}
      </div>
    </form>
  );
}
