import { CustomerWorkshops } from "@/components/customer/customer-workshops";
import { listedShops } from "@/lib/mock/customer-listing";

// The workshops of every shop the platform administrator chose to list (see listedShops). Read per request: the seats and the promotions depend on the time.
export const dynamic = "force-dynamic";

export default function CustomerWorkshopsPage() {
  return <CustomerWorkshops shops={listedShops()} />;
}
