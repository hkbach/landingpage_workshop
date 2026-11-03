import { notFound } from "next/navigation";
import { liveBookings, liveCustomers } from "@/lib/mock/booking-store";
import { currentShop, sessions } from "@/lib/mock/data";
import { BookingDetail } from "@/components/ops/booking-detail";

export default async function BookingDetailPage(props: PageProps<"/shopowner/[slug]/bookings/[id]">) {
  const { id } = await props.params;
  const booking = liveBookings().find((b) => b.id === id);
  if (!booking) notFound();
  return (
    <BookingDetail
      booking={booking}
      customer={liveCustomers().find((c) => c.id === booking.customerId)}
      sessions={sessions.filter((s) => s.workshopId === booking.workshopId)}
      nowIso={new Date().toISOString()}
      actor={currentShop.ownerName}
    />
  );
}
