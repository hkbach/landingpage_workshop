"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { formatMoney, pickLocalized, type Locale } from "@workshop/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PageTheme, Session, Shop, Workshop } from "@/lib/types";
import { dayKey, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { zodResolver } from "@/lib/zod-resolver";
import { siteFontClass } from "@/components/sections/site-fonts";
import { modalThemeStyle } from "@/components/sections/theme";
import { COUNTRY_CODES, countryName } from "./countries";
import { bookingContactSchema, type BookingFormValues } from "./schema";
import { simulateBooking } from "./simulate";
import { newUuid } from "@/lib/uuid";

export type BookingShop = Pick<Shop, "name" | "slug" | "timezone" | "currency" | "defaultLocale" | "bookingCutoffMinutes">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialWorkshopId?: string;
  shop: BookingShop;
  workshops: Workshop[];
  sessions: Session[];
  theme: PageTheme;
  locale: Locale;
  /** Base path of the site ("" on the subdomain host). */
  basePath: string;
}

const STEPS = ["date", "time", "guests", "contact", "confirm"] as const;
type Step = (typeof STEPS)[number];

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--site-primary)] px-5 py-2 text-sm font-semibold text-[var(--site-primary-fg)] outline-none transition hover:opacity-90 focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]/40 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-black/20 bg-white px-5 py-2 text-sm font-medium text-[var(--site-text)] outline-none transition hover:bg-black/5 focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]/40";
const fieldClass = "h-11 text-base";
const selectClass =
  "h-11 w-full rounded-lg border border-input bg-white px-2.5 text-base text-[var(--site-text)] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function BookingModal(props: Props) {
  const t = useTranslations("site.booking");
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        style={modalThemeStyle(props.theme)}
        className={cn("max-h-[92dvh] gap-4 overflow-y-auto p-5 sm:max-w-lg", siteFontClass(props.theme.font))}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{t("title")}</DialogTitle>
          <DialogDescription className="text-[var(--site-muted)]">{t("subtitle", { shop: props.shop.name })}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open: Idempotency-Key and "now" are created each time the modal opens. */}
        <BookingFlow {...props} />
      </DialogContent>
    </Dialog>
  );
}

function ChoiceGroup({ legend, children, className }: { legend: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className={cn("grid gap-2", className)}>{children}</div>
    </fieldset>
  );
}

function Choice({ name, checked, disabled, onSelect, children }: {
  name: string; checked: boolean; disabled?: boolean; onSelect: () => void; children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-black/20 bg-white px-3 py-2 text-sm",
        "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--site-primary)]/40",
        checked && "border-[var(--site-primary)] bg-[var(--site-surface)] ring-2 ring-[var(--site-primary)]",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} disabled={disabled} onChange={onSelect} />
      {children}
    </label>
  );
}

function BookingFlow({ onOpenChange, initialWorkshopId, shop, workshops, sessions, locale, basePath }: Props) {
  const t = useTranslations("site.booking");
  const tp = useTranslations("site");
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [idempotencyKey] = useState(() => newUuid());
  const L = (v: Parameters<typeof pickLocalized>[0]) => pickLocalized(v, locale, shop.defaultLocale);

  // Bookable = OPEN and starts after now + cutoff (FR-BOOK-01). Full sessions stay visible as "Sold out".
  const bookable = useMemo(() => {
    const limit = now + shop.bookingCutoffMinutes * 60_000;
    return sessions.filter((s) => s.status === "OPEN" && new Date(s.startsAt).getTime() > limit)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [sessions, shop.bookingCutoffMinutes, now]);

  const [step, setStep] = useState<Step>("date");
  const [workshopId, setWorkshopId] = useState(initialWorkshopId ?? workshops[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const workshop = workshops.find((w) => w.id === workshopId);
  const wsSessions = bookable.filter((s) => s.workshopId === workshopId);
  const dates = [...new Set(wsSessions.map((s) => dayKey(s.startsAt, shop.timezone)))];
  const daySessions = wsSessions.filter((s) => dayKey(s.startsAt, shop.timezone) === date);
  const session = sessions.find((s) => s.id === sessionId);
  const remaining = session ? session.capacity - session.reservedCount : 0;
  const maxGuests = workshop ? Math.max(1, Math.min(workshop.maxPerBooking, remaining)) : 1;
  // Display-only total. The server recomputes price = unit price x quantity (BR-04).
  const total = workshop ? workshop.priceAmount * quantity : 0;

  const dateLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: shop.timezone }).format(new Date(iso));

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingContactSchema),
    defaultValues: { fullName: "", email: "", country: "", phone: "", specialRequest: "", consent: false },
    mode: "onTouched",
  });
  const { register, control, handleSubmit, trigger, formState: { errors } } = form;
  const requestLen = (useWatch({ control, name: "specialRequest" }) ?? "").length;
  const watchedName = useWatch({ control, name: "fullName" });
  const watchedEmail = useWatch({ control, name: "email" });
  const err = (name: keyof BookingFormValues) => {
    const m = errors[name]?.message;
    return m ? t(`errors.${m}` as never) : undefined;
  };

  const stepIndex = STEPS.indexOf(step);
  const canNext =
    (step === "date" && !!date) || (step === "time" && !!session && remaining > 0) || step === "guests" || step === "contact";

  async function next() {
    if (step === "contact") {
      const ok = await trigger(["fullName", "email", "country", "phone", "specialRequest"]);
      if (!ok) return;
    }
    setStep(STEPS[stepIndex + 1]!);
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!workshop || !session) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      // Simulated POST with the Idempotency-Key; the real API verifies Turnstile and recomputes the price.
      const result = await simulateBooking(
        {
          email: values.email.trim().toLowerCase(), workshopTitle: L(workshop.title), startsAt: session.startsAt, endsAt: session.endsAt,
          timezone: shop.timezone, quantity, totalAmount: total, currency: workshop.currency,
        },
        idempotencyKey,
      );
      onOpenChange(false);
      router.push(`${basePath}/booking/${result.code}?email=${encodeURIComponent(result.email)}`);
    } catch {
      setSubmitError(true);
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <p className="text-xs font-medium text-[var(--site-muted)]" aria-live="polite">
          {t("stepOf", { current: stepIndex + 1, total: STEPS.length })} · {t(`steps.${step}`)}
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={cn("h-1 flex-1 rounded-full", i <= stepIndex ? "bg-[var(--site-primary)]" : "bg-black/15")} />
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--site-muted)]">{t("timesShownIn", { tz: shop.timezone })}</p>
      </div>

      {step === "date" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="bk-workshop" className="text-sm font-medium">{t("workshop")}</label>
            <select
              id="bk-workshop" className={selectClass} value={workshopId}
              onChange={(e) => { setWorkshopId(e.target.value); setDate(""); setSessionId(""); setQuantity(1); }}
            >
              {workshops.map((w) => <option key={w.id} value={w.id}>{L(w.title)}</option>)}
            </select>
          </div>
          {dates.length === 0 ? (
            <p role="status" className="rounded-lg bg-[var(--site-surface)] p-3 text-sm">{t("noAvailability")}</p>
          ) : (
            <ChoiceGroup legend={t("chooseDate")} className="sm:grid-cols-2">
              {dates.map((d) => (
                <Choice key={d} name="bk-date" checked={date === d} onSelect={() => { setDate(d); setSessionId(""); }}>
                  <span>{dateLabel(wsSessions.find((s) => dayKey(s.startsAt, shop.timezone) === d)!.startsAt)}</span>
                </Choice>
              ))}
            </ChoiceGroup>
          )}
        </div>
      )}

      {step === "time" && (
        <ChoiceGroup legend={t("chooseTime")}>
          {daySessions.map((s) => {
            const left = s.capacity - s.reservedCount;
            const soldOut = left <= 0;
            return (
              <Choice key={s.id} name="bk-time" checked={sessionId === s.id} disabled={soldOut} onSelect={() => { setSessionId(s.id); setQuantity(1); }}>
                <span className="font-medium">{formatTime(s.startsAt, shop.timezone, locale)} – {formatTime(s.endsAt, shop.timezone, locale)}</span>
                <span className={cn("text-xs", soldOut ? "font-semibold text-red-700" : "text-[var(--site-muted)]")}>
                  {soldOut ? t("soldOut") : t("spotsLeft", { count: left })}
                </span>
              </Choice>
            );
          })}
        </ChoiceGroup>
      )}

      {step === "guests" && workshop && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="bk-guests" className="text-sm font-medium">{t("guests")}</label>
            <select id="bk-guests" className={selectClass} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
              {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <p className="text-xs text-[var(--site-muted)]">{t("guestsHint", { max: maxGuests })}</p>
          </div>
          <p className="text-sm">
            {t("estimatedTotal")}: <strong>{formatMoney(total, workshop.currency, locale)}</strong>
          </p>
        </div>
      )}

      {step === "contact" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="bk-name" className="text-sm font-medium">{t("fullName")} <span aria-hidden>*</span></label>
            <Input id="bk-name" autoComplete="name" className={fieldClass} aria-required aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? "bk-name-err" : undefined} {...register("fullName")} />
            {errors.fullName && <p id="bk-name-err" role="alert" className="text-xs text-red-700">{err("fullName")}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bk-email" className="text-sm font-medium">{t("email")} <span aria-hidden>*</span></label>
            <Input id="bk-email" type="email" autoComplete="email" className={fieldClass} aria-required aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "bk-email-err" : undefined} {...register("email")} />
            {errors.email && <p id="bk-email-err" role="alert" className="text-xs text-red-700">{err("email")}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bk-country" className="text-sm font-medium">{t("country")} <span aria-hidden>*</span></label>
            <select id="bk-country" className={selectClass} autoComplete="country" aria-required aria-invalid={!!errors.country}
              aria-describedby={errors.country ? "bk-country-err" : undefined} {...register("country")}>
              <option value="">{t("countryPlaceholder")}</option>
              {COUNTRY_CODES.map((c) => ({ c, n: countryName(c, locale) })).sort((a, b) => a.n.localeCompare(b.n, locale))
                .map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
            </select>
            {errors.country && <p id="bk-country-err" role="alert" className="text-xs text-red-700">{err("country")}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bk-phone" className="text-sm font-medium">{t("phone")}</label>
            <Input id="bk-phone" type="tel" autoComplete="tel" className={fieldClass} {...register("phone")} />
            <p className="text-xs text-[var(--site-muted)]">{t("phoneHint")}</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bk-request" className="text-sm font-medium">{t("specialRequest")}</label>
            <Textarea id="bk-request" maxLength={500} aria-describedby="bk-request-count" {...register("specialRequest")} />
            <p id="bk-request-count" className="text-xs text-[var(--site-muted)]">{requestLen}/500</p>
            {errors.specialRequest && <p role="alert" className="text-xs text-red-700">{err("specialRequest")}</p>}
          </div>
        </div>
      )}

      {step === "confirm" && workshop && session && (
        <div className="space-y-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-[var(--site-surface)] p-3 text-sm">
            <dt className="text-[var(--site-muted)]">{t("workshop")}</dt><dd className="font-medium">{L(workshop.title)}</dd>
            <dt className="text-[var(--site-muted)]">{t("when")}</dt>
            <dd className="font-medium">{dateLabel(session.startsAt)}, {formatTime(session.startsAt, shop.timezone, locale)}</dd>
            <dt className="text-[var(--site-muted)]">{t("guests")}</dt><dd className="font-medium">{quantity}</dd>
            <dt className="text-[var(--site-muted)]">{t("contactLabel")}</dt><dd className="font-medium break-all">{watchedName} · {watchedEmail}</dd>
            <dt className="text-[var(--site-muted)]">{t("estimatedTotal")}</dt>
            <dd className="font-semibold">{formatMoney(total, workshop.currency, locale)}</dd>
          </dl>
          <p className="text-xs text-[var(--site-muted)]">{t("totalNote")} {t("payAtStudio")}</p>

          <div className="rounded-lg border border-black/15 p-3 text-sm">
            <p className="font-medium">{tp("latePolicy.title")}</p>
            <p id="bk-late-policy" className="mt-1 text-[var(--site-muted)]">{tp("latePolicy.text")}</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-start gap-3">
              <Controller
                control={control} name="consent"
                render={({ field }) => (
                  <Checkbox
                    id="bk-consent" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)}
                    aria-describedby="bk-late-policy" aria-invalid={!!errors.consent} aria-required className="mt-0.5 size-5"
                  />
                )}
              />
              <label htmlFor="bk-consent" className="text-sm">{t("consent")}</label>
            </div>
            {errors.consent && <p role="alert" className="text-xs text-red-700">{err("consent")}</p>}
          </div>

          <div className="rounded-lg border border-dashed border-black/30 p-3 text-xs text-[var(--site-muted)]" data-turnstile-placeholder>
            {t("turnstilePlaceholder")}
          </div>
          {submitError && <p role="alert" className="text-sm text-red-700">{t("submitError")}</p>}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {stepIndex > 0 ? (
          <button type="button" className={secondaryBtn} onClick={() => setStep(STEPS[stepIndex - 1]!)} disabled={submitting}>{t("back")}</button>
        ) : <span />}
        {step === "confirm" ? (
          <button type="submit" className={primaryBtn} disabled={submitting}>{submitting ? t("submitting") : t("confirmBooking")}</button>
        ) : (
          <button type="button" className={primaryBtn} onClick={next} disabled={!canNext}>{t("next")}</button>
        )}
      </div>
    </form>
  );
}
