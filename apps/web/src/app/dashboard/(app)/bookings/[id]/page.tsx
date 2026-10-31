import { notFound } from "next/navigation";
import { bookings, currentShop, customers, sessions } from "@/lib/mock/data";
import { BookingDetail } from "@/components/ops/booking-detail";

export default async function BookingDetailPage(props: PageProps<"/dashboard/bookings/[id]">) {
  const { id } = await props.params;
  const booking = bookings.find((b) => b.id === id);
  if (!booking) notFound();
  return (
    <BookingDetail
      booking={booking}
      customer={customers.find((c) => c.id === booking.customerId)}
      sessions={sessions.filter((s) => s.workshopId === booking.workshopId)}
      nowIso={new Date().toISOString()}
      actor={currentShop.ownerName}
    />
  );
}
