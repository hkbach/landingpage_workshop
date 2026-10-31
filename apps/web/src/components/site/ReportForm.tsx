"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@/lib/zod-resolver";

const REASONS = ["SCAM", "PHISHING", "INAPPROPRIATE", "OTHER"] as const;

// Messages are i18n keys under site.report.errors.
const schema = z.object({
  reason: z.enum(REASONS, "required"),
  description: z.string().trim().min(10, "descriptionShort").max(2000, "tooLong"),
  email: z.string().trim().max(120, "tooLong").refine((v) => v === "" || z.email().safeParse(v).success, "email").optional(),
});
type Values = z.infer<typeof schema>;

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-white px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ReportForm({ homeHref }: { homeHref: string }) {
  const t = useTranslations("site.report");
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { description: "", email: "" },
  });
  const err = (n: keyof Values) => (errors[n]?.message ? t(`errors.${errors[n]!.message}` as never) : undefined);

  const onSubmit = handleSubmit(async () => {
    // Simulated POST /public/sites/{slug}/reports (rate limited + Turnstile on the real API).
    await new Promise((r) => setTimeout(r, 500));
    setSent(true);
  });

  if (sent) {
    return (
      <div role="status" className="space-y-4">
        <h1 className="text-2xl font-bold">{t("thanksTitle")}</h1>
        <p className="text-[var(--site-muted)]">{t("thanksText")}</p>
        <a href={homeHref} className="font-medium text-[var(--site-primary)] underline underline-offset-4">{t("back")}</a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-[var(--site-muted)]">{t("intro")}</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="rp-reason" className="text-sm font-medium">{t("reason")} <span aria-hidden>*</span></label>
        <select id="rp-reason" className={selectClass} aria-required aria-invalid={!!errors.reason} defaultValue="" {...register("reason")}>
          <option value="" disabled>{t("reasonPlaceholder")}</option>
          {REASONS.map((r) => <option key={r} value={r}>{t(`reasons.${r}`)}</option>)}
        </select>
        {errors.reason && <p role="alert" className="text-xs text-red-700">{err("reason")}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="rp-desc" className="text-sm font-medium">{t("description")} <span aria-hidden>*</span></label>
        <Textarea id="rp-desc" rows={5} maxLength={2000} aria-required aria-invalid={!!errors.description} {...register("description")} />
        {errors.description && <p role="alert" className="text-xs text-red-700">{err("description")}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="rp-email" className="text-sm font-medium">{t("email")}</label>
        <Input id="rp-email" type="email" autoComplete="email" className="h-11 text-base" aria-invalid={!!errors.email} {...register("email")} />
        <p className="text-xs text-[var(--site-muted)]">{t("emailHint")}</p>
        {errors.email && <p role="alert" className="text-xs text-red-700">{err("email")}</p>}
      </div>
      <div className="rounded-lg border border-dashed border-black/30 p-3 text-xs text-[var(--site-muted)]" data-turnstile-placeholder>
        {t("turnstilePlaceholder")}
      </div>
      <button
        type="submit" disabled={isSubmitting}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--site-primary)] px-5 py-2 text-sm font-semibold text-[var(--site-primary-fg)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]/40 disabled:opacity-50"
      >
        {isSubmitting ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
