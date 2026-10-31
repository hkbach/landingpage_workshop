import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { formatMoney, pickLocalized, resolveShopLocale, type Locale } from "@workshop/shared";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WorkshopStatusBadge } from "@/components/catalog/workshop-status-badge";
import { currentShop, workshops } from "@/lib/mock/data";

export default async function WorkshopsPage() {
  const t = await getTranslations("catalog");
  const locale = (await getLocale()) as Locale;
  const displayLocale = resolveShopLocale(locale, currentShop.enabledLocales, currentShop.defaultLocale);
  const rows = [...workshops].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("list.title")}</h1>
        <Link href="/dashboard/workshops/new" className={buttonVariants()}>
          <Plus aria-hidden="true" />
          {t("list.new")}
        </Link>
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t("list.empty")}</CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("form.title")}</TableHead>
                <TableHead>{t("form.status")}</TableHead>
                <TableHead>{t("list.price")}</TableHead>
                <TableHead>{t("list.duration")}</TableHead>
                <TableHead>{t("list.capacity")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <Link href={`/dashboard/workshops/${w.id}`} className="font-medium underline-offset-4 hover:underline">
                      {pickLocalized(w.title, displayLocale, currentShop.defaultLocale)}
                    </Link>
                  </TableCell>
                  <TableCell><WorkshopStatusBadge status={w.status} /></TableCell>
                  <TableCell>{formatMoney(w.priceAmount, w.currency, locale)}</TableCell>
                  <TableCell>{t("list.minutes", { n: w.durationMinutes })}</TableCell>
                  <TableCell>{w.defaultCapacity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
