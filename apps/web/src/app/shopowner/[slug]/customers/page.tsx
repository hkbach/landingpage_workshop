import { CustomersList } from "@/components/ops/customers-list";
import { loadOpsData } from "@/lib/own-ops";

export default async function CustomersPage() {
  const d = await loadOpsData();
  return <CustomersList customers={d.customers} bookings={d.bookings} timezone={d.shop.timezone} />;
}
