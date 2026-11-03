"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { formatMoney, type Locale } from "@workshop/shared";
import { formatDateTime } from "@/lib/format";
import type { Shop } from "@/lib/types";
import { safeMaps } from "@/components/sections/safe-url";
import { readSimulatedBooking, type ConfirmationData } from "./simulate";

export type ConfirmationShop = Pick<Shop, "name" | "address" | "mapsUrl" | "contactEmail" | "contactPhone">;

export function BookingConfirmation({ data, shop, locale, homeHref }: { data: ConfirmationData; shop: ConfirmationShop; locale: Locale; homeHref: string }) {
  const t = useTranslations("site");
  const maps = safeMaps(shop.mapsUrl);
  return (
    <article className="mx-auto w-full max-w-xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{t("confirmation.title")}</h1>
        <p className="text-[var(--site-muted)]">{t("confirmation.intro", { shop: shop.name })}</p>
      </header>

      {data.status === "NOT_CONFIRMED" ? (
        <section role="status" data-testid="booking-pending" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">{t("confirmation.pendingTitle")}</h2>
          <p className="mt-1">{t("confirmation.pendingText", { email: data.email })}</p>
          {data.demoConfirmUrl ? (
            // Demo only: there is no mailbox in the prototype, so the link of the email is offered here.
            <p className="mt-2 text-xs"><span className="font-medium">{t("confirmation.demoNote")}</span>{" "}
              <a href={data.demoConfirmUrl} data-testid="demo-confirm-link" className="underline underline-offset-4">{t("confirmation.demoLink")}</a>
              {data.demoEmailUrl ? (<>{" · "}<a href={data.demoEmailUrl} target="_blank" rel="noopener noreferrer" data-testid="demo-email-link" className="underline underline-offset-4">{t("confirmation.demoEmail")}</a></>) : null}</p>
          ) : null}
        </section>
      ) : data.status ? (
        <section role="status" data-testid="booking-confirmed" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">{t("confirmation.confirmedNote")}</p>
        </section>
      ) : null}

      <section aria-labelledby="bk-code-label" className="rounded-xl border-2 border-[var(--site-primary)] bg-[var(--site-surface)] p-4 text-center">
        <p id="bk-code-label" className="text-sm text-[var(--site-muted)]">{t("confirmation.code")}</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-widest">{data.code}</p>
      </section>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-[var(--site-muted)]">{t("confirmation.workshop")}</dt><dd className="font-medium">{data.workshopTitle}</dd>
        <dt className="text-[var(--site-muted)]">{t("confirmation.when")}</dt>
        <dd className="font-medium">{formatDateTime(data.startsAt, data.timezone, locale)} <span className="text-[var(--site-muted)]">({data.timezone})</span></dd>
        <dt className="text-[var(--site-muted)]">{t("confirmation.guests")}</dt><dd className="font-medium">{data.quantity}</dd>
        {data.promotions && data.promotions.length > 0 ? (
          <>
            <dt className="text-[var(--site-muted)]">{t("confirmation.promotions")}</dt>
            <dd className="font-medium">{data.promotions.join(", ")} <span className="text-[var(--site-muted)]">({t("confirmation.saved", { amount: formatMoney(data.discountAmount ?? 0, data.currency, locale) })})</span></dd>
          </>
        ) : null}
        <dt className="text-[var(--site-muted)]">{t("confirmation.total")}</dt>
        <dd className="font-medium">{formatMoney(data.totalAmount, data.currency, locale)} · {t("confirmation.payAtStudio")}</dd>
      </dl>

      <section className="space-y-1 text-sm">
        <h2 className="font-semibold">{t("confirmation.where")}</h2>
        <p className="whitespace-pre-line">{shop.address}</p>
        {maps ? (
          <a href={maps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--site-primary)] underline underline-offset-4">
            {t("sections.openMap")}<ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
      </section>

      <section className="rounded-lg border border-black/15 p-4 text-sm">
        <h2 className="font-semibold">{t("latePolicy.title")}</h2>
        <p className="mt-1 text-[var(--site-muted)]">{t("latePolicy.text")}</p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="font-semibold">{t("confirmation.contact")}</h2>
        <p>{shop.contactEmail}</p>
        <p>{shop.contactPhone}</p>
        <p className="pt-2 text-[var(--site-muted)]">{t("confirmation.changeOrCancel")}</p>
      </section>

      <a href={homeHref} className="inline-flex min-h-11 items-center rounded-lg border border-black/20 bg-white px-5 py-2 text-sm font-medium text-zinc-900 outline-none focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]/40">
        {t("confirmation.backToSite")}
      </a>
    </article>
  );
}

export function BookingNotFound({ homeHref }: { homeHref: string }) {
  const t = useTranslations("site");
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{t("confirmation.notFoundTitle")}</h1>
      <p className="text-[var(--site-muted)]">{t("confirmation.notFoundText")}</p>
      <a href={homeHref} className="inline-flex min-h-11 items-center rounded-lg border border-black/20 bg-white px-5 py-2 text-sm font-medium text-zinc-900">{t("confirmation.backToSite")}</a>
    </div>
  );
}

const noopSubscribe = () => () => {};

/** Confirmation for a booking created by the simulated flow (kept in sessionStorage). Requires the matching email. */
export function SimulatedBookingConfirmation({ code, email, shop, locale, homeHref }: {
  code: string; email: string; shop: ConfirmationShop; locale: Locale; homeHref: string;
}) {
  const raw = useSyncExternalStore(noopSubscribe, () => readSimulatedBooking(code) ?? "", () => null);
  if (raw === null) return <div className="mx-auto max-w-xl px-4 py-16" aria-busy />;
  let data: ConfirmationData | null = null;
  try {
    data = raw ? (JSON.parse(raw) as ConfirmationData) : null;
  } catch {
    data = null;
  }
  if (!data || data.email !== email.trim().toLowerCase()) return <BookingNotFound homeHref={homeHref} />;
  return <BookingConfirmation data={data} shop={shop} locale={locale} homeHref={homeHref} />;
}

/** What the guest sees after opening the link of the confirmation email: confirmed, already confirmed, cancelled, or a link that is not valid. */
export function BookingLinkResult({ kind, code, homeHref }: { kind: "confirmed" | "already" | "cancelled" | "invalid"; code?: string; homeHref: string }) {
  const t = useTranslations("site");
  const ok = kind === "confirmed" || kind === "already";
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-16 text-center" data-testid={`link-${kind}`}>
      <h1 className="text-2xl font-bold">{t(`confirmLink.${kind}Title`)}</h1>
      <p className="text-[var(--site-muted)]">{t(`confirmLink.${kind}Text`)}</p>
      {ok && code ? <p className="font-mono text-2xl font-bold tracking-widest">{code}</p> : null}
      <a href={homeHref} className="inline-flex min-h-11 items-center rounded-lg border border-black/20 bg-white px-5 py-2 text-sm font-medium text-zinc-900">{t("confirmation.backToSite")}</a>
    </div>
  );
}
