"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FAVORITE_CATEGORY_COUNT, WORKSHOP_CATEGORIES, checkPassword, toggleCategory, type WorkshopCategory } from "@workshop/shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { COUNTRY_CODES, countryName } from "@/components/booking/countries";
import { captureInvite, clearInviteCode, readInviteCode } from "@/lib/affiliate";
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
 * to log in first (email + password); once logged in, that workshop is saved. The builder preview uses it too (slug "preview"), in the browser of the owner.
 */
export function FavoritesProvider({ slug, shopName, theme, children, off = false, server }: {
  slug: string; shopName: string; theme: PageTheme; children: ReactNode;
  /** No hearts at all (the landing page when connected to the API: favorites are kept in the customer area, with the account). */
  off?: boolean;
  /** Connected: the favorites are the server's (the customer is logged in already), and a click saves or removes on the server. */
  server?: { ids: string[]; toggle: (workshopId: string) => void };
}) {
  const email = useSyncExternalStore(subscribeFavorites, () => readGuestEmail(slug), () => "");
  const raw = useSyncExternalStore(subscribeFavorites, () => readFavoritesRaw(slug, email), () => "");
  const ids = useMemo(() => parseFavorites(raw), [raw]);
  const [pending, setPending] = useState<string | null>(null); // the workshop to save once the guest has logged in
  const [open, setOpen] = useState(false);
  /** The guest came through the invite link of a friend: the popup opens on the registration. */
  const [registerFirst, setRegisterFirst] = useState(false);

  // `?invite=CODE`: the code is kept (the registration sends it) and a guest who is not logged in is shown the registration at once. The code is taken off the address.
  useEffect(() => {
    if (slug === "preview" || off || server) return;
    const code = captureInvite(slug, window.location.search);
    if (!new URLSearchParams(window.location.search).has("invite")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("invite");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (code && !readGuestEmail(slug)) queueMicrotask(() => { setRegisterFirst(true); setOpen(true); }); // after the effect, so the popup opens on a render of its own
    // Only on arrival: the address was read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const value = useMemo(
    () => (off ? { enabled: false, isFavorite: () => false, toggle: () => {} } : server ? { enabled: true, isFavorite: (id: string) => server.ids.includes(id), toggle: server.toggle } : { enabled: true, isFavorite: (id: string) => ids.includes(id), toggle }),
    [ids, toggle, off, server],
  );
  if (off || server) return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
  return (
    <FavoritesContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPending(null); }}>
        <DialogContent style={modalThemeStyle(theme)} className={cn("max-h-[92dvh] gap-4 overflow-y-auto p-5 sm:max-w-md", siteFontClass(theme.font))}>
          <LoginHeader shopName={shopName} />
          {/* Mounted only while open, so the form starts empty every time. */}
          {open ? <GuestLoginForm slug={slug} shopName={shopName} initialStep={registerFirst ? "profile" : "login"} onLoggedIn={onLoggedIn} onCancel={() => { setOpen(false); setPending(null); setRegisterFirst(false); }} /> : null}
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
 * The steps of the login: email + password and, for a guest who has no account yet, the account to create (name, password, country, date of birth, favorite
 * fields). Creating it merges into it the bookings that were made before with the same email, and the last step says how many. The builder preview (slug
 * "preview") has no server to ask, so it only logs in with the email.
 */
export function GuestLoginForm({ slug, shopName, initialStep = "login", onLoggedIn, onCancel }: { slug: string; shopName: string; initialStep?: "login" | "profile"; onLoggedIn: (email: string) => void; onCancel: () => void }) {
  const t = useTranslations("site.favorites");
  const tc = useTranslations("site.categories");
  const locale = useLocale();
  const [step, setStep] = useState<"login" | "profile" | "done">(initialStep);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  /** The message key of what went wrong with the login (a wrong email or password, a deactivated account, ...). */
  const [loginError, setLoginError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [consent, setConsent] = useState(false);
  /** The three fields of workshops the guest likes. */
  const [categories, setCategories] = useState<WorkshopCategory[]>([]);
  const [errors, setErrors] = useState<{ email?: boolean; fullName?: boolean; country?: boolean; birthDate?: boolean; categories?: boolean; consent?: boolean; password?: boolean; confirm?: boolean }>({});
  const [failed, setFailed] = useState(false);
  const [merged, setMerged] = useState(0);
  const clean = normalizeGuestEmail(email);
  const base = `/api/v1/public/sites/${encodeURIComponent(slug)}/accounts`;
  const today = new Date().toISOString().slice(0, 10);

  async function logIn() {
    setLoginError(null);
    if (!EMAIL_RE.test(clean)) { setEmailError(true); return; }
    if (slug === "preview") { onLoggedIn(clean); return; }
    if (!password) { setLoginError("passwordRequired"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: clean, password }) });
      if (res.ok) {
        const me = (await res.json()) as { type: string };
        if (me.type === "CUSTOMER") onLoggedIn(clean);
        else setLoginError("loginInvalid"); // the account of a shop owner is not a customer account
        return;
      }
      const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
      setLoginError(code === "DEACTIVATED" ? "loginDeactivated" : code === "TOO_MANY_ATTEMPTS" ? "loginTooMany" : code === "INVALID_CREDENTIALS" ? "loginInvalid" : "loginFailed");
    } catch {
      setLoginError("loginFailed");
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    const next = {
      email: !EMAIL_RE.test(clean), fullName: !fullName.trim(), country: !COUNTRY_CODES.includes(country), birthDate: !birthDate || birthDate > today || birthDate < "1900-01-01",
      categories: categories.length !== FAVORITE_CATEGORY_COUNT, consent: !consent, password: checkPassword(password) !== "OK", confirm: confirm !== password,
    };
    setErrors(next);
    setFailed(false);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: clean, password, fullName: fullName.trim(), country, birthDate, categories, locale, consent: true, ...(readInviteCode(slug) ? { inviteCode: readInviteCode(slug) } : {}) }),
      });
      if (res.status === 409) { setStep("login"); setLoginError("alreadyRegistered"); return; } // the email has an account after all: log in with its password
      if (!res.ok) { setFailed(true); return; }
      clearInviteCode(slug); // the invitation is used
      setMerged(((await res.json()) as { merged: number }).merged);
      setStep("done");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const field = (id: string, label: string, error: boolean | undefined, control: ReactNode, message?: string) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label} <span aria-hidden>*</span></label>
      {control}
      {error ? <p role="alert" className="text-sm text-red-700">{message ?? t(id === "fav-birth" ? "birthDateInvalid" : "fieldRequired")}</p> : null}
    </div>
  );

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void (step === "login" ? logIn() : step === "profile" ? register() : onLoggedIn(clean)); }}
      noValidate className="space-y-4" data-testid="favorites-login"
    >
      {step === "login" ? (
        <div className="space-y-3" data-testid="favorites-login-step">
          {loginError ? <p role="alert" className="text-sm text-red-700" data-testid="favorites-login-error">{t(loginError)}</p> : null}
          <div className="space-y-1.5">
            <label htmlFor="fav-email" className="text-sm font-medium">{t("emailLabel")} <span aria-hidden>*</span></label>
            <Input
              id="fav-email" type="text" inputMode="email" autoComplete="email" className="h-11 text-base" value={email} aria-required aria-invalid={emailError}
              aria-describedby={emailError ? "fav-email-error" : undefined} onChange={(e) => { setEmail(e.target.value); setEmailError(false); }}
            />
            {emailError ? <p id="fav-email-error" role="alert" className="text-sm text-red-700">{t("emailInvalid")}</p> : null}
          </div>
          {slug === "preview" ? null : (
            <div className="space-y-1.5">
              <label htmlFor="fav-password" className="text-sm font-medium">{t("passwordLabel")} <span aria-hidden>*</span></label>
              <Input id="fav-password" type="password" autoComplete="current-password" className="h-11 text-base" value={password} aria-required onChange={(e) => { setPassword(e.target.value); setLoginError(null); }} />
            </div>
          )}
          {slug === "preview" ? null : (
            <button type="button" className="text-sm underline underline-offset-4" data-testid="favorites-to-register" onClick={() => { setLoginError(null); setPassword(""); setStep("profile"); }}>{t("noAccountYet")}</button>
          )}
        </div>
      ) : step === "profile" ? (
        <div className="space-y-3" data-testid="favorites-register-step">
          <h3 className="text-base font-semibold">{t("registerTitle")}</h3>
          <p className="text-sm">{t("registerIntro")}</p>
          {field("fav-reg-email", t("emailLabel"), Boolean(errors.email), <Input id="fav-reg-email" type="text" inputMode="email" autoComplete="email" className="h-11 text-base" value={email} aria-required aria-invalid={Boolean(errors.email)} onChange={(e) => setEmail(e.target.value)} />, t("emailInvalid"))}
          {field("fav-reg-password", t("passwordLabel"), errors.password, <Input id="fav-reg-password" type="password" autoComplete="new-password" className="h-11 text-base" value={password} aria-required aria-invalid={errors.password} onChange={(e) => setPassword(e.target.value)} />, t("passwordInvalid"))}
          {field("fav-reg-confirm", t("confirmPasswordLabel"), errors.confirm, <Input id="fav-reg-confirm" type="password" autoComplete="new-password" className="h-11 text-base" value={confirm} aria-required aria-invalid={errors.confirm} onChange={(e) => setConfirm(e.target.value)} />, t("passwordMismatch"))}
          {field("fav-name", t("fullNameLabel"), errors.fullName, <Input id="fav-name" autoComplete="name" className="h-11 text-base" value={fullName} aria-required aria-invalid={errors.fullName} onChange={(e) => setFullName(e.target.value)} />)}
          {field("fav-country", t("countryLabel"), errors.country, (
            <select id="fav-country" className={selectClass} value={country} aria-required aria-invalid={errors.country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">{t("countryPlaceholder")}</option>
              {COUNTRY_CODES.map((c) => ({ c, n: countryName(c, locale) })).sort((a, b) => a.n.localeCompare(b.n, locale)).map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
            </select>
          ))}
          {field("fav-birth", t("birthDateLabel"), errors.birthDate, <Input id="fav-birth" type="date" min="1900-01-01" max={today} className="h-11 text-base" value={birthDate} aria-required aria-invalid={errors.birthDate} onChange={(e) => setBirthDate(e.target.value)} />)}
          <fieldset className="space-y-2" data-testid="favorites-categories" aria-describedby="fav-categories-hint">
            <legend className="text-sm font-medium">{t("categoriesTitle")} <span aria-hidden>*</span></legend>
            <p id="fav-categories-hint" className="text-xs text-[var(--site-muted)]">{t("categoriesHint")}</p>
            <div className="flex flex-wrap gap-2">
              {WORKSHOP_CATEGORIES.map((c) => {
                const on = categories.includes(c);
                // A fourth one is not taken: one has to be taken out first.
                const full = !on && categories.length >= FAVORITE_CATEGORY_COUNT;
                return (
                  <label
                    key={c}
                    className={cn("relative inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 py-1 text-sm has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--site-primary)]/40",
                      on ? "border-[var(--site-primary)] bg-[var(--site-primary)] text-[var(--site-primary-fg)]" : "border-black/20 bg-white", full && "cursor-not-allowed opacity-50")}
                  >
                    <input type="checkbox" className="sr-only" name="fav-category" value={c} checked={on} disabled={full} onChange={() => { setCategories((p) => toggleCategory(p, c)); setErrors((x) => ({ ...x, categories: false })); }} />
                    {tc(c)}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-[var(--site-muted)]" aria-live="polite">{t("categoriesCount", { count: categories.length, max: FAVORITE_CATEGORY_COUNT })}</p>
            {errors.categories ? <p role="alert" className="text-sm text-red-700">{t("categoriesInvalid")}</p> : null}
          </fieldset>
          <div className="space-y-1">
            <label htmlFor="fav-consent" className="flex cursor-pointer items-start gap-2 text-sm">
              <input id="fav-consent" type="checkbox" className="mt-0.5 size-4 shrink-0" checked={consent} aria-required aria-invalid={errors.consent} onChange={(e) => { setConsent(e.target.checked); setErrors((x) => ({ ...x, consent: false })); }} />
              <span>{t("consentLabel", { shop: shopName })}</span>
            </label>
            {errors.consent ? <p role="alert" className="text-sm text-red-700">{t("consentRequired")}</p> : null}
          </div>
          {failed ? <p role="alert" className="text-sm text-red-700">{t("registerFailed")}</p> : null}
          <button type="button" className="text-sm underline underline-offset-4" onClick={() => { setStep("login"); setErrors({}); setFailed(false); }}>{t("haveAccount")}</button>
        </div>
      ) : (
        <div className="space-y-2" data-testid="favorites-registered-step">
          <h3 className="text-base font-semibold">{t("accountCreated")}</h3>
          <p role="status" data-testid="favorites-merged" className="text-sm">{t("accountMerged", { merged })}</p>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {step === "done" ? null : <button type="button" className={secondaryBtn} onClick={onCancel}>{t("cancel")}</button>}
        {step === "login" ? (
          <button type="submit" className={primaryBtn} disabled={busy || !clean}>{busy ? t("sending") : t("login")}</button>
        ) : step === "profile" ? (
          <button type="submit" className={primaryBtn} disabled={busy}>{busy ? t("creating") : t("createAccount")}</button>
        ) : (
          <button type="submit" className={primaryBtn}>{t("proceed")}</button>
        )}
      </div>
    </form>
  );
}
