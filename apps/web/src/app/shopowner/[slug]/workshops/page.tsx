import { getLocale, getTranslations } from "next-intl/server";
import { MapPin, Tag } from "lucide-react";
import { formatMoney, ownAddressNote, pickLocalized, resolveShopLocale, workshopAddress, workshopPromotions, type Locale } from "@workshop/shared";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { NewWorkshopDialog } from "@/components/catalog/new-workshop-dialog";
import { WorkshopsTable } from "@/components/catalog/workshops-table";
import { WorkshopRowActions } from "@/components/catalog/workshop-row-actions";
import { WorkshopTitleButton } from "@/components/catalog/workshop-title-button";
import { WorkshopStatusBadge } from "@/components/catalog/workshop-status-badge";
import { safeImage } from "@/components/sections/safe-url";
import { formatDate } from "@/lib/format";
import { ShopLink } from "@/components/dashboard/shell/shop-link";
import { loadOwnShop } from "@/lib/own-shop";
import { ownPromotions, ownScheduleRules, ownWorkshops } from "@/lib/own-catalog";
import { notFound } from "next/navigation";

export default async function WorkshopsPage() {
  const t = await getTranslations("catalog");
  const locale = (await getLocale()) as Locale;
  // The shop, its workshops (with how many sessions are open), its promotions and its schedule rules come from the server.
  // the shop, the workshops and the bookings at once; then the promotions (they need the timezone) and the rules of every workshop at once
  const [own, workshopList] = await Promise.all([loadOwnShop(), ownWorkshops()]);
  if (!own) notFound();
  const currentShop = own;
  const displayLocale = resolveShopLocale(locale, currentShop.enabledLocales, currentShop.defaultLocale);
  const rows = workshopList.sort((a, b) => a.sortOrder - b.sortOrder);
  const [{ promotions, today }, rulePairs] = await Promise.all([
    ownPromotions(own.timezone),
    Promise.all(rows.map(async (w) => [w.id, await ownScheduleRules(w.id)] as const)),
  ]);
  const ruleList = new Map(rulePairs);
  const shop = { currency: currentShop.currency, timezone: currentShop.timezone, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales, address: currentShop.address, viaApi: true };
  const stateOf = (w: (typeof rows)[number]): { open: number; total: number } => w.sessions;
  /** What the popup of a workshop needs (its details, schedule rules and number of bookings). */
  const editData = (w: (typeof rows)[number]) => ({ workshop: w, rules: ruleList.get(w.id) ?? [], bookingCount: w.bookingCount ?? 0, shop });
  const title = (p: { title: Parameters<typeof pickLocalized>[0] }) => pickLocalized(p.title, displayLocale, currentShop.defaultLocale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  // Business dates of a promotion: shown as plain calendar days, whatever the timezone.
  const day = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  // One entry per workshop: what the filters need (the name in every language, the status) and its table row, built here on the server.
  const items = rows.map((w) => {
    const promo = workshopPromotions(w, promotions, today);
    const money = (n: number) => formatMoney(n, w.currency, locale);
    const counts = stateOf(w);
    const activeSessions = counts.open;
    return {
      id: w.id, status: w.status, search: Object.values(w.title).join(" "),
      row: (
        <TableRow key={w.id}>
          <TableCell>
            <WorkshopTitleButton data={editData(w)} title={pickLocalized(w.title, displayLocale, currentShop.defaultLocale)} />
            {/* Price, duration and capacity under the name of the workshop. */}
            <p className="mt-0.5 text-xs text-muted-foreground" data-testid="workshop-facts">
              {t("list.pricePerGuest", { price: money(w.priceAmount) })} · {t("list.minutes", { n: w.durationMinutes })} · {t("list.seats", { count: w.defaultCapacity })}
            </p>
            {/* Where it takes place: its own address, or the shop's. */}
            <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground" data-testid="workshop-address">
              <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              <span><span className="sr-only">{t("list.address")}: </span>{workshopAddress(w, currentShop.address)}</span>
            </p>
            {ownAddressNote(w) ? <p className="whitespace-pre-line text-xs text-muted-foreground" data-testid="workshop-address-note"><span className="sr-only">{t("list.addressNote")}: </span>{ownAddressNote(w)}</p> : null}
            <p className="text-xs text-muted-foreground" data-testid="workshop-created-at">{t("list.created", { date: formatDate(w.createdAt, currentShop.timezone, locale) })}</p>
            <div className="mt-1.5"><WorkshopStatusBadge status={w.status} /></div>
            {/* The thumbnail of the workshop (its cover image) closes the cell. */}
            {safeImage(w.coverUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={safeImage(w.coverUrl)} alt="" data-testid="workshop-thumbnail" loading="lazy" className="mt-2 aspect-[3/2] w-32 rounded-md object-cover" />
            ) : null}
          </TableCell>
          <TableCell className="whitespace-nowrap tabular-nums" data-testid="workshop-active-sessions">
            <span className="font-medium">{activeSessions}</span> <span className="text-xs text-muted-foreground">{t("list.ofTotal", { total: counts.total })}</span>
          </TableCell>
          <TableCell className="min-w-64 whitespace-normal" data-testid="workshop-promotions">
            {promo.applicable.length === 0 ? (
              <span className="text-sm text-muted-foreground">{t("list.noPromotions")}</span>
            ) : (
              <ul className="grid content-start gap-1.5">
                {promo.applicable.map((p) => (
                  <li key={p.id} className="text-sm">
                    <span className="font-medium">{title(p)}</span>{" "}
                    <span className="text-muted-foreground">
                      · {p.discountType === "PERCENT" ? t("list.offPercent", { value: p.discountValue }) : t("list.offAmount", { amount: money(p.discountValue) })}
                      {" · "}{t(p.stacking === "SINGLE" ? "list.alone" : "list.combinable")}
                    </span>
                    <span className="block text-xs text-muted-foreground" data-testid="promotion-period">
                      {t("list.validRange", { from: day(p.startDate), to: day(p.endDate) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TableCell>
          <TableCell className="min-w-56 whitespace-normal" data-testid="workshop-max-discount">
            {promo.combined.discount.amount === 0 && promo.alone.length === 0 ? (
              <span className="text-muted-foreground">–</span>
            ) : (
              <div className="grid gap-3 text-sm">
                {/* Everything that can be combined, applied together. */}
                {promo.combined.promotions.length > 0 ? (
                  <div className="grid gap-0.5" data-testid="workshop-combined-discount">
                    <span className="text-xs text-muted-foreground">{t("list.combinedLabel", { count: promo.combined.promotions.length })}</span>
                    <span className="font-semibold tabular-nums">
                      {t("list.maxValue", { amount: `−${money(promo.combined.discount.amount)}`, percent: percent.format(promo.combined.discount.percent / 100) })}
                    </span>
                    <span className="text-xs text-muted-foreground">{t("list.priceAfter", { amount: money(promo.combined.priceAfter) })}</span>
                  </div>
                ) : null}
                {/* Each promotion that must be used alone, with what it takes off on its own. */}
                {promo.alone.length > 0 ? (
                  <div className="grid gap-1" data-testid="workshop-alone-discounts">
                    <span className="text-xs text-muted-foreground">{t("list.aloneLabel")}</span>
                    <ul className="grid content-start gap-1.5">
                      {promo.alone.map((a) => (
                        <li key={a.promotion.id} className="grid gap-0">
                          <span className="text-xs">{title(a.promotion)}</span>
                          <span className="font-semibold tabular-nums">
                            {t("list.maxValue", { amount: `−${money(a.amount)}`, percent: percent.format(a.percent / 100) })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </TableCell>
          <TableCell className="min-w-56 whitespace-normal align-top">
            <WorkshopRowActions id={w.id} status={w.status} openSessions={activeSessions} edit={editData(w)} />
          </TableCell>
        </TableRow>
      ),
    };
  });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("list.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ShopLink href="/shopowner/promotions" className={buttonVariants({ variant: "outline" })}>
            <Tag aria-hidden="true" />
            {t("list.managePromotions")}
          </ShopLink>
          <NewWorkshopDialog shop={shop} />
        </div>
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t("list.empty")}</CardContent></Card>
      ) : (
        <WorkshopsTable items={items} />
      )}
    </div>
  );
}
