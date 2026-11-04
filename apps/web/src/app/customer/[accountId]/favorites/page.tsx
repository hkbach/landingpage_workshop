import { CustomerWorkshops } from "@/components/customer/customer-workshops";
import { listedShops } from "@/lib/mock/customer-listing";

// The Workshops page with only the workshops the guest added to their favorites (the list of favorites is read in the browser, where it is kept).
export const dynamic = "force-dynamic";

export default function CustomerFavoritesPage() {
  return <CustomerWorkshops shops={listedShops()} mode="favorites" />;
}
