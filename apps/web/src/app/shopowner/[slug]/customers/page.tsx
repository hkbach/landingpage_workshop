import { liveBookings, liveCustomers } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { CustomersList } from "@/components/ops/customers-list";
import { realApi } from "@/lib/api-server";
import { loadOpsData } from "@/lib/own-ops";

export default async function CustomersPage() {
  if (realApi()) {
    const d = await loadOpsData();
    return <CustomersList customers={d.customers} bookings={d.bookings} timezone={d.shop.timezone} />;
  }
  return <CustomersList customers={liveCustomers()} bookings={liveBookings()} timezone={currentShop.timezone} />;
}
