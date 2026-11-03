import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { formatMoney } from "@workshop/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ops/status-badges";
import { formatDateTime } from "@/lib/format";
import { liveBookings, liveCustomers } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

export default async function CustomerDetailPage(props: PageProps<"/shopowner/[slug]/customers/[id]">) {
  const { id } = await props.params;
  const customer = liveCustomers().find((c) => c.id === id);
  if (!customer) notFound();
  const t = await getTranslations("ops");
  const locale = await getLocale();
  const history = liveBookings().filter((b) => b.customerId === customer.id).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const tz = currentShop.timezone;
  const regionName = new Intl.DisplayNames([locale], { type: "region" });

  return (
    <div className="grid gap-4">
      <ShopLink href="/shopowner/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("customers.title")}
      </ShopLink>
      <h1 className="text-xl font-semibold sm:text-2xl">{customer.fullName}</h1>
      <Card>
        <CardHeader><CardTitle>{t("customers.details")}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("customers.email")}</dt><dd>{customer.email ?? t("common.noEmail")}</dd>
            <dt className="text-muted-foreground">{t("customers.phone")}</dt><dd>{customer.phone ?? "-"}</dd>
            <dt className="text-muted-foreground">{t("customers.country")}</dt><dd>{customer.account ? regionName.of(customer.account.country) ?? customer.account.country : t("customers.guest")}</dd>
            <dt className="text-muted-foreground">{t("customers.birthDate")}</dt>
            <dd>{customer.account ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${customer.account.birthDate}T12:00:00Z`)) : "-"}</dd>
            <dt className="text-muted-foreground">{t("customers.locale")}</dt><dd>{customer.preferredLocale}</dd>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{t("customers.perShop")}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("customers.history")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("common.tzNote", { tz })}</p>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("customers.noHistory")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("bookings.code")}</TableHead>
                  <TableHead>{t("bookings.workshop")}</TableHead>
                  <TableHead>{t("bookings.session")}</TableHead>
                  <TableHead>{t("bookings.status")}</TableHead>
                  <TableHead>{t("bookings.payment")}</TableHead>
                  <TableHead className="text-right">{t("payment.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell><ShopLink href={`/shopowner/bookings/${b.id}`} className="font-mono font-medium underline-offset-4 hover:underline">{b.bookingCode}</ShopLink></TableCell>
                    <TableCell>{b.workshopTitle}</TableCell>
                    <TableCell>{formatDateTime(b.startsAt, tz, locale)}</TableCell>
                    <TableCell><BookingStatusBadge status={b.status} /></TableCell>
                    <TableCell><PaymentStatusBadge status={b.paymentStatus} /></TableCell>
                    <TableCell className="text-right">{formatMoney(b.totalAmount, b.currency, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
