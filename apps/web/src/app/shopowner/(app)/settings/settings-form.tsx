"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import { LOCALES, type Locale } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, describedBy } from "@/components/dashboard/shell/field";
import { NativeSelect } from "@/components/dashboard/shell/native-select";
import { COUNTRIES, CURRENCIES, TIMEZONES } from "@/components/dashboard/shell/options";
import { cn } from "@/lib/utils";
import { zodResolver } from "@/lib/zod-resolver";

const localeEnum = z.enum(LOCALES);

const schema = z
  .object({
    name: z.string().trim().min(1, "errors.nameRequired").max(120),
    contactEmail: z.string().trim().min(1, "errors.emailRequired").pipe(z.email("errors.emailInvalid")),
    contactPhone: z.string().trim().min(5, "errors.phoneRequired").max(30),
    whatsapp: z.string().trim().max(30),
    address: z.string().trim().min(1, "errors.addressRequired").max(300),
    mapsUrl: z.string().trim().refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "errors.urlInvalid"),
    country: z.string().min(1),
    timezone: z.string().min(1, "errors.required"),
    currency: z.string().min(1, "errors.required"),
    defaultLocale: localeEnum,
    enabledLocales: z.array(localeEnum),
    bookingCutoffMinutes: z.number({ error: "errors.cutoffInvalid" }).int("errors.cutoffInvalid").min(0, "errors.cutoffInvalid").max(10_080, "errors.cutoffInvalid"),
  })
  .refine((v) => v.enabledLocales.includes(v.defaultLocale), { path: ["enabledLocales"], message: "errors.defaultMustBeEnabled" });

type Values = z.infer<typeof schema>;

export function SettingsForm({ initial, hasBookings, readOnly }: { initial: Values; hasBookings: boolean; readOnly: boolean }) {
  const t = useTranslations("dashboard.settings");
  const tc = useTranslations("common");
  const uiLocale = useLocale();
  const [saved, setSaved] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const { register, handleSubmit, control, setValue, reset, formState: { errors, isSubmitting } } = form;

  const timezone = useWatch({ control, name: "timezone" });
  const currency = useWatch({ control, name: "currency" });
  const defaultLocale = useWatch({ control, name: "defaultLocale" });
  const enabled = useWatch({ control, name: "enabledLocales" });
  const risky = hasBookings && (timezone !== initial.timezone || currency !== initial.currency);
  const countryName = new Intl.DisplayNames([uiLocale], { type: "region" });
  const err = (k: keyof Values) => {
    const m = errors[k]?.message;
    return typeof m === "string" ? t(m) : undefined;
  };
  const common = (id: string, k: keyof Values, hint?: boolean) => ({
    id, "aria-invalid": !!errors[k], "aria-describedby": describedBy(id, { error: !!errors[k], hint }), disabled: readOnly,
  });

  function toggleLocale(l: Locale, on: boolean) {
    const next = on ? [...new Set([...enabled, l])] : enabled.filter((x) => x !== l);
    setValue("enabledLocales", next, { shouldValidate: true, shouldDirty: true });
  }

  // Arriving through #languages: bring the Languages card into view below the sticky top bar, move focus to it and flash it.
  const [flashLanguages, setFlashLanguages] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const goToLanguages = () => {
      if (window.location.hash !== "#languages") return;
      const el = document.getElementById("languages");
      if (!el) return;
      el.scrollIntoView({ block: "start" });
      el.focus({ preventScroll: true });
      setFlashLanguages(true);
      clearTimeout(timer);
      timer = setTimeout(() => setFlashLanguages(false), 2500);
    };
    goToLanguages();
    window.addEventListener("hashchange", goToLanguages);
    return () => { window.removeEventListener("hashchange", goToLanguages); clearTimeout(timer); };
  }, []);

  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={handleSubmit(async (values) => {
        setSaved(false);
        await new Promise((r) => setTimeout(r, 700));
        reset(values);
        setSaved(true);
      })}
    >
      {readOnly ? <p role="status" className="rounded-lg border bg-muted p-3 text-sm">{t("readOnly")}</p> : null}

      <Card>
        <CardHeader><CardTitle>{t("sections.general")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="s-name" label={t("fields.name")} error={err("name")} className="sm:col-span-2">
            <Input {...common("s-name", "name")} {...register("name")} />
          </Field>
          <Field htmlFor="s-email" label={t("fields.contactEmail")} error={err("contactEmail")}>
            <Input type="email" autoComplete="off" {...common("s-email", "contactEmail")} {...register("contactEmail")} />
          </Field>
          <Field htmlFor="s-phone" label={t("fields.contactPhone")} error={err("contactPhone")}>
            <Input type="tel" autoComplete="off" {...common("s-phone", "contactPhone")} {...register("contactPhone")} />
          </Field>
          <Field htmlFor="s-whatsapp" label={t("fields.whatsapp")} error={err("whatsapp")}>
            <Input type="tel" autoComplete="off" {...common("s-whatsapp", "whatsapp")} {...register("whatsapp")} />
          </Field>
          <Field htmlFor="s-address" label={t("fields.address")} error={err("address")} className="sm:col-span-2">
            <Input autoComplete="off" {...common("s-address", "address")} {...register("address")} />
          </Field>
          <Field htmlFor="s-maps" label={t("fields.mapsUrl")} hint={t("hints.mapsUrl")} error={err("mapsUrl")} className="sm:col-span-2">
            <Input type="url" inputMode="url" {...common("s-maps", "mapsUrl", true)} {...register("mapsUrl")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.regional")}</CardTitle>
          <CardDescription>{t("sections.regionalDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field htmlFor="s-country" label={t("fields.country")}>
              <NativeSelect id="s-country" disabled={readOnly} {...register("country")}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{countryName.of(c) ?? c}</option>)}
              </NativeSelect>
            </Field>
            <Field htmlFor="s-tz" label={t("fields.timezone")} error={err("timezone")}>
              <NativeSelect {...common("s-tz", "timezone")} {...register("timezone")}>
                {TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </NativeSelect>
            </Field>
            <Field htmlFor="s-currency" label={t("fields.currency")} error={err("currency")}>
              <NativeSelect {...common("s-currency", "currency")} {...register("currency")}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </NativeSelect>
            </Field>
          </div>

          {risky ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{t("warning.regional")}</p>
            </div>
          ) : null}

          <Field htmlFor="s-cutoff" label={t("fields.bookingCutoff")} hint={t("hints.bookingCutoff")} error={err("bookingCutoffMinutes")} className="sm:max-w-xs">
            <Input type="number" min={0} step={1} inputMode="numeric" {...common("s-cutoff", "bookingCutoffMinutes", true)}
              {...register("bookingCutoffMinutes", { valueAsNumber: true })} />
          </Field>
        </CardContent>
      </Card>

      {/* Landing spot of the "Manage languages" link (…/settings#languages). */}
      <Card
        id="languages" role="region" aria-labelledby="languages-title" tabIndex={-1}
        className={cn("scroll-mt-20 outline-none transition-shadow duration-500", flashLanguages && "ring-2 ring-primary")}
      >
        <CardHeader>
          <CardTitle id="languages-title">{t("sections.languages")}</CardTitle>
          <CardDescription>{t("sections.languagesDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field htmlFor="s-default-locale" label={t("fields.defaultLocale")} className="sm:max-w-xs">
            <NativeSelect id="s-default-locale" disabled={readOnly} {...register("defaultLocale", {
              onChange: (e) => toggleLocale(e.target.value as Locale, true),
            })}>
              {LOCALES.map((l) => <option key={l} value={l}>{tc(`languages.${l}`)}</option>)}
            </NativeSelect>
          </Field>
          <fieldset className="grid gap-2" aria-describedby={describedBy("s-locales", { error: !!errors.enabledLocales })}>
            <legend className="mb-1 text-sm font-medium">{t("fields.enabledLocales")}</legend>
            <p className="text-xs text-muted-foreground">{t("fields.enabledLocalesHint")}</p>
            {LOCALES.map((l) => (
              <div key={l} className="flex items-center gap-2">
                <Checkbox
                  id={`s-locale-${l}`}
                  checked={enabled.includes(l)}
                  disabled={readOnly || l === defaultLocale}
                  onCheckedChange={(v) => toggleLocale(l, v === true)}
                />
                <Label htmlFor={`s-locale-${l}`} className="font-normal">
                  {tc(`languages.${l}`)}{l === defaultLocale ? ` (${t("default")})` : ""}
                </Label>
              </div>
            ))}
            {err("enabledLocales") ? <p id="s-locales-error" role="alert" className="text-xs text-destructive">{err("enabledLocales")}</p> : null}
          </fieldset>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting || readOnly}>{isSubmitting ? tc("saving") : tc("save")}</Button>
        {saved ? <p role="status" className="text-sm text-emerald-700">{t("saved")}</p> : null}
      </div>
    </form>
  );
}
