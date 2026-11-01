import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus, Tag } from "lucide-react";
import { formatMoney, pickLocalized, resolveShopLocale, workshopPromotions, type Locale } from "@workshop/shared";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WorkshopStatusBadge } from "@/components/catalog/workshop-status-badge";
import { currentShop, workshops } from "@/lib/mock/data";
import { allPromotions, shopToday } from "@/lib/mock/promotion-store";

export default async function WorkshopsPage() {
  const t = await getTranslations("catalog");
  const locale = (await getLocale()) as Locale;
  const displayLocale = resolveShopLocale(locale, currentShop.enabledLocales, currentShop.defaultLocale);
  const rows = [...workshops].sort((a, b) => a.sortOrder - b.sortOrder);
  // TODO(api): the promotions of this shop (organization_id), computed by the backend with the workshop list.
  const promotions = allPromotions();
  const today = shopToday();
  const title = (p: { title: Parameters<typeof pickLocalized>[0] }) => pickLocalized(p.title, displayLocale, currentShop.defaultLocale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  // Business dates of a promotion: shown as plain calendar days, whatever the timezone.
  const day = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("list.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/shopowner/promotions" className={buttonVariants({ variant: "outline" })}>
            <Tag aria-hidden="true" />
            {t("list.managePromotions")}
          </Link>
          <Link href="/shopowner/workshops/new" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            {t("list.new")}
          </Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t("list.empty")}</CardContent></Card>
      ) : (
        <Card>
          <Table data-testid="workshops-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("form.title")}</TableHead>
                <TableHead>{t("form.status")}</TableHead>
                <TableHead>{t("list.price")}</TableHead>
                <TableHead>{t("list.duration")}</TableHead>
                <TableHead>{t("list.capacity")}</TableHead>
                <TableHead>{t("list.promotions")}</TableHead>
                <TableHead title={t("list.maxDiscountHint")}>{t("list.maxDiscount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => {
                const promo = workshopPromotions(w, promotions, today);
                const money = (n: number) => formatMoney(n, w.currency, locale);
                return (
                  <TableRow key={w.id}>
                    <TableCell>
                      <Link href={`/shopowner/workshops/${w.id}`} className="font-medium underline-offset-4 hover:underline">
                        {pickLocalized(w.title, displayLocale, currentShop.defaultLocale)}
                      </Link>
                    </TableCell>
                    <TableCell><WorkshopStatusBadge status={w.status} /></TableCell>
                    <TableCell>{formatMoney(w.priceAmount, w.currency, locale)}</TableCell>
                    <TableCell>{t("list.minutes", { n: w.durationMinutes })}</TableCell>
                    <TableCell>{w.defaultCapacity}</TableCell>
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
