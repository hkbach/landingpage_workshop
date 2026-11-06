import { CustomerAffiliatePage } from "@/components/customer/customer-affiliate-page";
import { listedShops } from "@/lib/mock/customer-listing";

// The Affiliate page: tab Program (the active workshops, each with Register Affiliate and then Copy Affiliate link) and tab Affiliate link (the links made, with their status).
export const dynamic = "force-dynamic";

export default function CustomerAffiliateRoute() {
  return <CustomerAffiliatePage shops={listedShops()} />;
}
