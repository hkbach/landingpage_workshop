"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { createReportSchema, REPORT_REASONS, type CreateReportInput } from "@workshop/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@/lib/zod-resolver";

const FIELDS = ["reason", "description", "email"] as const;
/** Error codes the form can show (site.report.errors.*); anything else becomes the generic "failed". */
const KNOWN_CODES = new Set(["required", "descriptionShort", "tooLong", "email"]);

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-white px-2.5 text-base text-zinc-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--site-primary)] px-5 py-2 text-sm font-semibold text-[var(--site-primary-fg)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]/40 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-black/20 bg-white px-5 py-2 text-sm font-medium text-[var(--site-text)] outline-none hover:bg-black/5 focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]/40";

/**
 * "Report this site": reason, description, optional email. Used by the popup of every template (`dialog`) and by the
 * stand-alone report page (`page`, also the fallback without JavaScript). Submits to POST /api/v1/public/sites/{slug}/reports.
 * In the builder preview (`preview`) nothing is sent.
 */
export function ReportForm({ slug, variant = "page", preview = false, homeHref = "/", onSent, onClose }: {
  slug: string;
  variant?: "page" | "dialog";
  preview?: boolean;
  homeHref?: string;
  /** Called once the report was accepted (the popup uses it to switch its title). */
  onSent?: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations("site.report");
  const uid = useId();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<"rateLimited" | "network" | "failed" | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<CreateReportInput>({
    resolver: zodResolver(createReportSchema),
    defaultValues: { description: "", email: "" },
  });
  const err = (n: keyof CreateReportInput) => {
    const code = errors[n]?.message;
    return code ? t(`errors.${KNOWN_CODES.has(code) ? code : "failed"}` as never) : undefined;
  };
  const id = (name: string) => `${uid}-${name}`;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (preview) return;
    try {
      const res = await fetch(`/api/v1/public/sites/${encodeURIComponent(slug)}/reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.status === 201) {
        setSent(true);
        onSent?.();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; details?: { fields?: Record<string, string> } } } | null;
      const fields = body?.error?.details?.fields;
      if (res.status === 422 && fields) {
        for (const [field, code] of Object.entries(fields)) {
          if ((FIELDS as readonly string[]).includes(field)) setError(field as (typeof FIELDS)[number], { message: code });
        }
        return;
      }
      setFormError(body?.error?.code === "RATE_LIMITED" ? "rateLimited" : "failed");
    } catch {
      setFormError("network");
    }
  });

  if (sent) {
    return variant === "dialog" ? (
      <div role="status" className="grid gap-4">
        <button type="button" onClick={onClose} className={secondaryButton} autoFocus>{t("close")}</button>
      </div>
    ) : (
      <div role="status" className="space-y-4">
        <h1 className="text-2xl font-bold">{t("thanksTitle")}</h1>
        <p className="text-[var(--site-muted)]">{t("thanksText")}</p>
        <a href={homeHref} className="font-medium text-[var(--site-primary)] underline underline-offset-4">{t("back")}</a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {variant === "page" ? (
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-[var(--site-muted)]">{t("intro")}</p>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <label htmlFor={id("reason")} className="text-sm font-medium">{t("reason")} <span aria-hidden>*</span></label>
        <select
          id={id("reason")} className={selectClass} aria-required aria-invalid={!!errors.reason} aria-describedby={errors.reason ? id("reason-error") : undefined}
          defaultValue="" {...register("reason")}
        >
          <option value="" disabled>{t("reasonPlaceholder")}</option>
          {REPORT_REASONS.map((r) => <option key={r} value={r}>{t(`reasons.${r}`)}</option>)}
        </select>
        {errors.reason && <p id={id("reason-error")} role="alert" className="text-xs text-red-700">{err("reason")}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={id("description")} className="text-sm font-medium">{t("description")} <span aria-hidden>*</span></label>
        <Textarea
          id={id("description")} rows={5} maxLength={2000} aria-required aria-invalid={!!errors.description}
          aria-describedby={errors.description ? id("description-error") : undefined} {...register("description")}
        />
        {errors.description && <p id={id("description-error")} role="alert" className="text-xs text-red-700">{err("description")}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={id("email")} className="text-sm font-medium">{t("email")}</label>
        <Input
          id={id("email")} type="email" autoComplete="email" className="h-11 text-base" aria-invalid={!!errors.email}
          aria-describedby={errors.email ? id("email-error") : id("email-hint")} {...register("email")}
        />
        <p id={id("email-hint")} className="text-xs text-[var(--site-muted)]">{t("emailHint")}</p>
        {errors.email && <p id={id("email-error")} role="alert" className="text-xs text-red-700">{err("email")}</p>}
      </div>
      <div className="rounded-lg border border-dashed border-black/30 p-3 text-xs text-[var(--site-muted)]" data-turnstile-placeholder>
        {t("turnstilePlaceholder")}
      </div>
      {formError ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{t(`errors.${formError}`)}</p> : null}
      {preview ? <p role="status" className="rounded-lg bg-[var(--site-surface)] p-3 text-sm">{t("previewNote")}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={isSubmitting || preview} className={primaryButton}>
          {isSubmitting ? t("submitting") : t("submit")}
        </button>
        {variant === "dialog" ? <button type="button" onClick={onClose} className={secondaryButton}>{t("cancel")}</button> : null}
      </div>
    </form>
  );
}
