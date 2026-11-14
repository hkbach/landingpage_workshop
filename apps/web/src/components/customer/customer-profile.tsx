"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FAVORITE_CATEGORY_COUNT, GENDERS, LOCALES, SOCIAL_PLATFORMS, WORKSHOP_CATEGORIES, toggleCategory, type Gender, type Locale, type SocialPlatform } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { CustomerAvatar } from "@/components/ops/customer-avatar";
import { AvatarUpload } from "./avatar-upload";
import { Field } from "@/components/dashboard/shell/field";
import { NativeSelect } from "@/components/dashboard/shell/native-select";
import { COUNTRY_CODES, countryName } from "@/components/booking/countries";
import { LOCALE_NAMES } from "@/components/site/locale-names";
import { CustomerApiError, saveCustomerProfile } from "@/lib/customer-api";
import { NAME_MAX, PHONE_MAX, SOCIAL_MAX, toDraft, toInput, trimDraft, validateDraft, type ProfileDraft } from "@/lib/customer-profile-form";
import { useDirty } from "@/lib/use-dirty";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { useCustomer } from "./customer-shell";

/** Brand names: written the same in every language. */
const SOCIAL_NAMES: Record<SocialPlatform, string> = {
  ZALO: "Zalo", WHATSAPP: "WhatsApp", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", TIKTOK: "TikTok", LINE: "LINE", KAKAOTALK: "KakaoTalk", WECHAT: "WeChat", TELEGRAM: "Telegram", X: "X",
};

/**
 * My Profile: what the shop knows about the guest, which the guest can change (everything but the email). Save is only on when something changed (BR-17),
 * every text is trimmed (BR-16) and the profile is replaced as a whole: what is emptied is removed.
 */
export function CustomerProfileView() {
  const t = useTranslations("customer.profile");
  const tc = useTranslations("site.categories");
  const tShell = useTranslations("customer.shell");
  const locale = useLocale();
  const { accountId, email, shop, profile, setProfile, logout } = useCustomer();
  const [draft, setDraft] = useState<ProfileDraft>(() => toDraft(profile));
  const [savedCount, setSavedCount] = useState(0); // the form is "clean" again after each save
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"saved" | "failed" | null>(null);
  const dirty = useDirty(draft, savedCount);
  const today = new Date().toLocaleDateString("en-CA"); // (the day of the person, YYYY-MM-DD: the UTC day is yesterday before 07:00 in Vietnam)

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setMessage(null);
    setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));
  };
  const setSocial = (platform: SocialPlatform, value: string) => {
    setDraft((d) => ({ ...d, socials: { ...d.socials, [platform]: value } }));
    setMessage(null);
    setErrors((e) => (e.socials ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== "socials")) : e));
  };
  const err = (field: string) => (errors[field] ? t(`errors.${errors[field]}` as never) : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || !dirty) return;
    const found = validateDraft(draft, today);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveCustomerProfile(accountId, email, toInput(draft));
      setProfile(saved);
      setDraft(trimDraft(toDraft(saved))); // the form shows what was saved
      setSavedCount((n) => n + 1);
      setMessage("saved");
    } catch (error) {
      if (error instanceof CustomerApiError && error.status === 422) setErrors(error.fields);
      else setMessage("failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4" data-testid="customer-profile-form">
      <div className="flex items-center gap-3">
        <CustomerAvatar name={profile.fullName} url={profile.account.avatarUrl} className="size-14 text-base" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("intro", { shop: shop.name })}</p>
        </div>
      </div>
      {!profile.account.birthDate ? <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="profile-incomplete">{t("completeBanner")}</p> : null}
      <Card>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
          <Field htmlFor="cp-email" label={t("email")} hint={t("emailHint")}>
            <Input id="cp-email" type="text" value={profile.email} readOnly aria-describedby="cp-email-hint" className="bg-muted/50" />
          </Field>
          <Field htmlFor="cp-name" label={<>{t("fullName")} <span aria-hidden>*</span></>} error={err("fullName")}>
            <Input id="cp-name" value={draft.fullName} maxLength={NAME_MAX + 20} aria-required aria-invalid={Boolean(errors.fullName)} autoComplete="name" onChange={(e) => set("fullName", e.target.value)} />
          </Field>
          <Field htmlFor="cp-phone" label={t("phone")} error={err("phone")}>
            <Input id="cp-phone" type="text" inputMode="tel" value={draft.phone} maxLength={PHONE_MAX + 10} aria-invalid={Boolean(errors.phone)} autoComplete="tel" onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field htmlFor="cp-language" label={t("language")}>
            <NativeSelect id="cp-language" value={draft.preferredLocale} onChange={(e) => set("preferredLocale", e.target.value as Locale)}>
              {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
            </NativeSelect>
          </Field>
          <Field htmlFor="cp-country" label={<>{t("country")} <span aria-hidden>*</span></>} error={err("country")}>
            <NativeSelect id="cp-country" value={draft.country} aria-required aria-invalid={Boolean(errors.country)} onChange={(e) => set("country", e.target.value)}>
              <option value="">{t("countryPlaceholder")}</option>
              {COUNTRY_CODES.map((c) => <option key={c} value={c}>{countryName(c, locale)}</option>)}
            </NativeSelect>
          </Field>
          <Field htmlFor="cp-birth" label={<>{t("birthDate")} <span aria-hidden>*</span></>} error={err("birthDate")}>
            <DateInput id="cp-birth" value={draft.birthDate} onChange={(d) => set("birthDate", d)} min="1900-01-01" max={today} lenient aria-required aria-invalid={Boolean(errors.birthDate)} />
          </Field>
          <Field htmlFor="cp-gender" label={t("gender")}>
            <NativeSelect id="cp-gender" value={draft.gender} onChange={(e) => set("gender", e.target.value as Gender | "")}>
              <option value="">{t("genderNone")}</option>
              {GENDERS.map((g) => <option key={g} value={g}>{t(`genders.${g}`)}</option>)}
            </NativeSelect>
          </Field>
          <Field htmlFor="cp-avatar" label={t("avatar")} error={err("avatarUrl")}>
            <AvatarUpload id="cp-avatar" name={draft.fullName} value={draft.avatarUrl} onChange={(url) => set("avatarUrl", url)} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle id="cp-categories-title">{t("categories")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("categoriesHint")}</p>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div role="group" aria-labelledby="cp-categories-title" className="flex flex-wrap gap-2" data-testid="customer-profile-categories">
            {WORKSHOP_CATEGORIES.map((c) => {
              const on = draft.favoriteCategories.includes(c);
              // A fourth one is not taken: one has to be taken out first.
              const full = !on && draft.favoriteCategories.length >= FAVORITE_CATEGORY_COUNT;
              return (
                <label key={c} className={cn("relative inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 py-1 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50", on ? "border-primary bg-primary text-primary-foreground" : "bg-background", full && "cursor-not-allowed opacity-50")}>
                  <input type="checkbox" className="sr-only" value={c} checked={on} disabled={full} onChange={() => set("favoriteCategories", toggleCategory(draft.favoriteCategories, c))} />
                  {tc(c)}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">{t("categoriesCount", { count: draft.favoriteCategories.length, max: FAVORITE_CATEGORY_COUNT })}</p>
          {errors.categories ? <p role="alert" className="text-xs text-destructive">{err("categories")}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("socials")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("socialsHint")}</p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SOCIAL_PLATFORMS.map((p) => (
            <Field key={p} htmlFor={`cp-social-${p}`} label={SOCIAL_NAMES[p]}>
              <Input id={`cp-social-${p}`} type="text" value={draft.socials[p]} maxLength={SOCIAL_MAX + 20} autoComplete="off" onChange={(e) => setSocial(p, e.target.value)} />
            </Field>
          ))}
          {errors.socials ? <p role="alert" className="text-xs text-destructive sm:col-span-2 lg:col-span-3">{err("socials")}</p> : null}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="outline" className="mr-auto" onClick={logout} data-testid="customer-profile-logout"><LogOut aria-hidden />{tShell("logout")}</Button>
        {message === "saved" ? <p role="status" className="text-sm text-emerald-700" data-testid="customer-profile-saved">{t("saved")}</p> : null}
        {message === "failed" ? <p role="alert" className="text-sm text-destructive">{t("saveFailed")}</p> : null}
        <Button type="submit" disabled={!dirty || saving}>{saving ? t("saving") : t("save")}</Button>
      </div>
    </form>
  );
}
