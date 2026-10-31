import { bookings, currentShop, customers } from "@/lib/mock/data";
import { CustomersList } from "@/components/ops/customers-list";

export default function CustomersPage() {
  return <CustomersList customers={customers} bookings={bookings} timezone={currentShop.timezone} />;
}
