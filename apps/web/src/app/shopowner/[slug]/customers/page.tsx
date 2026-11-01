import { liveBookings } from "@/lib/mock/booking-store";
import { currentShop, customers } from "@/lib/mock/data";
import { CustomersList } from "@/components/ops/customers-list";

export default function CustomersPage() {
  return <CustomersList customers={customers} bookings={liveBookings()} timezone={currentShop.timezone} />;
}
