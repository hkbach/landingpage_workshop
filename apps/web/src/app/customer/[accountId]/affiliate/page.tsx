import { CustomerWorkshops } from "@/components/customer/customer-workshops";
import { listedShops } from "@/lib/mock/customer-listing";

// The Affiliate page: the same list as Workshops, where each workshop has Register Affiliate and then Copy Affiliate link (the link opens the booking of that workshop).
export const dynamic = "force-dynamic";

export default function CustomerAffiliatePage() {
  return <CustomerWorkshops shops={listedShops()} mode="affiliate" />;
}
