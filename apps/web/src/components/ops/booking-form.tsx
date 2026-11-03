"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { BOOKING_SOURCES, formatMoney, pickLocalized, resolveShopLocale, type Locale, nextBookingCode } from "@workshop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Booking, Customer, Session, Workshop } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { issuesToErrors } from "./validation";
import { useDirty } from "@/lib/use-dirty";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

type ManualSource = "WALK_IN" | "PHONE" | "OTHER";
const MANUAL_SOURCES = BOOKING_SOURCES.filter((s): s is ManualSource => s !== "ONLINE");

/** FR-OPS-02: manual booking (walk-in / phone / other). Email optional for WALK_IN. Price is shown as an estimate only. */
export function BookingForm({
  sessions, workshops, shop, initialSessionId, nowIso, bookingCodes,
}: {
  nowIso: string;
  sessions: Session[]; workshops: Workshop[]; shop: { timezone: string; defaultLocale: Locale; enabledLocales: Locale[] };
  initialSessionId?: string;
  /** The booking codes already given, so the next one of a session follows them. */
  bookingCodes: string[];
}) {
  const t = useTranslations("ops");
  const locale = useLocale() as Locale;
  const seq = useRef(0);
  const given = useRef<string[]>([]); // the codes this form has given
  const wsOf = (id: string) => workshops.find((w) => w.id === id);

  // Open sessions with room; already-started sessions are allowed for walk-ins (FR-OPS-02).
  const options = useMemo(
    () => sessions.filter((s) => s.status === "RUNNING" && s.capacity - s.reservedCount > 0).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [sessions],
  );
  const [v, setV] = useState({
    sessionId: options.some((s) => s.id === initialSessionId) ? (initialSessionId as string) : "",
    quantity: "1", source: "WALK_IN" as ManualSource, fullName: "", email: "", phone: "", specialRequest: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = useDirty(v, "new");
  const [created, setCreated] = useState<{ code: string; booking: Booking; customer: Customer } | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((p) => ({ ...p, [k]: val })); setErrors((e) => ({ ...e, [k]: "" })); };

  const session = options.find((s) => s.id === v.sessionId);
  const workshop = session ? wsOf(session.workshopId) : undefined;
  const remaining = session ? session.capacity - session.reservedCount : 0;
  const maxQty = workshop ? Math.min(workshop.maxPerBooking, remaining) : 1;
  const qty = Number(v.quantity);

  function submit(e: FormEvent) {
    e.preventDefault();
    const schema = z.object({
      sessionId: z.string().min(1, "errors.sessionRequired"),
      quantity: z.number("errors.quantityInvalid").int("errors.quantityInvalid").min(1, "errors.quantityInvalid").max(Math.max(1, maxQty), "errors.quantityMax"),
      source: z.enum(MANUAL_SOURCES),
      fullName: z.string().trim().min(1, "errors.required").max(120, "errors.tooLong"),
      email: z.string().trim().max(254, "errors.tooLong"),
      phone: z.string().trim().max(40, "errors.tooLong"),
      specialRequest: z.string().trim().max(500, "errors.tooLong"),
    }).superRefine((d, ctx) => {
      const email = d.email.trim();
      if (!email && d.source !== "WALK_IN") ctx.addIssue({ code: "custom", path: ["email"], message: "errors.emailRequired" });
      if (email && !z.email().safeParse(email).success) ctx.addIssue({ code: "custom", path: ["email"], message: "errors.emailInvalid" });
    });
    const parsed = schema.safeParse({ ...v, quantity: v.quantity.trim() === "" ? NaN : qty });
    if (!parsed.success || !session || !workshop) return setErrors(parsed.success ? { sessionId: "errors.sessionRequired" } : issuesToErrors(parsed.error));
    const d = parsed.data;
    const now = new Date().toISOString();
    const customer: Customer = {
      id: `cu-local-${++seq.current}`, fullName: d.fullName, email: d.email.trim().toLowerCase() || undefined,
      phone: d.phone || undefined, preferredLocale: shop.defaultLocale, // no account: the shop knows neither the country nor the birth date
    };
    const booking: Booking = {
      id: `bk-local-${++seq.current}`, bookingCode: nextBookingCode(session.code, [...bookingCodes, ...given.current], session.reservedCount + 1), sessionId: session.id, workshopId: workshop.id, customerId: customer.id,
      source: d.source, quantity: d.quantity, status: "CONFIRMED", paymentStatus: "UNPAID", unitPriceAmount: workshop.priceAmount,
      totalAmount: workshop.priceAmount * d.quantity, currency: workshop.currency,
      workshopTitle: pickLocalized(workshop.title, shop.defaultLocale, shop.defaultLocale), startsAt: session.startsAt, endsAt: session.endsAt,
      timezone: shop.timezone, specialRequest: d.specialRequest || undefined, createdAt: now, payments: [],
    };
    given.current.push(booking.bookingCode);
    setCreated({ code: booking.bookingCode, booking, customer });
  }

  const err = (k: string) => (errors[k] ? t(errors[k]) : undefined);
  const started = session ? new Date(session.startsAt).getTime() <= new Date(nowIso).getTime() : false;

  if (created) {
    return (
      <div className="grid max-w-xl gap-4">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("newBooking.title")}</h1>
        <Card>
          <CardContent className="grid gap-3" role="status">
            <p className="font-medium">{t("newBooking.created")}</p>
            <p className="text-sm">{t("newBooking.code")}: <span className="font-mono font-semibold">{created.code}</span></p>
            <p className="text-sm text-muted-foreground">{t("newBooking.simulated")}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { setCreated(null); setV((p) => ({ ...p, fullName: "", email: "", phone: "", specialRequest: "", quantity: "1" })); }}>
                {t("newBooking.another")}
              </Button>
              <ShopLink href="/shopowner/bookings" className={buttonVariants({ variant: "outline" })}>{t("bookings.title")}</ShopLink>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t("newBooking.title")}</h1>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Card>
          <CardContent className="grid gap-4">
            <Field id="nb-session" label={t("bookings.session")} required error={err("sessionId")}
              hint={t("common.tzNote", { tz: shop.timezone })}>
              {(p) => (
                <NativeSelect {...p} value={v.sessionId} onChange={(e) => set("sessionId", e.target.value)}
                  options={[
                    { value: "", label: t("newBooking.chooseSession") },
                    ...options.map((s) => ({
                      value: s.id,
                      label: `${formatDateTime(s.startsAt, shop.timezone, locale)} | ${pickLocalized(wsOf(s.workshopId)?.title, resolveShopLocale(locale, shop.enabledLocales, shop.defaultLocale), shop.defaultLocale)} | ${t("reschedule.left", { count: s.capacity - s.reservedCount })}`,
                    })),
                  ]} />
              )}
            </Field>
            {started ? <p className="text-xs text-muted-foreground">{t("newBooking.startedNote")}</p> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="nb-qty" label={t("common.guestsLabel")} required error={err("quantity")}
                hint={session ? t("newBooking.maxHint", { max: maxQty }) : undefined}>
                {(p) => <Input {...p} type="number" min={1} max={Math.max(1, maxQty)} inputMode="numeric" value={v.quantity} onChange={(e) => set("quantity", e.target.value)} />}
              </Field>
              <Field id="nb-source" label={t("detail.source")} required>
                {(p) => (
                  <NativeSelect {...p} value={v.source} onChange={(e) => set("source", e.target.value as ManualSource)}
                    options={MANUAL_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) }))} />
                )}
              </Field>
            </div>
            {workshop && Number.isInteger(qty) && qty > 0 ? (
              <p className="text-sm" aria-live="polite">
                {t("newBooking.estimate", { total: formatMoney(workshop.priceAmount * qty, workshop.currency, locale) })}
                <span className="block text-xs text-muted-foreground">{t("newBooking.estimateNote")}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="nb-name" label={t("customers.name")} required error={err("fullName")} className="sm:col-span-2">
              {(p) => <Input {...p} autoComplete="off" value={v.fullName} onChange={(e) => set("fullName", e.target.value)} />}
            </Field>
            <Field id="nb-email" label={t("customers.email")} required={v.source !== "WALK_IN"} error={err("email")}
              hint={v.source === "WALK_IN" ? t("newBooking.emailOptional") : undefined}>
              {(p) => <Input {...p} type="text" inputMode="email" autoComplete="off" value={v.email} onChange={(e) => set("email", e.target.value)} />}
            </Field>
            <Field id="nb-phone" label={t("customers.phone")}>
              {(p) => <Input {...p} type="tel" autoComplete="off" value={v.phone} onChange={(e) => set("phone", e.target.value)} />}
            </Field>
            <Field id="nb-req" label={t("common.request")} error={err("specialRequest")} className="sm:col-span-2">
              {(p) => <Textarea {...p} maxLength={500} value={v.specialRequest} onChange={(e) => set("specialRequest", e.target.value)} />}
            </Field>
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button type="submit" disabled={!dirty}>{t("newBooking.submit")}</Button>
          <ShopLink href="/shopowner/bookings" className={buttonVariants({ variant: "outline" })}>{t("common.back")}</ShopLink>
        </div>
      </form>
    </div>
  );
}
