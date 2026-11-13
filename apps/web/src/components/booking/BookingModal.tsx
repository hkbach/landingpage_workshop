"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { canCombine, droppedByToggle, eligiblePromotions, formatMoney, pickLocalized, priceBooking, togglePromotion, type Locale, type PromotionRecord } from "@workshop/shared";
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
import { slotState, type SlotState } from "./availability";
import { safeImage } from "@/components/sections/safe-url";
import { cleanOtp, DEMO_OTP, isOtpComplete, OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_RESEND_SECONDS, sendOtp } from "./otp";
import { BookingRefused, submitBooking } from "./simulate";
import { newUuid } from "@/lib/uuid";

/** `demoOtp`: the page runs on the sample data, which accepts one fixed code (shown as a hint outside production). Never set when the page is served by the real API. */
export type BookingShop = Pick<Shop, "name" | "slug" | "timezone" | "currency" | "defaultLocale"> & { demoOtp?: boolean };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialWorkshopId?: string;
  shop: BookingShop;
  workshops: Workshop[];
  sessions: Session[];
  theme: PageTheme;
  locale: Locale;
  /** Promotions active today; the guest may pick the ones that cover the workshop (each one says whether it can be combined). */
  promotions?: PromotionRecord[];
  /** Base path of the site ("" on the subdomain host). */
  basePath: string;
  /** Builder preview: submitting shows a note and makes no booking. */
  preview?: boolean;
  /**
   * A guest who is known (the guest area): the form starts with what their account holds. The name and the email are read only (they are the account's); the
   * country and the phone can be changed for this booking.
   */
  guest?: { fullName: string; email: string; phone?: string; country?: string };
}

/** The current time, read when an event happens (not while rendering). */
const clock = () => Date.now();

const STEPS = ["datetime", "guests", "contact", "confirm", "otp"] as const;
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

function PromoOption({ checked, onChange, label, detail, note }: {
  checked: boolean; onChange: () => void; label: string; detail?: string; note?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-black/20 bg-white px-3 py-2 text-sm",
        "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--site-primary)]/40",
        checked && "border-[var(--site-primary)] bg-[var(--site-surface)] ring-2 ring-[var(--site-primary)]",
      )}
    >
      <input type="checkbox" name="bk-promo" className="sr-only" checked={checked} onChange={onChange} />
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        {note ? <span className="text-xs text-[var(--site-muted)]">{note}</span> : null}
      </span>
      {detail ? <span className="text-xs text-[var(--site-muted)]">{detail}</span> : null}
    </label>
  );
}

function BookingFlow({ onOpenChange, initialWorkshopId, shop, workshops, sessions, locale, basePath, promotions = [], preview = false, guest }: Props) {
  const t = useTranslations("site.booking");
  const tp = useTranslations("site");
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [idempotencyKey] = useState(() => newUuid());
  const L = (v: Parameters<typeof pickLocalized>[0]) => pickLocalized(v, locale, shop.defaultLocale);

  // Every running or closed session of the workshop is listed (paused and cancelled ones are not offered); the ones in the past, closed, inside the booking cut-off or full are
  // shown but cannot be chosen (FR-BOOK-01).
  const listed = useMemo(
    () => sessions.filter((x) => x.status === "RUNNING" || x.status === "CLOSED").sort((p, q) => p.startsAt.localeCompare(q.startsAt)),
    [sessions],
  );
  /** Sessions the server refused while the form was open (their seats were taken, or they closed): not offered again. */
  const [refused, setRefused] = useState<Record<string, SlotState>>({});
  const stateOf = (x: Session): SlotState => refused[x.id] ?? slotState(x, now);

  const [step, setStep] = useState<Step>("datetime");
  const [workshopId, setWorkshopId] = useState(initialWorkshopId ?? workshops[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [previewDone, setPreviewDone] = useState(false);
  /** The chosen session stopped being bookable while the form was open (the booking cut-off passed). */
  const [slotGone, setSlotGone] = useState(false);
  /** The cut-off of the session that stopped being bookable (shown in the notice). */
  const [goneCutoff, setGoneCutoff] = useState(0);
  /** The session stopped being bookable because its last seats were taken (another notice than the cut-off). */
  const [goneFull, setGoneFull] = useState(false);

  const workshop = workshops.find((w) => w.id === workshopId);
  const wsSessions = listed.filter((x) => x.workshopId === workshopId);
  const dates = [...new Set(wsSessions.map((x) => dayKey(x.startsAt, shop.timezone)))];
  const daySessions = wsSessions.filter((x) => dayKey(x.startsAt, shop.timezone) === date);
  /** A date can be chosen when at least one session of that day can. */
  const dateOpen = (d: string) => wsSessions.some((x) => dayKey(x.startsAt, shop.timezone) === d && stateOf(x) === "OK");
  const session = sessions.find((x) => x.id === sessionId && stateOf(x) === "OK");
  const remaining = session ? session.capacity - session.reservedCount : 0;
  const maxGuests = workshop ? Math.max(1, Math.min(workshop.maxPerBooking, remaining)) : 1;
  // Promotions the guest may use for this workshop today. Prices here are display-only: the server recomputes the price (BR-04) and
  // refuses promotions that cannot be combined.
  const today = dayKey(new Date(now).toISOString(), shop.timezone);
  const eligible = useMemo(() => (workshop ? eligiblePromotions(promotions, workshop.id, today) : []), [promotions, workshop, today]);
  const [picked, setPicked] = useState<string[]>([]);
  /** Why the last pick unchecked other promotions, so the guest understands what happened. Cleared by the next pick. */
  const [dropNote, setDropNote] = useState<{ pick: PromotionRecord; dropped: PromotionRecord[] } | null>(null);
  const marked = eligible.filter((p) => picked.includes(p.id));
  const chosen = canCombine(marked) ? marked : marked.slice(0, 1);
  const price = workshop ? priceBooking({ unitPrice: workshop.priceAmount, quantity, promotions: chosen }) : null;
  const subtotal = workshop ? workshop.priceAmount * quantity : 0;
  const total = price?.ok ? price.total : subtotal;
  const discountOf = (id: string) => (price?.ok ? (price.discounts.find((d) => d.id === id)?.amount ?? 0) : 0);

  const bill = workshop ? (
  <dl className="space-y-1 text-sm" data-testid="booking-price">
    {chosen.length > 0 ? (
      <div className="flex justify-between gap-3"><dt>{t("subtotal")}</dt><dd className="tabular-nums">{formatMoney(subtotal, workshop.currency, locale)}</dd></div>
    ) : null}
    {chosen.map((p) => (
      <div key={p.id} className="flex justify-between gap-3 text-emerald-800">
        <dt>{t("discountLine", { title: L(p.title) })}</dt><dd className="tabular-nums">−{formatMoney(discountOf(p.id), workshop.currency, locale)}</dd>
      </div>
    ))}
    <div className="flex justify-between gap-3 font-semibold"><dt>{t("estimatedTotal")}</dt><dd className="tabular-nums">{formatMoney(total, workshop.currency, locale)}</dd></div>
  </dl>
  ) : null;

  const dateLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: shop.timezone }).format(new Date(iso));

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingContactSchema),
    defaultValues: { fullName: guest?.fullName ?? "", email: guest?.email ?? "", country: guest?.country ?? "", phone: guest?.phone ?? "", specialRequest: "", consent: false },
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
  const canNext = (step === "datetime" && !!session && remaining > 0) || step === "guests" || step === "contact";

  async function next() {
    if (step === "contact") {
      const ok = await trigger(["fullName", "email", "country", "phone", "specialRequest"]);
      if (!ok) return;
    }
    setStep(STEPS[stepIndex + 1]!);
  }

  // Email OTP (step 5): confirming sends a code to the guest's email; the booking is created once the code is right.
  const [otpCode, setOtpCode] = useState("");
  const [otpState, setOtpState] = useState<"idle" | "wrong" | "locked">("idle");
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode(email: string) {
    await sendOtp(shop.slug, email, locale);
    setOtpCode(""); setOtpState("idle"); setAttempts(0); setCooldown(OTP_RESEND_SECONDS);
  }

  const onConfirm = handleSubmit(async (values) => {
    if (!workshop || !session) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      await sendCode(values.email.trim().toLowerCase());
      setStep("otp");
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  });

  async function resend() {
    setSubmitting(true);
    try { await sendCode(form.getValues("email").trim().toLowerCase()); } catch { setSubmitError(true); } finally { setSubmitting(false); }
  }

  async function onVerify() {
    if (!workshop || !session || !isOtpComplete(otpCode) || otpState === "locked") return;
    const values = form.getValues();
    const email = values.email.trim().toLowerCase();
    setSubmitting(true);
    setSubmitError(false);
    try {
      // Time passed while the guest filled in the form: check the booking cut-off again (the real API checks it too, FR-BOOK-02).
      if (slotState(session, clock()) !== "OK") {
        setSlotGone(true); setGoneFull(false); setGoneCutoff(session.bookingCutoffMinutes); setSessionId(""); setDate(""); setStep("datetime"); setSubmitting(false);
        return;
      }
      if (preview) { setPreviewDone(true); setSubmitting(false); return; } // nothing is created from the builder
      // POST with the Idempotency-Key: the server makes the booking NOT_CONFIRMED, recomputes the price, checks the seats and emails the guest the link that
      // confirms it (the real API also verifies Turnstile and the OTP).
      const result = await submitBooking(
        {
          slug: shop.slug, sessionId: session.id, quantity, fullName: values.fullName.trim(), email, country: values.country, phone: values.phone.trim(),
          specialRequest: (values.specialRequest ?? "").trim() || undefined, promotionIds: chosen.map((p) => p.id), locale, otp: otpCode,
        },
        {
          email, workshopTitle: L(workshop.title), startsAt: session.startsAt, endsAt: session.endsAt,
          timezone: shop.timezone, quantity, totalAmount: total, currency: workshop.currency,
          promotions: chosen.map((p) => L(p.title)), discountAmount: price?.ok ? price.discount : 0,
        },
        idempotencyKey,
      );
      onOpenChange(false);
      router.push(`${basePath}/booking/${result.code}?email=${encodeURIComponent(result.email)}`);
    } catch (e) {
      if (e instanceof BookingRefused && (e.reason === "OTP_WRONG" || e.reason === "OTP_LOCKED")) {
        // The server checks the code together with the booking: a wrong code costs one of the attempts (the server locks after too many).
        const used = attempts + 1;
        setAttempts(used);
        setOtpCode("");
        setOtpState(e.reason === "OTP_LOCKED" || used >= OTP_MAX_ATTEMPTS ? "locked" : "wrong");
        setSubmitting(false);
        return;
      }
      if (e instanceof BookingRefused && (e.reason === "GONE" || e.reason === "FULL")) {
        // The seats were taken, or the session closed, while the form was open: it is not offered again.
        setRefused((r) => ({ ...r, [session.id]: e.reason === "FULL" ? "FULL" : "CLOSED" }));
        setSlotGone(true); setGoneFull(e.reason === "FULL"); setGoneCutoff(session.bookingCutoffMinutes); setSessionId(""); setDate(""); setStep("datetime"); setSubmitting(false);
        return;
      }
      setSubmitError(true);
      setSubmitting(false);
    }
  }

  if (previewDone) {
    return (
      <div role="status" className="space-y-4">
        <p className="rounded-lg border border-black/20 bg-[var(--site-surface)] p-4 text-sm">{t("previewDone")}</p>
        <button type="button" className={primaryBtn} onClick={() => onOpenChange(false)}>{t("close")}</button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (step === "otp") void onVerify(); else if (step === "confirm") void onConfirm(e); }} noValidate className="space-y-5">
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

      {step === "datetime" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="bk-workshop" className="text-sm font-medium">{t("workshop")}</label>
            <select
              id="bk-workshop" className={selectClass} value={workshopId}
              onChange={(e) => { setWorkshopId(e.target.value); setDate(""); setSessionId(""); setQuantity(1); setPicked([]); setDropNote(null); }}
            >
              {workshops.map((w) => <option key={w.id} value={w.id}>{L(w.title)}</option>)}
            </select>
          </div>
          {dates.length === 0 ? (
            <p role="status" className="rounded-lg bg-[var(--site-surface)] p-3 text-sm">{t("noAvailability")}</p>
          ) : (
            <>
              {slotGone ? <p role="alert" data-testid="slot-gone" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{goneFull ? t("slotFull") : t("slotGone", { minutes: goneCutoff })}</p> : null}
              {!dates.some(dateOpen) ? <p role="status" className="rounded-lg bg-[var(--site-surface)] p-3 text-sm">{t("noneSelectable")}</p> : null}
              <ChoiceGroup legend={t("chooseDate")} className="sm:grid-cols-2">
                {dates.map((d) => (
                  <Choice key={d} name="bk-date" checked={date === d} disabled={!dateOpen(d)} onSelect={() => { setDate(d); setSessionId(""); setSlotGone(false); }}>
                    <span>{dateLabel(wsSessions.find((x) => dayKey(x.startsAt, shop.timezone) === d)!.startsAt)}</span>
                    {!dateOpen(d) ? <span className="text-xs text-[var(--site-muted)]">{t("dateUnavailable")}</span> : null}
                  </Choice>
                ))}
              </ChoiceGroup>
              {date ? (
                <ChoiceGroup legend={t("chooseTime")}>
                  {daySessions.map((x) => {
                    const left = x.capacity - x.reservedCount;
                    const state = stateOf(x);
                    return (
                      <Choice key={x.id} name="bk-time" checked={sessionId === x.id} disabled={state !== "OK"} onSelect={() => { setSessionId(x.id); setQuantity(1); }}>
                        <span className="flex items-center gap-2">
                          {safeImage(x.imageUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={safeImage(x.imageUrl)} alt="" data-testid="session-photo" className="size-12 shrink-0 rounded-md object-cover" />
                          ) : null}
                          <span className="grid">
                          <span className="font-medium">{formatTime(x.startsAt, shop.timezone, locale)} – {formatTime(x.endsAt, shop.timezone, locale)}</span>
                          <span className="text-xs text-[var(--site-muted)]" data-testid="cutoff-note">{t("cutoffNote", { minutes: x.bookingCutoffMinutes })}</span>
                          </span>
                        </span>
                        <span className={cn("text-xs", state === "FULL" ? "font-semibold text-red-700" : "text-[var(--site-muted)]")}>
                          {state === "OK" ? t("spotsLeft", { count: left }) : t(`slot.${state}`)}
                        </span>
                      </Choice>
                    );
                  })}
                </ChoiceGroup>
              ) : null}
            </>
          )}
        </div>
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
          {eligible.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("promotions")}</legend>
              <p className="text-xs text-[var(--site-muted)]">{t("promotionsHint")}</p>
              <div className="grid gap-2">
                {eligible.map((p) => (
                  <PromoOption
                    key={p.id} checked={chosen.some((c) => c.id === p.id)}
                    onChange={() => {
                      const dropped = droppedByToggle(chosen, p);
                      setPicked(togglePromotion(chosen, p).map((x) => x.id));
                      setDropNote(dropped.length > 0 ? { pick: p, dropped } : null);
                    }}
                    label={L(p.title)}
                    detail={`${p.discountType === "PERCENT" ? t("promotionOffPercent", { value: p.discountValue }) : t("promotionOffAmount", { amount: formatMoney(p.discountValue, workshop.currency, locale) })}${p.code ? ` · ${p.code}` : ""}`}
                    note={t(p.stacking === "SINGLE" ? "promotionAlone" : "promotionCombinable")}
                  />
                ))}
              </div>
              {/* Under the list: what the last choice did, or the rule for the promotion that is used alone. */}
              {(() => {
                const alone = chosen.find((c) => c.stacking === "SINGLE");
                const text = dropNote
                  ? t(dropNote.pick.stacking === "SINGLE" ? "promotionDroppedByAlone" : "promotionDroppedAlone", { pick: L(dropNote.pick.title), names: dropNote.dropped.map((d) => L(d.title)).join(", ") })
                  : alone ? t("promotionAloneActive", { pick: L(alone.title) }) : null;
                return text ? <p role="status" data-testid="promo-note" className="rounded-lg bg-[var(--site-surface)] p-2.5 text-xs text-[var(--site-text)]">{text}</p> : null;
              })()}
            </fieldset>
          ) : null}
          {bill}
        </div>
      )}

      {step === "contact" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="bk-name" className="text-sm font-medium">{t("fullName")} <span aria-hidden>*</span></label>
            <Input id="bk-name" autoComplete="name" className={cn(fieldClass, guest && "bg-black/5")} aria-required aria-invalid={!!errors.fullName} readOnly={!!guest}
              aria-describedby={errors.fullName ? "bk-name-err" : undefined} {...register("fullName")} />
            {guest ? <p className="text-xs text-[var(--site-muted)]">{t("fromAccount")}</p> : null}
            {errors.fullName && <p id="bk-name-err" role="alert" className="text-xs text-red-700">{err("fullName")}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bk-email" className="text-sm font-medium">{t("email")} <span aria-hidden>*</span></label>
            <Input id="bk-email" type="email" autoComplete="email" className={cn(fieldClass, guest && "bg-black/5")} aria-required aria-invalid={!!errors.email} readOnly={!!guest}
              aria-describedby={errors.email ? "bk-email-err" : undefined} {...register("email")} />
            {guest ? <p className="text-xs text-[var(--site-muted)]">{t("fromAccount")}</p> : null}
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
            <label htmlFor="bk-phone" className="text-sm font-medium">{t("phone")} <span aria-hidden>*</span></label>
            <Input id="bk-phone" type="tel" autoComplete="tel" className={fieldClass} aria-required aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "bk-phone-err" : undefined} {...register("phone")} />
            <p className="text-xs text-[var(--site-muted)]">{t("phoneHint")}</p>
            {errors.phone && <p id="bk-phone-err" role="alert" className="text-xs text-red-700">{err("phone")}</p>}
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
            {workshop.address ? (
              <>
                <dt className="text-[var(--site-muted)]">{t("where")}</dt>
                <dd className="font-medium" data-testid="booking-summary-address">
                  {workshop.address}
                  {workshop.addressNote ? <span className="mt-0.5 block whitespace-pre-line text-xs font-normal text-[var(--site-muted)]" data-testid="booking-summary-address-note">{workshop.addressNote}</span> : null}
                </dd>
              </>
            ) : null}
            <dt className="text-[var(--site-muted)]">{t("guests")}</dt><dd className="font-medium">{quantity}</dd>
            <dt className="text-[var(--site-muted)]">{t("contactLabel")}</dt><dd className="font-medium break-all">{watchedName} · {watchedEmail}</dd>
          </dl>
          {bill}
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

      {step === "otp" && (
        <div className="space-y-3" data-testid="otp-step">
          <p className="text-sm">{t("otpIntro", { email: watchedEmail.trim().toLowerCase() })}</p>
          <div className="space-y-1.5">
            <label htmlFor="bk-otp" className="text-sm font-medium">{t("otpLabel")} <span aria-hidden>*</span></label>
            <Input
              id="bk-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={OTP_LENGTH + 4} className={cn(fieldClass, "tracking-[0.4em]")}
              value={otpCode} disabled={otpState === "locked" || submitting} aria-required aria-invalid={otpState === "wrong"}
              aria-describedby="bk-otp-hint" onChange={(e) => { setOtpCode(cleanOtp(e.target.value)); if (otpState === "wrong") setOtpState("idle"); }}
            />
            <p id="bk-otp-hint" className="text-xs text-[var(--site-muted)]">{t("otpHint", { length: OTP_LENGTH })}</p>
            {process.env.NODE_ENV !== "production" && shop.demoOtp ? <p className="text-xs text-[var(--site-muted)]" data-testid="otp-demo">{t("otpDemo", { code: DEMO_OTP })}</p> : null}
          </div>
          {otpState === "wrong" ? <p role="alert" className="text-sm text-red-700">{t("otpWrong", { left: OTP_MAX_ATTEMPTS - attempts })}</p> : null}
          {otpState === "locked" ? <p role="alert" className="text-sm text-red-700">{t("otpLocked")}</p> : null}
          {submitError && <p role="alert" className="text-sm text-red-700">{t("submitError")}</p>}
          <button type="button" className={cn(secondaryBtn, "w-full sm:w-auto")} onClick={() => void resend()} disabled={cooldown > 0 || submitting}>
            {cooldown > 0 ? t("otpResendIn", { seconds: cooldown }) : t("otpResend")}
          </button>
        </div>
      )}

      {step !== "confirm" && step !== "otp" ? (
        <p role="note" data-testid="booking-notice" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">{t("accuracyNotice")}</p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {stepIndex > 0 ? (
          <button type="button" className={secondaryBtn} onClick={() => setStep(STEPS[stepIndex - 1]!)} disabled={submitting}>{t("back")}</button>
        ) : <span />}
        {step === "confirm" ? (
          <button type="submit" className={primaryBtn} disabled={submitting}>{submitting ? t("sendingCode") : t("confirmBooking")}</button>
        ) : step === "otp" ? (
          <button type="submit" className={primaryBtn} disabled={submitting || !isOtpComplete(otpCode) || otpState === "locked"}>{submitting ? t("submitting") : t("verifyOtp")}</button>
        ) : (
          <button type="button" className={primaryBtn} onClick={next} disabled={!canNext}>{t("next")}</button>
        )}
      </div>
    </form>
  );
}
