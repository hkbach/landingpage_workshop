import { getLocale, getTranslations } from "next-intl/server";
import { Tag } from "lucide-react";
import { formatMoney, openSessionCount, pickLocalized, resolveShopLocale, workshopPromotions, type Locale } from "@workshop/shared";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NewWorkshopDialog } from "@/components/catalog/new-workshop-dialog";
import { WorkshopRowActions } from "@/components/catalog/workshop-row-actions";
import { WorkshopTitleButton } from "@/components/catalog/workshop-title-button";
import { WorkshopStatusBadge } from "@/components/catalog/workshop-status-badge";
import { safeImage } from "@/components/sections/safe-url";
import { currentShop, workshops } from "@/lib/mock/data";
import { allPromotions, shopToday } from "@/lib/mock/promotion-store";
import { ShopLink } from "@/components/dashboard/shell/shop-link";
import { liveBookings } from "@/lib/mock/booking-store";
import { scheduleRules } from "@/lib/mock/ops";
import { withWorkshopStatus, workshopSessionStatuses } from "@/lib/mock/workshop-status-store";

export default async function WorkshopsPage() {
  const t = await getTranslations("catalog");
  const locale = (await getLocale()) as Locale;
  const displayLocale = resolveShopLocale(locale, currentShop.enabledLocales, currentShop.defaultLocale);
  const rows = withWorkshopStatus(workshops).sort((a, b) => a.sortOrder - b.sortOrder);
  // TODO(api): the promotions of this shop (organization_id), computed by the backend with the workshop list.
  const promotions = allPromotions();
  const today = shopToday();
  const bookings = liveBookings();
  const shop = { currency: currentShop.currency, timezone: currentShop.timezone, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales };
  /** What the popup of a workshop needs (its details, schedule rules and number of bookings). */
  const editData = (w: (typeof rows)[number]) => ({ workshop: w, rules: scheduleRules.filter((r) => r.workshopId === w.id), bookingCount: bookings.filter((b) => b.workshopId === w.id).length, shop });
  const title = (p: { title: Parameters<typeof pickLocalized>[0] }) => pickLocalized(p.title, displayLocale, currentShop.defaultLocale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  // Business dates of a promotion: shown as plain calendar days, whatever the timezone.
  const day = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
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
        <Card>
          <Table data-testid="workshops-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("list.workshop")}</TableHead>
                <TableHead>{t("list.activeSessions")}</TableHead>
                <TableHead>{t("list.promotions")}</TableHead>
                <TableHead title={t("list.maxDiscountHint")}>{t("list.maxDiscount")}</TableHead>
                <TableHead>{t("list.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => {
                const promo = workshopPromotions(w, promotions, today);
                const money = (n: number) => formatMoney(n, w.currency, locale);
                const states = workshopSessionStatuses(w.id);
                const activeSessions = openSessionCount(states);
                return (
                  <TableRow key={w.id}>
                    <TableCell>
                      <WorkshopTitleButton data={editData(w)} title={pickLocalized(w.title, displayLocale, currentShop.defaultLocale)} />
                      {/* Price, duration and capacity under the name of the workshop. */}
                      <p className="mt-0.5 text-xs text-muted-foreground" data-testid="workshop-facts">
                        {t("list.pricePerGuest", { price: money(w.priceAmount) })} · {t("list.minutes", { n: w.durationMinutes })} · {t("list.seats", { count: w.defaultCapacity })}
                      </p>
                      <div className="mt-1.5"><WorkshopStatusBadge status={w.status} /></div>
                      {/* The thumbnail of the workshop (its cover image) closes the cell. */}
                      {safeImage(w.coverUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={safeImage(w.coverUrl)} alt="" data-testid="workshop-thumbnail" loading="lazy" className="mt-2 aspect-[3/2] w-32 rounded-md object-cover" />
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums" data-testid="workshop-active-sessions">
                      <span className="font-medium">{activeSessions}</span> <span className="text-xs text-muted-foreground">{t("list.ofTotal", { total: states.length })}</span>
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
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
