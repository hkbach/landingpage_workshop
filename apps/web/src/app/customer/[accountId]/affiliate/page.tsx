import { CustomerAffiliatePage } from "@/components/customer/customer-affiliate-page";
import { listedShops } from "@/lib/mock/customer-listing";
import { realApi } from "@/lib/api-server";
import { loadListedShops } from "@/lib/own-customer";

// The Affiliate page: tab Program (the active workshops, each with Register Affiliate and then Copy Affiliate link) and tab Affiliate link (the links made, with their status).
export const dynamic = "force-dynamic";

export default async function CustomerAffiliateRoute({ params }: PageProps<"/customer/[accountId]/affiliate">) {
  if (realApi()) {
    const { accountId } = await params;
    return <CustomerAffiliatePage shops={await loadListedShops(accountId)} />;
  }
  return <CustomerAffiliatePage shops={listedShops()} />;
}
