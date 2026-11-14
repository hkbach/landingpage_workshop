import { notFound } from "next/navigation";
import { BookingDetail } from "@/components/ops/booking-detail";
import { apiGet } from "@/lib/api-server";
import { loadOwnShop } from "@/lib/own-shop";
import { toBooking, toCustomer, toSession } from "@/lib/own-ops";
import { fetchAll } from "@/lib/shop-data";

export default async function BookingDetailPage(props: PageProps<"/shopowner/[slug]/bookings/[id]">) {
  const { id } = await props.params;
  const [shop, raw] = await Promise.all([loadOwnShop(), apiGet<Parameters<typeof toBooking>[0] & { payments?: Array<{ id: string; type: "PAYMENT" | "REVERSAL"; amount: number; method: "CASH" | "CARD" | "BANK_TRANSFER" | "E_WALLET" | "OTHER"; note: string | null; recordedAt: string }> }>(`/bookings/${encodeURIComponent(id)}`)]); // (at once: the booking does not need the shop)
  if (!shop || !raw) notFound();
  const base = toBooking(raw, shop);
  // The detail has every entry of the ledger: a refund is a "reversal" on the server.
  const booking = raw.payments ? { ...base, payments: raw.payments.map((p) => ({ id: p.id, type: p.type === "PAYMENT" ? "PAYMENT" as const : "REFUND" as const, amount: p.amount, method: p.method, ...(p.note ? { note: p.note } : {}), recordedAt: p.recordedAt, recordedBy: "" })) } : base;
  const [sessions, others, customer] = await Promise.all([
    fetchAll<Parameters<typeof toSession>[0]>(`/sessions?workshopId=${booking.workshopId}`),
    fetchAll<Parameters<typeof toBooking>[0]>(`/bookings?workshopId=${encodeURIComponent(booking.workshopId)}`),
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
