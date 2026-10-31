import { notFound } from "next/navigation";
import { WorkshopDetail } from "@/components/catalog/workshop-detail";
import { bookings, currentShop, workshops } from "@/lib/mock/data";
import { scheduleRules } from "@/lib/mock/ops";

export default async function WorkshopDetailPage(props: PageProps<"/shopowner/workshops/[id]">) {
  const { id } = await props.params;
  const workshop = workshops.find((w) => w.id === id);
  if (!workshop) notFound();
  return (
    <WorkshopDetail
      workshop={workshop}
      rules={scheduleRules.filter((r) => r.workshopId === workshop.id)}
      bookingCount={bookings.filter((b) => b.workshopId === workshop.id).length}
      shop={{ currency: currentShop.currency, timezone: currentShop.timezone, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales }}
    />
  );
}
