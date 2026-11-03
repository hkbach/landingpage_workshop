import { notFound } from "next/navigation";
import { liveBookings, liveCustomers, shopSessions } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { BookingDetail } from "@/components/ops/booking-detail";

export default async function BookingDetailPage(props: PageProps<"/shopowner/[slug]/bookings/[id]">) {
  const { id } = await props.params;
  const booking = liveBookings().find((b) => b.id === id);
  if (!booking) notFound();
  return (
    <BookingDetail
      booking={booking}
      customer={liveCustomers().find((c) => c.id === booking.customerId)}
      sessions={shopSessions().filter((s) => s.workshopId === booking.workshopId)}
      // The other bookings of the workshop: the seats they take count when the booking is moved to another session.
      otherBookings={liveBookings().filter((b) => b.workshopId === booking.workshopId && b.id !== booking.id)}
      nowIso={new Date().toISOString()}
      actor={currentShop.ownerName}
    />
  );
}
