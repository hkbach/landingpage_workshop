import { notFound } from "next/navigation";
import { liveBookings, liveCustomers, shopSessions } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { BookingDetail } from "@/components/ops/booking-detail";
import { apiGet, realApi } from "@/lib/api-server";
import { loadOwnShop } from "@/lib/own-shop";
import { toBooking, toCustomer, toSession } from "@/lib/own-ops";
import { fetchAll } from "@/lib/shop-data";

export default async function BookingDetailPage(props: PageProps<"/shopowner/[slug]/bookings/[id]">) {
  const { id } = await props.params;
  if (realApi()) {
    const shop = await loadOwnShop();
    const raw = shop ? await apiGet<Parameters<typeof toBooking>[0] & { payments?: Array<{ id: string; type: "PAYMENT" | "REVERSAL"; amount: number; method: "CASH" | "CARD" | "BANK_TRANSFER" | "E_WALLET" | "OTHER"; note: string | null; recordedAt: string }> }>(`/bookings/${encodeURIComponent(id)}`) : null;
    if (!shop || !raw) notFound();
    const base = toBooking(raw, shop);
    // The detail has every entry of the ledger: a refund is a "reversal" on the server.
    const booking = raw.payments ? { ...base, payments: raw.payments.map((p) => ({ id: p.id, type: p.type === "PAYMENT" ? "PAYMENT" as const : "REFUND" as const, amount: p.amount, method: p.method, ...(p.note ? { note: p.note } : {}), recordedAt: p.recordedAt, recordedBy: "" })) } : base;
    const [sessions, others, customer] = await Promise.all([
      fetchAll<Parameters<typeof toSession>[0]>(`/sessions?workshopId=${booking.workshopId}`),
      fetchAll<Parameters<typeof toBooking>[0]>("/bookings"),
      apiGet<Parameters<typeof toCustomer>[0]>(`/customers/${booking.customerId}`),
    ]);
    return (
      <BookingDetail
        viaApi booking={booking} customer={customer ? toCustomer(customer) : undefined} sessions={sessions.map(toSession)}
        otherBookings={others.filter((b) => b.workshop.id === booking.workshopId && b.id !== booking.id).map((b) => toBooking(b, shop))}
        nowIso={new Date().toISOString()} actor={shop.ownerName}
      />
    );
  }
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
