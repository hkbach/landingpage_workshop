"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney, minorDigits, parseMoney } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Notice } from "./kit";

interface Settings { withdrawalMin: number; withdrawalMax: number; resetLinkHours: number; contactPerHour: number; currency: string; defaults: Omit<Settings, "currency" | "defaults" | "bounds">; bounds: { resetLinkHours: { min: number; max: number }; contactPerHour: { min: number; max: number } } }
type ApiSettings = { resetLinkHours: number; contactPerHour: number };
type ApiLimit = { currency: string; minAmount: number; maxAmount: number };
const DEFAULT_CURRENCY = "VND"; // the currency the shops start with: the limits are kept for it
const fromApi = (b: ApiSettings, limits: ApiLimit[]): Settings => {
  const l = limits.find((x) => x.currency === DEFAULT_CURRENCY) ?? limits[0];
  return {
    withdrawalMin: l?.minAmount ?? 0, withdrawalMax: l?.maxAmount ?? 0, resetLinkHours: b.resetLinkHours, contactPerHour: b.contactPerHour, currency: l?.currency ?? DEFAULT_CURRENCY,
    defaults: { withdrawalMin: 0, withdrawalMax: 0, resetLinkHours: 24, contactPerHour: 5 }, bounds: { resetLinkHours: { min: 1, max: 168 }, contactPerHour: { min: 1, max: 100 } },
  } as Settings;
};
type Texts = { withdrawalMin: string; withdrawalMax: string; resetLinkHours: string; contactPerHour: string };
type Message = { text: string; tone: "ok" | "error" } | null;

const major = (minor: number, currency: string) => (minor === 0 ? "0" : (minor / 10 ** minorDigits(currency)).toFixed(minorDigits(currency)));
const toTexts = (s: Settings): Texts => ({ withdrawalMin: major(s.withdrawalMin, s.currency), withdrawalMax: major(s.withdrawalMax, s.currency), resetLinkHours: String(s.resetLinkHours), contactPerHour: String(s.contactPerHour) });

/**
 * The settings of the whole platform: the smallest and the largest amount a customer can withdraw at once (0 = no limit), how long the link of a password reset works (24 hours by default) and
 * how many messages one visitor can send with the Contact form in an hour (5 by default). Values are trimmed (BR-16); Save is on only when something changed (BR-17).
 */
export function SettingsAdmin() {
  const t = useTranslations("admin.settings");
  const [saved, setSaved] = useState<Settings | null>(null);
  const [x, setX] = useState<Texts>({ withdrawalMin: "", withdrawalMax: "", resetLinkHours: "", contactPerHour: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Texts, string>>>({});
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    // The sample data answers in one piece; the API keeps the withdrawal limits apart (one for each currency) and says nothing about the bounds, which are the ones it checks.
    fetch("/api/v1/admin/settings", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return Promise.reject(new Error("failed"));
        const body = (await r.json()) as Settings | ApiSettings;
        if ("currency" in body) return body;
        const limits = await fetch("/api/v1/admin/settings/withdrawal-limits", { cache: "no-store" }).then((x) => (x.ok ? (x.json() as Promise<{ items: ApiLimit[] }>) : { items: [] as ApiLimit[] }));
        return fromApi(body, limits.items);
      })
      .then((s) => { if (live) { setSaved(s); setX(toTexts(s)); } })
      .catch(() => { if (live) setMessage({ text: t("loadFailed"), tone: "error" }); });
    return () => { live = false; };
  }, [t]);

  const clean: Texts = { withdrawalMin: x.withdrawalMin.trim(), withdrawalMax: x.withdrawalMax.trim(), resetLinkHours: x.resetLinkHours.trim(), contactPerHour: x.contactPerHour.trim() };
  const dirty = saved !== null && JSON.stringify(clean) !== JSON.stringify(toTexts(saved));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!saved) return;
    const min = parseMoney(clean.withdrawalMin, saved.currency), max = parseMoney(clean.withdrawalMax, saved.currency);
    const hours = /^\d{1,4}$/.test(clean.resetLinkHours) ? Number(clean.resetLinkHours) : NaN;
    const per = /^\d{1,4}$/.test(clean.contactPerHour) ? Number(clean.contactPerHour) : NaN;
    const found: Partial<Record<keyof Texts, string>> = {};
    if (min === null || min < 0) found.withdrawalMin = "invalid";
    if (max === null || max < 0) found.withdrawalMax = "invalid";
    if (min !== null && max !== null && max > 0 && min > max) found.withdrawalMax = "order";
    if (!(hours >= saved.bounds.resetLinkHours.min && hours <= saved.bounds.resetLinkHours.max)) found.resetLinkHours = "range";
    if (!(per >= saved.bounds.contactPerHour.min && per <= saved.bounds.contactPerHour.max)) found.contactPerHour = "range";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    // The sample data takes everything in one request; the API takes the numbers of the platform and the withdrawal limits of the currency apart.
    let res: Response | null = await fetch("/api/v1/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ withdrawalMin: min, withdrawalMax: max, resetLinkHours: hours, contactPerHour: per }) }).catch(() => null);
    if (res?.ok && !("currency" in ((await res.clone().json().catch(() => ({}))) as object))) {
      // (the API answered with the platform numbers only: the limits go to their own route)
      res = await fetch("/api/v1/admin/settings/withdrawal-limits", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ currency: saved.currency, minAmount: min, maxAmount: max }) }).catch(() => null);
      if (res?.ok) { setSaved({ ...saved, withdrawalMin: min!, withdrawalMax: max!, resetLinkHours: hours, contactPerHour: per }); setX(toTexts({ ...saved, withdrawalMin: min!, withdrawalMax: max!, resetLinkHours: hours, contactPerHour: per })); setBusy(false); setMessage({ text: t("saved"), tone: "ok" }); return; }
    }
    setBusy(false);
    if (res?.ok) { const s = (await res.json()) as Settings; setSaved(s); setX(toTexts(s)); setMessage({ text: t("saved"), tone: "ok" }); return; }
    setMessage({ text: t("failed"), tone: "error" });
  }

  const row = (k: keyof Texts, label: string, hint: string, suffix: string) => (
    <div className="grid gap-1.5">
      <label htmlFor={`st-${k}`} className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <Input id={`st-${k}`} data-testid={`setting-${k}`} inputMode="decimal" autoComplete="off" disabled={saved === null} className="max-w-48" value={x[k]} aria-invalid={errors[k] ? true : undefined}
          onChange={(e) => { setX({ ...x, [k]: e.target.value }); setErrors({ ...errors, [k]: undefined }); setMessage(null); }} />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {errors[k] ? <p role="alert" className="text-xs text-destructive">{t(`errors.${errors[k]}`, { min: saved ? (k === "resetLinkHours" ? saved.bounds.resetLinkHours.min : saved.bounds.contactPerHour.min) : 0, max: saved ? (k === "resetLinkHours" ? saved.bounds.resetLinkHours.max : saved.bounds.contactPerHour.max) : 0 })}</p> : null}
    </div>
  );

  return (
    <form onSubmit={save} noValidate className="grid gap-4" data-testid="settings-form">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Notice message={message} />
      <Card>
        <CardHeader><CardTitle>{t("withdrawalTitle")}</CardTitle><CardDescription>{t("withdrawalDesc")}</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {row("withdrawalMin", t("withdrawalMin"), t("zeroNone"), saved?.currency ?? "")}
          {row("withdrawalMax", t("withdrawalMax"), t("zeroNone"), saved?.currency ?? "")}
          {saved && (saved.withdrawalMin > 0 || saved.withdrawalMax > 0) ? <p className="text-xs text-muted-foreground sm:col-span-2">{t("current", { min: formatMoney(saved.withdrawalMin, saved.currency), max: saved.withdrawalMax > 0 ? formatMoney(saved.withdrawalMax, saved.currency) : t("noLimit") })}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("resetTitle")}</CardTitle><CardDescription>{t("resetDesc")}</CardDescription></CardHeader>
        <CardContent>{row("resetLinkHours", t("resetLinkHours"), t("resetHint"), t("hours"))}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("contactTitle")}</CardTitle><CardDescription>{t("contactDesc")}</CardDescription></CardHeader>
        <CardContent>{row("contactPerHour", t("contactPerHour"), t("contactHint"), t("perHour"))}</CardContent>
      </Card>
      <div><Button type="submit" disabled={!dirty || busy} data-testid="settings-save">{busy ? t("saving") : t("save")}</Button></div>
    </form>
  );
}
