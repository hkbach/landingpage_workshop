import { liveBookings, liveCustomers } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { CustomersList } from "@/components/ops/customers-list";

export default function CustomersPage() {
  return <CustomersList customers={liveCustomers()} bookings={liveBookings()} timezone={currentShop.timezone} />;
}
