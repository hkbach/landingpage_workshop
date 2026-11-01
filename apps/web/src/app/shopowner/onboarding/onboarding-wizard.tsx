"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { LOCALES, checkSlugFormat, generateShopSlug, type Locale } from "@workshop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, describedBy } from "@/components/dashboard/shell/field";
import { NativeSelect } from "@/components/dashboard/shell/native-select";
import { COUNTRIES, CURRENCIES, TIMEZONES } from "@/components/dashboard/shell/options";
import { zodResolver } from "@/lib/zod-resolver";

const localeEnum = z.enum(LOCALES);

const schema = z.object({
  name: z.string().trim().min(1, "errors.nameRequired").max(120),
  slug: z
    .string()
    .trim()
    .refine((v) => checkSlugFormat(v) !== "INVALID_FORMAT", "errors.slugInvalid")
    .refine((v) => checkSlugFormat(v) !== "RESERVED", "errors.slugReserved"),
  country: z.string().min(1, "errors.required"),
  timezone: z.string().min(1, "errors.required"),
  currency: z.string().min(1, "errors.required"),
  defaultLocale: localeEnum,
  enabledLocales: z.array(localeEnum).min(1),
  contactEmail: z.string().trim().min(1, "errors.emailRequired").pipe(z.email("errors.emailInvalid")),
  contactPhone: z.string().trim().min(5, "errors.phoneRequired").max(30),
  whatsapp: z.string().trim().max(30),
  address: z.string().trim().min(1, "errors.addressRequired").max(300),
  mapsUrl: z.string().trim().refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "errors.urlInvalid"),
});
type Values = z.infer<typeof schema>;

const STEP_FIELDS: (keyof Values)[][] = [
  ["name", "slug"],
  ["country", "timezone", "currency"],
  ["defaultLocale", "enabledLocales"],
  ["contactEmail", "contactPhone", "whatsapp", "address", "mapsUrl"],
  [],
];
const STEPS = ["shop", "region", "languages", "contact", "review"] as const;

// Regional defaults suggested when the country changes (still editable).
const COUNTRY_DEFAULTS: Record<string, { timezone: string; currency: string }> = {
  VN: { timezone: "Asia/Ho_Chi_Minh", currency: "VND" }, TH: { timezone: "Asia/Bangkok", currency: "THB" },
  SG: { timezone: "Asia/Singapore", currency: "SGD" }, JP: { timezone: "Asia/Tokyo", currency: "JPY" },
  KR: { timezone: "Asia/Seoul", currency: "KRW" }, GB: { timezone: "Europe/London", currency: "EUR" },
  US: { timezone: "America/New_York", currency: "USD" },
};

// Mock "already taken" slugs: the real check is the uniqueness of the slug in the whole system (FR-ORG-01).
const TAKEN_SLUGS = ["clayco", "waxwick", "silverthread", "demo", "studio"];
const isTaken = (slug: string) => TAKEN_SLUGS.includes(slug);

export function OnboardingWizard({ platformDomain }: { platformDomain: string }) {
  const t = useTranslations("dashboard.onboarding");
  const tc = useTranslations("common");
  const uiLocale = useLocale();
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      name: "", slug: "", country: "VN", timezone: "Asia/Ho_Chi_Minh", currency: "VND", defaultLocale: "en",
      enabledLocales: ["en"], contactEmail: "", contactPhone: "", whatsapp: "", address: "", mapsUrl: "",
    },
  });
  const { register, handleSubmit, control, setValue, trigger, getValues, formState: { errors, isSubmitting } } = form;
  const slug = useWatch({ control, name: "slug" });
  const defaultLocale = useWatch({ control, name: "defaultLocale" });
  const enabled = useWatch({ control, name: "enabledLocales" });

  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const nameReg = register("name");
  const countryName = new Intl.DisplayNames([uiLocale], { type: "region" });
  const err = (k: keyof Values) => {
    const m = errors[k]?.message;
    return typeof m === "string" ? t(m) : undefined;
  };
  const common = (id: string, k: keyof Values, hint?: boolean) => ({
    id, "aria-invalid": !!errors[k], "aria-describedby": describedBy(id, { error: !!errors[k], hint }),
  });

  // The slug is made by the system from the shop name: the owner cannot type or change it (not even an admin later).
  function applyName(name: string) {
    setValue("slug", name.trim() === "" ? "" : generateShopSlug(name, isTaken), { shouldValidate: true, shouldDirty: true });
  }

  function toggleLocale(l: Locale, on: boolean) {
    const next = on ? [...new Set([...enabled, l])] : enabled.filter((x) => x !== l);
    setValue("enabledLocales", next, { shouldValidate: true, shouldDirty: true });
  }

  async function next() {
    const ok = await trigger(STEP_FIELDS[step]);
    if (!ok) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-emerald-600" aria-hidden />{t("done.title")}</CardTitle>
          <CardDescription>{t("done.body", { host: `${getValues("slug").trim()}.${platformDomain}` })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={`/shopowner/${getValues("slug")}`} className={buttonVariants()}>{t("done.cta")}</Link>
        </CardContent>
      </Card>
    );
  }

  const values = getValues();
  const reviewRows: [string, string][] = [
    [t("fields.name"), values.name],
    [t("fields.slug"), `${values.slug}.${platformDomain}`],
    [t("fields.country"), countryName.of(values.country) ?? values.country],
    [t("fields.timezone"), values.timezone],
    [t("fields.currency"), values.currency],
    [t("fields.defaultLocale"), tc(`languages.${values.defaultLocale}`)],
    [t("fields.enabledLocales"), values.enabledLocales.map((l) => tc(`languages.${l}`)).join(", ")],
    [t("fields.contactEmail"), values.contactEmail],
    [t("fields.contactPhone"), values.contactPhone],
    [t("fields.whatsapp"), values.whatsapp || "-"],
    [t("fields.address"), values.address],
    [t("fields.mapsUrl"), values.mapsUrl || "-"],
  ];

  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={handleSubmit(async () => {
        await new Promise((r) => setTimeout(r, 900));
        setSubmitted(true);
      })}
    >
      <nav aria-label={t("progress")}>
        <ol className="flex flex-wrap gap-2 text-xs">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? "step" : undefined}
              className={`rounded-full px-3 py-1 ring-1 ring-foreground/15 ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-muted text-foreground" : "text-muted-foreground"}`}
            >
              {i + 1}. {t(`steps.${s}`)}
            </li>
          ))}
        </ol>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 ref={headingRef} tabIndex={-1} className="outline-none">{t(`steps.${STEPS[step]}`)}</h2>
          </CardTitle>
          <CardDescription>{t(`stepDesc.${STEPS[step]}`)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {step === 0 ? (
            <>
              <Field htmlFor="o-name" label={t("fields.name")} error={err("name")}>
                <Input autoComplete="organization" {...common("o-name", "name")} {...nameReg}
                  onChange={(e) => { void nameReg.onChange(e); applyName(e.target.value); }} />
              </Field>
              {slug ? (
                <div className="grid gap-1 rounded-lg bg-muted/50 p-3 text-sm" data-testid="slug-box" aria-live="polite">
                  <p>
                    <span className="text-muted-foreground">{t("slugPreview")}</span>{" "}
                    <span className="font-mono">{slug}.{platformDomain}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t("slug.dashboard")}</span>{" "}
                    <span className="font-mono">/shopowner/{slug}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{t("slug.fixed")}</p>
                </div>
              ) : null}
            </>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field htmlFor="o-country" label={t("fields.country")} error={err("country")}>
                <NativeSelect {...common("o-country", "country")} {...register("country", {
                  onChange: (e) => {
                    const d = COUNTRY_DEFAULTS[e.target.value];
                    if (d) { setValue("timezone", d.timezone); setValue("currency", d.currency); }
                  },
                })}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{countryName.of(c) ?? c}</option>)}
                </NativeSelect>
              </Field>
              <Field htmlFor="o-tz" label={t("fields.timezone")} error={err("timezone")}>
                <NativeSelect {...common("o-tz", "timezone")} {...register("timezone")}>
                  {TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                </NativeSelect>
              </Field>
              <Field htmlFor="o-currency" label={t("fields.currency")} error={err("currency")}>
                <NativeSelect {...common("o-currency", "currency")} {...register("currency")}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </NativeSelect>
              </Field>
            </div>
          ) : null}

          {step === 2 ? (
            <>
              <Field htmlFor="o-default-locale" label={t("fields.defaultLocale")} className="sm:max-w-xs">
                <NativeSelect id="o-default-locale" {...register("defaultLocale", {
                  onChange: (e) => toggleLocale(e.target.value as Locale, true),
                })}>
                  {LOCALES.map((l) => <option key={l} value={l}>{tc(`languages.${l}`)}</option>)}
                </NativeSelect>
              </Field>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t("fields.enabledLocales")}</legend>
                {LOCALES.map((l) => (
                  <div key={l} className="flex items-center gap-2">
                    <Checkbox
                      id={`o-locale-${l}`}
                      checked={enabled.includes(l)}
                      disabled={l === defaultLocale}
                      onCheckedChange={(v) => toggleLocale(l, v === true)}
                    />
                    <Label htmlFor={`o-locale-${l}`} className="font-normal">
                      {tc(`languages.${l}`)}{l === defaultLocale ? ` (${t("default")})` : ""}
                    </Label>
                  </div>
                ))}
              </fieldset>
            </>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="o-email" label={t("fields.contactEmail")} error={err("contactEmail")}>
                <Input type="email" autoComplete="email" {...common("o-email", "contactEmail")} {...register("contactEmail")} />
              </Field>
              <Field htmlFor="o-phone" label={t("fields.contactPhone")} error={err("contactPhone")}>
                <Input type="tel" autoComplete="tel" {...common("o-phone", "contactPhone")} {...register("contactPhone")} />
              </Field>
              <Field htmlFor="o-whatsapp" label={t("fields.whatsapp")} error={err("whatsapp")}>
                <Input type="tel" {...common("o-whatsapp", "whatsapp")} {...register("whatsapp")} />
              </Field>
              <Field htmlFor="o-address" label={t("fields.address")} error={err("address")} className="sm:col-span-2">
                <Input autoComplete="street-address" {...common("o-address", "address")} {...register("address")} />
              </Field>
              <Field htmlFor="o-maps" label={t("fields.mapsUrl")} hint={t("hints.mapsUrl")} error={err("mapsUrl")} className="sm:col-span-2">
                <Input type="url" inputMode="url" {...common("o-maps", "mapsUrl", true)} {...register("mapsUrl")} />
              </Field>
            </div>
          ) : null}

          {step === 4 ? (
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              {reviewRows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="break-words font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-between gap-3">
        <Button type="button" variant="outline" disabled={step === 0 || isSubmitting} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          {tc("back")}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next} disabled={step === 0 && slug === ""}>{tc("next")}</Button>
        ) : (
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? t("creating") : t("create")}</Button>
        )}
      </div>
    </form>
  );
}
