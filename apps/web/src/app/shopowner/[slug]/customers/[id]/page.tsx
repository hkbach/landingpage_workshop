import { notFound } from "next/navigation";
import type { Customer } from "@/lib/types";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerBookingsTable } from "@/components/ops/customer-bookings-table";
import { ShopLink } from "@/components/dashboard/shell/shop-link";
import { apiGet } from "@/lib/api-server";
import { loadOwnShop } from "@/lib/own-shop";
import { toBooking, toCustomer } from "@/lib/own-ops";
import { fetchAll } from "@/lib/shop-data";

export default async function CustomerDetailPage(props: PageProps<"/shopowner/[slug]/customers/[id]">) {
  const { id } = await props.params;
  const own = await loadOwnShop();
  if (!own) notFound();
  const found = await apiGet<{ id: string; fullName: string; email: string; phone: string; country: string; preferredLocale: Customer["preferredLocale"] }>(`/customers/${encodeURIComponent(id)}`);
  const customer = found ? { ...toCustomer({ ...found, bookingCount: 0, lastBookingAt: null, createdAt: "" }), preferredLocale: found.preferredLocale } : undefined;
  if (!customer) notFound();
  const t = await getTranslations("ops");
  const locale = await getLocale();
  const all = (await fetchAll<Parameters<typeof toBooking>[0]>("/bookings")).filter((b) => b.customerId === customer.id).map((b) => toBooking(b, own));
  const history = all.filter((b) => b.customerId === customer.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); // newest booking first (FR-CUST-01)
  const tz = own.timezone;
  const regionName = new Intl.DisplayNames([locale], { type: "region" });
  const languageName = new Intl.DisplayNames([locale], { type: "language" });

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
            <dt className="text-muted-foreground">{t("customers.locale")}</dt><dd>{languageName.of(customer.preferredLocale) ?? customer.preferredLocale}</dd>
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
            <CustomerBookingsTable bookings={history} timezone={tz} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
