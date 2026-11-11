"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { checkCustomDomain, LOCALES, type Locale } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COUNTRIES, CURRENCIES, TIMEZONES } from "@/components/dashboard/shell/options";
import type { AdminShop } from "@/lib/mock/admin-directory";
import { selectClass } from "./kit";

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "localtest.me";
interface Draft { name: string; contactEmail: string; contactPhone: string; whatsapp: string; address: string; mapsUrl: string; country: string; timezone: string; currency: string; defaultLocale: Locale; enabledLocales: Locale[]; customDomain: string }
const toDraft = (s: AdminShop): Draft => ({ name: s.name, contactEmail: s.contactEmail, contactPhone: s.contactPhone, whatsapp: s.whatsapp, address: s.address, mapsUrl: s.mapsUrl, country: s.country, timezone: s.timezone, currency: s.currency, defaultLocale: s.defaultLocale as Locale, enabledLocales: s.enabledLocales as Locale[], customDomain: s.customDomain });
const trimmed = (d: Draft): Draft => ({ ...d, name: d.name.trim(), contactEmail: d.contactEmail.trim(), contactPhone: d.contactPhone.trim(), whatsapp: d.whatsapp.trim(), address: d.address.trim(), mapsUrl: d.mapsUrl.trim(), customDomain: d.customDomain.trim() }); // BR-16
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** What is wrong with the form: the name of the field and a code the page has a text for. */
function problems(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.name) e.name = "required";
  if (!d.contactEmail) e.contactEmail = "required"; else if (!EMAIL.test(d.contactEmail)) e.contactEmail = "invalid";
  if (d.contactPhone.length < 5) e.contactPhone = "required";
  if (!d.address) e.address = "required";
  if (d.mapsUrl && !/^https:\/\/\S+$/.test(d.mapsUrl)) e.mapsUrl = "invalid";
  if (!d.enabledLocales.includes(d.defaultLocale)) e.enabledLocales = "defaultMustBeEnabled";
  const dom = checkCustomDomain(d.customDomain, PLATFORM_DOMAIN);
  if (!dom.ok) e.customDomain = dom.error === "PLATFORM" ? "platform" : "invalid";
  return e;
}

/**
 * An administrator edits a shop: name, contact, address, region (timezone and currency do not convert what exists), languages and the own domain of the shop. Never the slug. Save is on
 * only when something changed (BR-17); the texts are trimmed (BR-16); the change is recorded in the audit log as made by the administrator.
 */
export function ShopEditDialog({ shop, onClose, onSaved }: { shop: AdminShop | null; onClose: () => void; onSaved: (name: string) => void }) {
  return (
    <Dialog open={shop !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">{shop ? <Form key={shop.id} shop={shop} onClose={onClose} onSaved={onSaved} /> : null}</DialogContent>
    </Dialog>
  );
}

function Form({ shop, onClose, onSaved }: { shop: AdminShop; onClose: () => void; onSaved: (name: string) => void }) {
  const t = useTranslations("admin.shopEdit");
  const [draft, setDraft] = useState<Draft>(() => toDraft(shop));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const base = toDraft(shop);
  const dirty = JSON.stringify(trimmed(draft)) !== JSON.stringify(base);
  const risky = shop.bookings > 0 && (draft.timezone !== base.timezone || draft.currency !== base.currency);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft({ ...draft, [k]: v }); setErrors({ ...errors, [k]: "" }); setFailed(false); };
  const toggleLocale = (l: Locale, on: boolean) => set("enabledLocales", on ? [...new Set([...draft.enabledLocales, l])] : draft.enabledLocales.filter((x) => x !== l));

  async function save(e: FormEvent) {
    e.preventDefault();
    const clean = trimmed(draft);
    setDraft(clean);
    const found = problems(clean);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    const dom = checkCustomDomain(clean.customDomain, PLATFORM_DOMAIN);
    const res = await fetch(`/api/v1/admin/organizations/${encodeURIComponent(shop.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...clean, customDomain: dom.ok ? dom.domain : "" }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) { onSaved(clean.name); onClose(); return; }
    if (res?.status === 409) { setErrors({ customDomain: "taken" }); return; }
    if (res?.status === 422) {
      const j = (await res.json().catch(() => null)) as { error?: { details?: { fields?: Record<string, string> } } } | null;
      if (j?.error?.details?.fields) { setErrors(j.error.details.fields); return; }
    }
    setFailed(true);
  }

  const err = (k: string) => (errors[k] ? <p role="alert" className="text-xs text-destructive">{t(`errors.${errors[k]}`)}</p> : null);
  const field = (k: "name" | "contactEmail" | "contactPhone" | "whatsapp" | "address" | "mapsUrl", label: string, extra?: string) => (
    <div className={`grid gap-1.5 ${extra ?? ""}`}>
      <Label htmlFor={`se-${k}`}>{label}</Label>
      <Input id={`se-${k}`} value={draft[k]} aria-invalid={errors[k] ? true : undefined} onChange={(e) => set(k, e.target.value)} />
      {err(k)}
    </div>
  );

  return (
    <form onSubmit={save} noValidate className="grid gap-4" data-testid="shop-edit-form">
      <DialogHeader>
        <DialogTitle>{t("title", { name: shop.name })}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", t("name"), "sm:col-span-2")}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="se-slug">{t("slug")}</Label>
          <Input id="se-slug" value={shop.slug} disabled className="font-mono" />
          <p className="text-xs text-muted-foreground">{t("slugHint")}</p>
        </div>
        {field("contactEmail", t("contactEmail"))}
        {field("contactPhone", t("contactPhone"))}
        {field("whatsapp", t("whatsapp"))}
        {field("mapsUrl", t("mapsUrl"))}
        {field("address", t("address"), "sm:col-span-2")}
        <div className="grid gap-1.5">
          <Label htmlFor="se-country">{t("country")}</Label>
          <select id="se-country" className={selectClass} value={draft.country} onChange={(e) => set("country", e.target.value)}>
            {[...new Set([...COUNTRIES, draft.country])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="se-timezone">{t("timezone")}</Label>
          <select id="se-timezone" className={selectClass} value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {[...new Set([...TIMEZONES, draft.timezone])].map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="se-currency">{t("currency")}</Label>
          <select id="se-currency" className={selectClass} value={draft.currency} onChange={(e) => set("currency", e.target.value)}>
            {[...new Set([...CURRENCIES, draft.currency])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="se-default">{t("defaultLocale")}</Label>
          <select id="se-default" className={selectClass} value={draft.defaultLocale} onChange={(e) => { const l = e.target.value as Locale; setDraft({ ...draft, defaultLocale: l, enabledLocales: [...new Set([...draft.enabledLocales, l])] }); }}>
            {LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        {risky ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 sm:col-span-2">{t("regionalWarning")}</p> : null}
        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">{t("enabledLocales")}</legend>
          <div className="flex flex-wrap gap-4">
            {LOCALES.map((l) => (
              <div key={l} className="flex items-center gap-2">
                <Checkbox id={`se-loc-${l}`} checked={draft.enabledLocales.includes(l)} disabled={l === draft.defaultLocale} onCheckedChange={(v) => toggleLocale(l, v === true)} />
                <Label htmlFor={`se-loc-${l}`} className="font-normal">{l}</Label>
              </div>
            ))}
          </div>
          {err("enabledLocales")}
        </fieldset>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="se-domain">{t("customDomain")}</Label>
          <Input id="se-domain" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="www.your-studio.com" value={draft.customDomain} aria-invalid={errors.customDomain ? true : undefined} onChange={(e) => set("customDomain", e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("customDomainHint")}</p>
          {err("customDomain")}
        </div>
      </div>
      {failed ? <p role="alert" className="text-sm text-destructive">{t("failed")}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
        <Button type="submit" disabled={!dirty || busy} data-testid="shop-edit-save">{busy ? t("saving") : t("save")}</Button>
      </div>
    </form>
  );
}
